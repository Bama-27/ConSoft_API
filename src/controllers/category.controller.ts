import { Request, Response } from 'express';
import { CategoryModel } from '../models/category.model';
import { createCrudController } from './crud.controller';

const base = createCrudController(CategoryModel);

export const CategoryControlleer = {
	...base,

	list: async (req: Request, res: Response) => {
		try {
			const page = Math.max(1, Number(req.query.page) || 1);
			const limit = Math.max(1, Number(req.query.limit) || 20);
			const skip = (page - 1) * limit;

			const filter: any = {};
			if (req.query.search) {
				const regex = new RegExp(String(req.query.search), 'i');
				filter.name = regex;
			}

			const [categories, total] = await Promise.all([
				CategoryModel.find(filter)
					.populate('products')
					.skip(skip)
					.limit(limit)
					.exec(),
				CategoryModel.countDocuments(filter),
			]);

			res.status(200).json({
				ok: true,
				categories,
				pagination: {
					page,
					limit,
					total,
					pages: Math.ceil(total / limit),
				},
			});
		} catch (error) {
			console.log(error)
			res.status(500).json({ message: 'Internal server error' });
		}
	},
	create: async (req: Request, res: Response) => {
		try {
			const { name, description } = req.body ?? {};
			if (!name || typeof name !== 'string' || !name.trim()) {
				return res.status(400).json({ message: 'name is required' });
			}
			const nameTrimmed = name.trim();
			const existing = await CategoryModel.findOne({ name: { $regex: new RegExp(`^${nameTrimmed}$`, 'i') } });
			if (existing) {
				return res.status(400).json({ message: 'A category with this name already exists' });
			}
			const created = await CategoryModel.create({ name: nameTrimmed, description });
			return res.status(201).json(created);
		} catch (error) {
			console.log(error)
			return res.status(500).json({ message: 'Internal server error' });
		}
	},
};

// Alias para mantener compatibilidad y evitar errores por el typo
export const CategoryController = CategoryControlleer;
