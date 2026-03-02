import { Request, Response } from 'express';
import { IVisit, VisitModel } from '../models/visit.model';
import { createCrudController } from './crud.controller';
import { AuthRequest } from '../middlewares/auth.middleware';
import { Types } from 'mongoose';
import { sendEmail } from '../utils/mailer';
import { IUser } from '../types/interfaces';
import { templateService } from '../services/template.service';

const base = createCrudController(VisitModel);

function parseVisitDateTime(dateValue: unknown, timeValue: unknown): Date | null {
	if (!dateValue || !timeValue) return null;

	const combined = new Date(`${dateValue}T${timeValue}`);
	return Number.isNaN(combined.getTime()) ? null : combined;
}

function addHours(date: Date, hours: number): Date {
	const out = new Date(date);
	out.setHours(out.getHours() + hours);
	return out;
}

async function assertNoVisitOverlap(visitDate: Date) {
	// Regla: al agendar una cita a una hora, se bloquean automáticamente las próximas 2 horas.
	// Equivalentemente, una visita ocupa un bloque de 3 horas: [start, start+3h)
	const start = visitDate;
	const end = addHours(start, 3);
	const lowerBound = addHours(start, -3);

	const conflict = await VisitModel.findOne({
		visitDate: {
			$gt: lowerBound,
			$lt: end,
		},
		status: { $nin: ['cancelada', 'cancelado'] },
	}).select('_id visitDate');

	if (conflict) {
		const err: any = new Error('Time slot not available');
		err.status = 409;
		err.conflictVisitId = String(conflict._id);
		err.conflictVisitDate = conflict.visitDate;
		throw err;
	}
}

