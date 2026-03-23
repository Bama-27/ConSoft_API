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
				const searchStr = String(req.query.search);
				const escapedSearch = searchStr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
				const regex = new RegExp(escapedSearch, 'i');
				
				const orConditions: any[] = [
					{ name: regex },
					{ description: regex }
				];

				if (searchStr.match(/^[0-9a-fA-F]+$/)) {
					orConditions.push({
						$expr: {
							$gt: [
								{ $indexOfCP: [{ $toLower: { $toString: '$_id' } }, searchStr.toLowerCase()] },
								-1
							]
						}
					});
				}

				filter.$or = orConditions;
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

			const nameTrimmed = name.trim();
			const existing = await ServiceModel.findOne({ name: { $regex: new RegExp(`^${nameTrimmed}$`, 'i') } });
			if (existing) {
				return res.status(400).json({ message: 'A service with this name already exists' });
			}

			const created = await ServiceModel.create({
				name: nameTrimmed,
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
