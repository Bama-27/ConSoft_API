import { ServiceModel } from '../models/service.model';
import { createCrudController } from './crud.controller';
import { Request, Response } from 'express';

const base = createCrudController(ServiceModel);

export const ServiceController = {
	...base,
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