export const VisitController = {
	...base,

	list: async (req: Request, res: Response) => {
		const visits = await VisitModel.find().populate('user', 'name email'); // ✔ user es un ObjectId
		return res.json({ ok: true, visits });
	},

	get: async (req: Request, res: Response) => {
		const visit = await VisitModel.findById(req.params.id).populate('user', 'name email');
		if (!visit) return res.status(404).json({ message: 'Not found' });
		return res.json(visit);
	},

	createForMe: async (req: AuthRequest, res: Response) => {
		try {
			console.log(req.user);
			const userId = req.user?.id;
			console.log(userId);
			const {
				visitDate,
				visitTime,
				address,
				status,
				userName,
				userEmail,
				userPhone,
				description,
			} = req.body ?? {};

			// -------------------------
			// VALIDACIONES
			// -------------------------

			if (!visitDate) {
				return res.status(400).json({ message: 'visitDate is required' });
			}

			const parsedVisitDate = parseVisitDateTime(visitDate, visitTime);
			if (!parsedVisitDate) {
				return res.status(400).json({ message: 'visitDate is invalid' });
			}

			if (!address || typeof address !== 'string' || !address.trim()) {
				return res.status(400).json({ message: 'address is required' });
			}

			// Validación guest
			if (!userId) {
				if (!userName?.trim()) {
					return res
						.status(400)
						.json({ message: 'userName is required for guest visits' });
				}

				if (!userEmail?.trim()) {
					return res
						.status(400)
						.json({ message: 'userEmail is required for guest visits' });
				}

				const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
				if (!emailRegex.test(userEmail)) {
					return res.status(400).json({ message: 'Invalid email format' });
				}

				if (!userPhone?.trim()) {
					return res
						.status(400)
						.json({ message: 'userPhone is required for guest visits' });
				}
			}

			await assertNoVisitOverlap(parsedVisitDate);

			// -------------------------
			// CONSTRUCCIÓN DEL PAYLOAD
			// -------------------------

			const payload: Partial<IVisit> = {
				visitDate: parsedVisitDate,
				visitTime: visitTime || undefined,
				address: address.trim(),
				status: typeof status === 'string' ? status : 'pendiente',
				description: typeof description === 'string' ? description.trim() : undefined,
			};

			if (userId) {
				payload.user = new Types.ObjectId(userId);
			} else {
				payload.isGuest = true;
				payload.guestInfo = {
					name: userName.trim(),
					email: userEmail.trim(),
					phone: userPhone.trim(),
				};
			}

			// -------------------------
			// CREACIÓN
			// -------------------------
			const created = await VisitModel.create(payload);

			await created.populate<{ user: IUser }>('user', 'name email');

			const populated = created;

			// -------------------------
			// RESOLUCIÓN DE EMAIL
			// -------------------------

			let emailTo: string;
			let userNameForEmail: string;

			if (userId) {
				// Narrowing correcto
				if (!populated.user || populated.user instanceof Types.ObjectId) {
					throw new Error('User was not populated correctly');
				}

				emailTo = populated.user.email;
				userNameForEmail = populated.user.name;
			} else {
				emailTo = userEmail!;
				userNameForEmail = userName!;
			}

			// -------------------------
			// TEMPLATE
			// -------------------------

			const html = await templateService.render('visit-confirmation', {
				USER_NAME: userNameForEmail || 'Usuario',
				VISIT_DATE: parsedVisitDate.toLocaleDateString(),
				VISIT_TIME: visitTime || 'No especificada',
				ADDRESS: address,
				DESCRIPTION_BLOCK: description ? description : 'Sin descripcion',
				STATUS: payload.status,
				YEAR: new Date().getFullYear(),
			});

			try {
				await sendEmail({
					to: emailTo,
					subject: 'Confirmación de visita agendada',
					html,
				});
			} catch (mailError) {
				console.error('Email failed but visit was created:', mailError);
			}

			return res.status(201).json({
				ok: true,
				visit: populated,
				message: userId
					? 'Visit created successfully'
					: 'Visit created successfully. We will contact you soon.',
			});
		} catch (e: any) {
			if (e?.status === 409) {
				return res.status(409).json({
					message: 'Time slot not available',
					conflictVisitId: e.conflictVisitId,
					conflictVisitDate: e.conflictVisitDate,
				});
			}

			console.error('Error creating visit:', e);
			return res.status(500).json({
				error: 'Error creating visit',
				message: 'An unexpected error occurred. Please try again.',
			});
		}
	},

	// Crear visita (admin) con validación de solape
	create: async (req: AuthRequest, res: Response) => {
		try {
			const userId = req.user?.id;

			if (!userId) {
				return res.status(400).json({ message: 'user is required' });
			}

			const { visitDate, visitTime, address, status, description } = req.body ?? {};

			if (!visitDate) {
				return res.status(400).json({ message: 'visitDate is required' });
			}

			const parsedVisitDate = parseVisitDateTime(visitDate, visitTime);
			if (!parsedVisitDate) {
				return res.status(400).json({ message: 'visitDate is invalid' });
			}

			if (!address || typeof address !== 'string' || !address.trim()) {
				return res.status(400).json({ message: 'address is required' });
			}

			await assertNoVisitOverlap(parsedVisitDate);

			// -------------------------
			// CREACIÓN
			// -------------------------

			const created = await VisitModel.create({
				user: userId,
				visitDate: parsedVisitDate,
				visitTime: visitTime || undefined,
				address: address.trim(),
				status: typeof status === 'string' ? status : 'pendiente',
				description: typeof description === 'string' ? description.trim() : undefined,
			});

			// Populate correctamente (sin encadenar mal)
			await created.populate('user', 'name email');

			const populated = created;

			// -------------------------
			// ENVÍO DE EMAIL
			// -------------------------

			if (!populated.user || populated.user instanceof Types.ObjectId) {
				throw new Error('User was not populated correctly');
			}

			const emailTo = populated.user.email;
			const userNameForEmail = populated.user.name;

			const html = await templateService.render('visit-confirmation', {
				USER_NAME: userNameForEmail || 'Usuario',
				VISIT_DATE: parsedVisitDate.toLocaleDateString(),
				VISIT_TIME: visitTime || 'No especificada',
				ADDRESS: address,
				DESCRIPTION_BLOCK: description ? description : 'Sin descripción',
				STATUS: populated.status,
				YEAR: new Date().getFullYear(),
			});

			try {
				await sendEmail({
					to: emailTo,
					subject: 'Confirmación de visita agendada',
					html,
				});
			} catch (mailError) {
				console.error('Email failed but visit was created:', mailError);
				// No rompemos la creación si falla el correo
			}

			return res.status(201).json({
				ok: true,
				visit: populated,
			});
		} catch (e: any) {
			if (e?.status === 409) {
				return res.status(409).json({
					message: 'Time slot not available',
					conflictVisitId: e.conflictVisitId,
					conflictVisitDate: e.conflictVisitDate,
				});
			}

			console.error('Error creating visit:', e);
			return res.status(500).json({
				error: 'Error creating visit',
			});
		}
	},

	// Listar solo las visitas del usuario autenticado
	listMine: async (req: AuthRequest, res: Response) => {
		try {
			const userId = req.user?.id;
			if (!userId) return res.status(401).json({ message: 'Unauthorized' });
			const visits = await VisitModel.find({ user: userId })
				.sort({ visitDate: -1 })
				.populate('user', 'name email');
			return res.json({ ok: true, visits });
		} catch (e) {
			return res.status(500).json({ error: 'Error fetching visits' });
		}
	},

	// Consultar horas disponibles para una fecha específica
	getAvailableSlots: async (req: Request, res: Response) => {
		try {
			const { date } = req.query; // Esperamos YYYY-MM-DD
			if (!date || typeof date !== 'string') {
				return res.status(400).json({ message: 'date query parameter is required' });
			}

			// Definimos los slots posibles (por ejemplo de 08:00 a 20:00 cada hora)
			const slots = [
				'08:00',
				'09:00',
				'10:00',
				'11:00',
				'12:00',
				'13:00',
				'14:00',
				'15:00',
				'16:00',
				'17:00',
				'18:00',
				'19:00',
				'20:00',
			];

			// Buscamos visitas existentes para ese día
			const dayStart = new Date(`${date}T00:00:00`);
			const dayEnd = new Date(`${date}T23:59:59`);

			const existingVisits = await VisitModel.find({
				visitDate: {
					$gte: dayStart,
					$lte: dayEnd,
				},
				status: { $nin: ['cancelada', 'cancelado'] },
			}).select('visitDate');

			const availableSlots = slots.filter((slot) => {
				const slotDate = new Date(`${date}T${slot}`);
				if (Number.isNaN(slotDate.getTime())) return false;

				// Regla: si hay una visita a las T, se bloquean T-3h y T+3h (exclusivo)
				// Es decir, slot S está disponible si para toda visita V, |V - S| >= 3h
				return !existingVisits.some((visit) => {
					const visitDate = visit.visitDate;
					const diffMs = Math.abs(visitDate.getTime() - slotDate.getTime());
					const threeHoursMs = 3 * 60 * 60 * 1000;
					return diffMs < threeHoursMs;
				});
			});

			return res.json({ ok: true, availableSlots });
		} catch (e) {
			console.error('Error fetching available slots:', e);
			return res.status(500).json({ error: 'Error fetching available slots' });
		}
	},
};
