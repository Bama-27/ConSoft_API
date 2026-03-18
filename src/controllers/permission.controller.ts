import { Request, Response } from 'express';
import { PermissionModel } from '../models/permission.model';
import { createCrudController } from './crud.controller';

const base = createCrudController(PermissionModel);

export const PermissionController = {
	...base,
	create: async (req: Request, res: Response) => {
		try {
			const { module, action } = req.body ?? {};
			if (!module || typeof module !== 'string' || !module.trim()) {
				return res.status(400).json({ message: 'module is required' });
			}
			if (!action || typeof action !== 'string' || !action.trim()) {
				return res.status(400).json({ message: 'action is required' });
			}
			const moduleTrim = module.trim();
			const actionTrim = action.trim();
			const existing = await PermissionModel.findOne({ module: moduleTrim, action: actionTrim });
			if (existing) {
				return res.status(400).json({ message: 'This permission already exists' });
			}
			const perm = await PermissionModel.create({ module: moduleTrim, action: actionTrim });
			return res.status(201).json(perm);
		} catch (err) {
			console.error(err);
			return res.status(500).json({ error: 'Internal server error' });
		}
	},
	list: async (req: Request, res: Response) => {
		try {
			const permisos = await PermissionModel.aggregate([
				// Derivar module/action desde 'name' si no existen los campos (compatibilidad con seeds antiguos)
				{
					$addFields: {
						derivedModule: {
							$ifNull: [
								'$module',
								{ $arrayElemAt: [{ $split: ['$name', '.'] }, 0] },
							],
						},
						derivedAction: {
							$ifNull: [
								'$action',
								{ $arrayElemAt: [{ $split: ['$name', '.'] }, 1] },
							],
						},
					},
				},
				{
					$group: {
						_id: '$derivedModule',
						permissions: {
							$push: {
								_id: '$_id',
								module: '$derivedModule',
								action: '$derivedAction',
							},
						},
					},
				},
				{
					$project: {
						_id: 0,
						module: '$_id',
						permissions: 1,
					},
				},
			]);

			res.status(200).json({ ok: true, permisos });
		} catch (err) {
			console.error(err);
			res.status(500).json({ error: 'Error al obtener permisos' });
		}
	},
};
