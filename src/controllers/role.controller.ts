import { Request, Response } from 'express';
import { RoleModel } from '../models/role.model';
import { createCrudController } from './crud.controller';
import mongoose from 'mongoose';

const base = createCrudController(RoleModel);

export const RoleController = {
	...base,

	list: async (_req: Request, res: Response) => {
		try {
			const roles = await RoleModel.find().populate('usersCount').populate('permissions');
			return res.status(200).json({ ok: true, roles });
		} catch (error) {
			console.error(error);
			return res.status(500).json({ error: 'Internal server error' });
		}
	},

	create: async (req: Request, res: Response) => {
		try {
			const { name, description, permissions } = req.body ?? {};
			if (!name || typeof name !== 'string' || !name.trim()) {
				return res.status(400).json({ message: 'name is required' });
			}
			if (permissions != null && !Array.isArray(permissions)) {
				return res.status(400).json({ message: 'must permissions be an array of ids' });
			}
			const cleaned = Array.isArray(permissions)
				? Array.from(
						new Set(
							permissions
								.filter(Boolean)
								.map((p: any) => String(p))
								.filter((p: string) => mongoose.isValidObjectId(p))
						)
				  )
				: undefined;
			const newRole = await RoleModel.create({
				name: name.trim(),
				description,
				permissions: cleaned,
			});
			return res.status(201).json(newRole);
		} catch (error) {
			console.error(error);
			return res.status(500).json({ error: 'Internal server error' });
		}
	},

	update: async (req: Request, res: Response) => {
		try {
			const roleId = req.params.id;
			const { name, description, permissions } = req.body ?? {};

			const updateDoc: any = {};
			if (name != null) updateDoc.name = name;
			if (description != null) updateDoc.description = description;

			if (permissions != null) {
				if (!Array.isArray(permissions)) {
					return res.status(400).json({ message: 'permissions must be an array of ids' });
				}
				const cleaned = permissions
					.filter(Boolean)
					.map((p: any) => String(p))
					.filter((p: string) => mongoose.isValidObjectId(p));
				const unique = Array.from(new Set(cleaned));
				updateDoc.permissions = unique;
			}

			const updated = await RoleModel.findByIdAndUpdate(roleId, updateDoc, {
				new: true,
			}).populate('permissions');
			if (!updated) return res.status(404).json({ message: 'Not found' });
			return res.json({ ok: true, data: updated });
		} catch (error) {
			console.error(error);
			return res.status(500).json({ error: 'Internal server error' });
		}
	},
};
