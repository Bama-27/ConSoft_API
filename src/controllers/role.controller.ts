import { Request, Response } from 'express';
import { RoleModel } from '../models/role.model';
import { UserModel } from '../models/user.model';
import { createCrudController } from './crud.controller';
import mongoose from 'mongoose';

const base = createCrudController(RoleModel);

export const RoleController = {
	...base,

	remove: async (req: Request, res: Response) => {
		try {
			const roleId = req.params.id;
			if (!mongoose.isValidObjectId(roleId)) {
				return res.status(400).json({ message: 'Invalid role id' });
			}

			// Check if there are users with this role
			const usersWithRole = await UserModel.countDocuments({ role: roleId });
			if (usersWithRole > 0) {
				return res.status(400).json({
					message: 'No se puede eliminar el rol porque tiene usuarios asociados',
				});
			}

			const deleted = await RoleModel.findByIdAndDelete(roleId);
			if (!deleted) return res.status(404).json({ message: 'Not found' });

			return res.status(204).send();
		} catch (error) {
			console.error(error);
			return res.status(500).json({ error: 'Internal server error' });
		}
	},

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

			const [roles, total] = await Promise.all([
				RoleModel.find(filter)
					.populate('usersCount')
					.populate('permissions')
					.skip(skip)
					.limit(limit)
					.exec(),
				RoleModel.countDocuments(filter),
			]);

			return res.status(200).json({
				ok: true,
				roles,
				pagination: {
					page,
					limit,
					total,
					pages: Math.ceil(total / limit),
				},
			});
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
			const nameTrimmed = name.trim();
			const existing = await RoleModel.findOne({ name: { $regex: new RegExp(`^${nameTrimmed}$`, 'i') } });
			if (existing) {
				return res.status(400).json({ message: 'A role with this name already exists' });
			}

			const newRole = await RoleModel.create({
				name: nameTrimmed,
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
