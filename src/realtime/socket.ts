import { Server as HttpServer } from 'http';
import { Server } from 'socket.io';
import { env } from '../config/env';
import jwt from 'jsonwebtoken';
import { ChatMessageModel } from '../models/chatMessage.model';
import { QuotationModel } from '../models/quotation.model';
import { UserModel } from '../models/user.model';
import { sendEmail } from '../utils/mailer';
import { DmMessageModel, buildParticipantsPair } from '../models/dmMessage.model';

interface JwtPayload {
	id: string;
	email: string;
	role?: any;
}

export function initSocket(server: HttpServer) {
	const io = new Server(server, {
		cors: {
			origin: env.frontendOrigins,
			credentials: true,
		},
	});

	function readTokenFromCookie(cookieHeader?: string): string | null {
		if (!cookieHeader) return null;
		const parts = cookieHeader.split(';').map((c) => c.trim());
		for (const part of parts) {
			if (part.startsWith('token=')) {
				return decodeURIComponent(part.slice('token='.length));
			}
		}
		return null;
	}

	io.use(async (socket, next) => {
		try {
			const token =
				(socket.handshake.auth as any)?.token ||
				(socket.handshake.query as any)?.token ||
				readTokenFromCookie(socket.handshake.headers?.cookie as string | undefined);
			if (!token) return next(new Error('Unauthorized'));
			const decoded = jwt.verify(token, env.jwt_secret) as JwtPayload;
			if (!decoded?.id) return next(new Error('Unauthorized'));
			// Cargar usuario con rol y permisos frescos
			const dbUser = await UserModel.findById(decoded.id)
				.select('email role')
				.populate({
					path: 'role',
					select: 'name permissions',
					populate: { path: 'permissions', model: 'Permiso', select: 'module action name' },
				})
				.lean();
			if (!dbUser) return next(new Error('Unauthorized'));
			(socket as any).user = {
				id: String(decoded.id),
				email: dbUser.email,
				role: dbUser.role,
			};
			return next();
		} catch (err) {
			return next(new Error('Unauthorized'));
		}
	});

	io.on('connection', (socket) => {
		const user = (socket as any).user as JwtPayload;
		const joinedRooms = new Set<string>();

		const isUserOnline = (userId: string): boolean => {
			for (const [, s] of io.sockets.sockets) {
				const su = (s as any).user as JwtPayload | undefined;
				if (su && String(su.id) === String(userId)) return true;
			}
			return false;
		};

		const canAccessQuotation = async (quotationId: string): Promise<{ ok: boolean; ownerId?: string; ownerEmail?: string }> => {
			const quotation = await QuotationModel.findById(quotationId).select('user').populate('user', 'email');
			if (!quotation) return { ok: false };
			const ownerId = String((quotation.user as any)?._id ?? quotation.user);
			if (ownerId === String(user.id)) return { ok: true, ownerId, ownerEmail: (quotation.user as any)?.email };
			// Si no es dueño, permitimos si parece admin (posee permiso de ver cotizaciones)
			const perms = (user.role?.permissions as any[]) || [];
			const hasAdminPerm = perms.some((perm: any) => {
				if (typeof perm?.name === 'string') {
					return perm.name === 'quotations.view' || perm.name === 'quotations.write' || perm.name === 'quotations.update';
				}
				if (typeof perm?.module === 'string' && typeof perm?.action === 'string') {
					return perm.module === 'quotations' && (perm.action === 'view' || perm.action === 'write' || perm.action === 'update');
				}
				return false;
			});
			return hasAdminPerm ? { ok: true, ownerId, ownerEmail: (quotation.user as any)?.email } : { ok: false };
		};

		socket.on('quotation:join', ({ quotationId }: { quotationId: string }) => {
			(async () => {
				if (!quotationId) return;
				const access = await canAccessQuotation(quotationId);
				if (!access.ok) return;
				const room = `q:${quotationId}`;
				socket.join(room);
				joinedRooms.add(room);
			})().catch(() => {});
		});

		// Direct messages (user to user)
		socket.on('dm:join', ({ userId: otherUserId }: { userId: string }) => {
			try {
				if (!otherUserId) return;
				const [a, b] = buildParticipantsPair(user.id, otherUserId);
				const room = `dm:${String(a)}:${String(b)}`;
				socket.join(room);
				joinedRooms.add(room);
			} catch {
				// ignore
			}
		});

		socket.on('dm:message', async (payload: { toUserId: string; message: string }) => {
			try {
				if (!payload?.toUserId || !payload?.message) return;
				const [a, b] = buildParticipantsPair(user.id, payload.toUserId);
				const room = `dm:${String(a)}:${String(b)}`;
				const msg = await DmMessageModel.create({
					participants: [a, b],
					sender: user.id,
					message: payload.message,
				});
				// Emit to both participants' room
				socket.to(room).emit('dm:message', {
					_id: String(msg._id),
					from: user.id,
					to: payload.toUserId,
					message: payload.message,
					sentAt: msg.sentAt,
				});
				// Also emit back to sender for confirmation (if needed on client)
				socket.emit('dm:message', {
					_id: String(msg._id),
					from: user.id,
					to: payload.toUserId,
					message: payload.message,
					sentAt: msg.sentAt,
				});
			} catch (_e) {
				// ignore
			}
		});

		socket.on('chat:message', async (payload: { quotationId: string; message: string }) => {
			try {
				if (!payload?.quotationId || !payload?.message) return;
				const access = await canAccessQuotation(payload.quotationId);
				if (!access.ok) return;
				const msg = await ChatMessageModel.create({
					quotation: payload.quotationId,
					sender: user.id,
					message: payload.message,
				});
				io.to(`q:${payload.quotationId}`).emit('chat:message', {
					_id: String(msg._id),
					quotation: payload.quotationId,
					sender: user.id,
					message: payload.message,
					sentAt: msg.sentAt,
				});
				// Notificación por correo al cliente (dueño) solo si NO tiene sesión iniciada (no está online en socket)
				const linkBase = env.frontendOrigins[0] || 'http://localhost:3000/client';
				const link = `${linkBase}/notificaciones/${payload.quotationId}`;
				const isOwnerSender = access.ownerId && String(access.ownerId) === String(user.id);
				const ownerOnline = access.ownerId ? isUserOnline(access.ownerId) : false;
				if (!isOwnerSender && access.ownerEmail && !ownerOnline) {
					await sendEmail({
						to: access.ownerEmail,
						subject: 'Tienes un nuevo mensaje',
						text: `Tienes un nuevo mensaje en tu cotización. Ingresa aquí: ${link}`,
						html: `<p>Tienes un nuevo mensaje en tu cotización.</p><p><a href="${link}">Ir a la página</a></p>`,
					});
				}
			} catch (err) {
				// swallow
			}
		});
	});

	return io;
}


