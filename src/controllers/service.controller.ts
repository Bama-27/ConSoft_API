import { ServiceModel } from '../models/service.model';
import { createCrudController } from './crud.controller';
import { Request, Response } from 'express';

const base = createCrudController(ServiceModel);

export const ServiceController = {
	...base,
	list: async (req: Request, res: Response) => {
		try {
			const page = Math.max(1, Number(req.query.page) || 1);
			const limit = Math.max(1, Number(req.query.limit) || 20);
			const skip = (page - 1) * limit;

			const filter: any = {};
			if (req.query.search) {
				const regex = new RegExp(String(req.query.search), 'i');
				filter.$or = [{ name: regex }, { description: regex }];
			}

			const [services, total] = await Promise.all([
				ServiceModel.find(filter)
					.sort({ name: 1 })
					.skip(skip)
					.limit(limit)
					.lean(),
				ServiceModel.countDocuments(filter),
			]);

			res.json({
				ok: true,
				data: services,
				pagination: {
					page,
					limit,
					total,
					pages: Math.ceil(total / limit),
				},
			});
		} catch (err) {
			res.status(500).json({ message: 'Internal server error' });
		}
	},
	create: async (req: Request, res: Response) => {
		try {
			const { name, description, status } = req.body ?? {};
			if (!name || typeof name !== 'string' || !name.trim()) {
				return res.status(400).json({ message: 'name is required' });
			}

			const imageUrl = (req as any).file?.path || null; // ← igual que en productos

			const created = await ServiceModel.create({
				name: name.trim(),
				description,
				imageUrl,
				status,
			});
			return res.status(201).json(created);
		} catch (err) {
			return res.status(500).json({ message: 'Internal server error' });
		}
	},
};
