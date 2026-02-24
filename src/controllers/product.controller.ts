import { Request, Response } from 'express';
import { ProductModel } from '../models/product.model';
import { createCrudController } from './crud.controller';

const base = createCrudController(ProductModel);

export const ProductController = {
	...base,
	list: async (req: Request, res: Response) => {
		try {
			const products = await ProductModel.find().populate('category');
			if (!products) {
				return res.status(404).json({ ok: false, message: 'No products found' });
			}

			res.status(200).json({ ok: true, products });
		} catch (error) {
			console.error(error);
			res.status(500).json({ message: 'Internal server error' });
		}
	},
	create: async (req: Request, res: Response) => {
		try {
			const { name, category, description, descriptionC, status } = req.body ?? {};
			if (!name || typeof name !== 'string' || !name.trim()) {
				return res.status(400).json({ message: 'name is required' });
			}
			if (!category) {
				return res.status(400).json({ message: 'category is required' });
			}

			const imageUrl = (req as any).file?.path || null;
			// No hay CategoryModel aquí; validación de existencia mínima se omite para evitar dependencia circular
			const created = await ProductModel.create({
				name: name.trim(),
				description,
				descriptionC,
				category,
				status,
				imageUrl,
			});
			return res.status(201).json(created);
		} catch (error) {
			console.error(error);
			return res.status(500).json({ message: 'Internal server error' });
		}
	},
};
