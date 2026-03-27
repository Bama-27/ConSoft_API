import { Request, Response } from 'express';
import { ProductModel } from '../models/product.model';
import { createCrudController } from './crud.controller';

const base = createCrudController(ProductModel);

export const ProductController = {
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

				// Busca IDs de categorías que coincidan con la búsqueda de texto
				const matchingCategories = await import('../models/category.model').then(m => m.CategoryModel.find({ name: regex }).select('_id'));
				if (matchingCategories.length > 0) {
					orConditions.push({ category: { $in: matchingCategories.map(c => c._id) } });
				}

				filter.$or = orConditions;
			}

			if (req.query.category) {
				// Si mandan un ID de categoría o el nombre
				const categoryQuery = String(req.query.category);
				const categoryMatch = await import('../models/category.model').then(m => m.CategoryModel.findOne({ 
					$or: [
						{ _id: categoryQuery.match(/^[0-9a-fA-F]{24}$/) ? categoryQuery : null },
						{ name: new RegExp(`^${categoryQuery}$`, 'i') }
					]
				}).select('_id'));
				
				if (categoryMatch) {
					filter.category = categoryMatch._id;
				}
			}

			const [products, total] = await Promise.all([
				ProductModel.find(filter)
					.populate('category')
					.skip(skip)
					.limit(limit)
					.exec(),
				ProductModel.countDocuments(filter),
			]);

			res.status(200).json({
				ok: true,
				products,
				pagination: {
					page,
					limit,
					total,
					pages: Math.ceil(total / limit),
				},
			});
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
			const nameTrimmed = name.trim();
			const existing = await ProductModel.findOne({ name: { $regex: new RegExp(`^${nameTrimmed}$`, 'i') } });
			if (existing) {
				return res.status(400).json({ message: 'A product with this name already exists' });
			}

			const created = await ProductModel.create({
				name: nameTrimmed,
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
