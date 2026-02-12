import { Request, Response } from 'express';
import { VisitModel } from '../models/visit.model';
import { createCrudController } from './crud.controller';
import { AuthRequest } from '../middlewares/auth.middleware';
import { Types } from 'mongoose';

const base = createCrudController(VisitModel);

function parseVisitDate(value: unknown): Date | null {
	if (value == null) return null;
	const d = new Date(String(value));
	return Number.isNaN(d.getTime()) ? null : d;
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
		const visits = await VisitModel.find()
			.populate('user', 'name email') // ✔ user es un ObjectId
			.populate('services', 'name description'); // ✔ services es un array de ObjectId
		return res.json({ ok: true, visits });
	},

	get: async (req: Request, res: Response) => {
		const visit = await VisitModel.findById(req.params.id).populate('user', 'name email');
		if (!visit) return res.status(404).json({ message: 'Not found' });
		return res.json(visit);
	},

	// Crear visita para el usuario autenticado
	createForMe: async (req: AuthRequest, res: Response) => {
		try {
			const userId = req.user?.id;
			if (!userId) return res.status(401).json({ message: 'Unauthorized' });
			const { visitDate, address, status, services } = req.body ?? {};
			if (!visitDate) return res.status(400).json({ message: 'visitDate is required' });
			const parsedVisitDate = parseVisitDate(visitDate);
			if (!parsedVisitDate) return res.status(400).json({ message: 'visitDate is invalid' });
			if (!address || typeof address !== 'string' || !address.trim()) {
				return res.status(400).json({ message: 'address is required' });
			}
			await assertNoVisitOverlap(parsedVisitDate);
			const payload: any = {
				user: new Types.ObjectId(String(userId)),
				visitDate: parsedVisitDate,
				address: address.trim(),
				status: status && typeof status === 'string' ? status : 'pendiente',
				services: Array.isArray(services) ? services.filter(Boolean) : [],
			};
			const created = await VisitModel.create(payload);
			const populated = await created.populate('user', 'name email').then(d => d.populate('services', 'name description'));
			return res.status(201).json({ ok: true, visit: populated });
		} catch (e) {
			const err: any = e;
			if (err?.status === 409) {
				return res.status(409).json({
					message: 'Time slot not available',
					conflictVisitId: err.conflictVisitId,
					conflictVisitDate: err.conflictVisitDate,
				});
			}
			return res.status(500).json({ error: 'Error creating visit' });
		}
	},

	// Crear visita (admin) con validación de solape
	create: async (req: Request, res: Response) => {
		try {
			const { user, visitDate, address, status, services } = req.body ?? {};
			if (!user) return res.status(400).json({ message: 'user is required' });
			if (!visitDate) return res.status(400).json({ message: 'visitDate is required' });
			const parsedVisitDate = parseVisitDate(visitDate);
			if (!parsedVisitDate) return res.status(400).json({ message: 'visitDate is invalid' });
			if (!address || typeof address !== 'string' || !address.trim()) {
				return res.status(400).json({ message: 'address is required' });
			}
			await assertNoVisitOverlap(parsedVisitDate);

			const created = await VisitModel.create({
				user,
				visitDate: parsedVisitDate,
				address: address.trim(),
				status: status && typeof status === 'string' ? status : 'pendiente',
				services: Array.isArray(services) ? services.filter(Boolean) : [],
			} as any);
			const populated = await created
				.populate('user', 'name email')
				.then((d) => d.populate('services', 'name description'));
			return res.status(201).json({ ok: true, visit: populated });
		} catch (e) {
			const err: any = e;
			if (err?.status === 409) {
				return res.status(409).json({
					message: 'Time slot not available',
					conflictVisitId: err.conflictVisitId,
					conflictVisitDate: err.conflictVisitDate,
				});
			}
			return res.status(500).json({ error: 'Error creating visit' });
		}
	},

	// Listar solo las visitas del usuario autenticado
	listMine: async (req: AuthRequest, res: Response) => {
		try {
			const userId = req.user?.id;
			if (!userId) return res.status(401).json({ message: 'Unauthorized' });
			const visits = await VisitModel.find({ user: userId })
				.sort({ visitDate: -1 })
				.populate('user', 'name email')
				.populate('services', 'name description');
			return res.json({ ok: true, visits });
		} catch (e) {
			return res.status(500).json({ error: 'Error fetching visits' });
		}
	},
};
