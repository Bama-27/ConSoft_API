"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.initSocket = initSocket;
const socket_io_1 = require("socket.io");
const env_1 = require("../config/env");
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const chatMessage_model_1 = require("../models/chatMessage.model");
const quotation_model_1 = require("../models/quotation.model");
const user_model_1 = require("../models/user.model");
const mailer_1 = require("../utils/mailer");
const dmMessage_model_1 = require("../models/dmMessage.model");
function initSocket(server) {
    const io = new socket_io_1.Server(server, {
        cors: {
            origin: env_1.env.frontendOrigins,
            credentials: true,
        },
    });
    function readTokenFromCookie(cookieHeader) {
        if (!cookieHeader)
            return null;
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
            const token = socket.handshake.auth?.token ||
                socket.handshake.query?.token ||
                readTokenFromCookie(socket.handshake.headers?.cookie);
            if (!token)
                return next(new Error('Unauthorized'));
            const decoded = jsonwebtoken_1.default.verify(token, env_1.env.jwt_secret);
            if (!decoded?.id)
                return next(new Error('Unauthorized'));
            // Cargar usuario con rol y permisos frescos
            const dbUser = await user_model_1.UserModel.findById(decoded.id)
                .select('email role')
                .populate({
                path: 'role',
                select: 'name permissions',
                populate: { path: 'permissions', model: 'Permiso', select: 'module action name' },
            })
                .lean();
            if (!dbUser)
                return next(new Error('Unauthorized'));
            socket.user = {
                id: String(decoded.id),
                email: dbUser.email,
                role: dbUser.role,
            };
            return next();
        }
        catch (err) {
            return next(new Error('Unauthorized'));
        }
    });
    io.on('connection', (socket) => {
        const user = socket.user;
        const joinedRooms = new Set();
        const isUserOnline = (userId) => {
            for (const [, s] of io.sockets.sockets) {
                const su = s.user;
                if (su && String(su.id) === String(userId))
                    return true;
            }
            return false;
        };
        const canAccessQuotation = async (quotationId) => {
            const quotation = await quotation_model_1.QuotationModel.findById(quotationId).select('user').populate('user', 'email');
            if (!quotation)
                return { ok: false };
            const ownerId = String(quotation.user?._id ?? quotation.user);
            if (ownerId === String(user.id))
                return { ok: true, ownerId, ownerEmail: quotation.user?.email };
            // Si no es dueño, permitimos si parece admin (posee permiso de ver cotizaciones)
            const perms = user.role?.permissions || [];
            const hasAdminPerm = perms.some((perm) => {
                if (typeof perm?.name === 'string') {
                    return perm.name === 'quotations.view' || perm.name === 'quotations.write' || perm.name === 'quotations.update';
                }
                if (typeof perm?.module === 'string' && typeof perm?.action === 'string') {
                    return perm.module === 'quotations' && (perm.action === 'view' || perm.action === 'write' || perm.action === 'update');
                }
                return false;
            });
            return hasAdminPerm ? { ok: true, ownerId, ownerEmail: quotation.user?.email } : { ok: false };
        };
        socket.on('quotation:join', ({ quotationId }) => {
            (async () => {
                if (!quotationId)
                    return;
                const access = await canAccessQuotation(quotationId);
                if (!access.ok)
                    return;
                const room = `q:${quotationId}`;
                socket.join(room);
                joinedRooms.add(room);
            })().catch(() => { });
        });
        // Direct messages (user to user)
        socket.on('dm:join', ({ userId: otherUserId }) => {
            try {
                if (!otherUserId)
                    return;
                const [a, b] = (0, dmMessage_model_1.buildParticipantsPair)(user.id, otherUserId);
                const room = `dm:${String(a)}:${String(b)}`;
                socket.join(room);
                joinedRooms.add(room);
            }
            catch {
                // ignore
            }
        });
        socket.on('dm:message', async (payload) => {
            try {
                if (!payload?.toUserId || !payload?.message)
                    return;
                const [a, b] = (0, dmMessage_model_1.buildParticipantsPair)(user.id, payload.toUserId);
                const room = `dm:${String(a)}:${String(b)}`;
                const msg = await dmMessage_model_1.DmMessageModel.create({
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
            }
            catch (_e) {
                // ignore
            }
        });
        socket.on('chat:message', async (payload) => {
            try {
                if (!payload?.quotationId || !payload?.message)
                    return;
                const access = await canAccessQuotation(payload.quotationId);
                if (!access.ok)
                    return;
                const msg = await chatMessage_model_1.ChatMessageModel.create({
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
                const linkBase = env_1.env.frontendOrigins[0] || 'http://localhost:3000/client';
                const link = `${linkBase}/notificaciones/${payload.quotationId}`;
                const isOwnerSender = access.ownerId && String(access.ownerId) === String(user.id);
                const ownerOnline = access.ownerId ? isUserOnline(access.ownerId) : false;
                if (!isOwnerSender && access.ownerEmail && !ownerOnline) {
                    await (0, mailer_1.sendEmail)({
                        to: access.ownerEmail,
                        subject: 'Tienes un nuevo mensaje',
                        text: `Tienes un nuevo mensaje en tu cotización. Ingresa aquí: ${link}`,
                        html: `<p>Tienes un nuevo mensaje en tu cotización.</p><p><a href="${link}">Ir a la página</a></p>`,
                    });
                }
            }
            catch (err) {
                // swallow
            }
        });
    });
    return io;
}
