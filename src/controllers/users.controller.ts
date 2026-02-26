import { Request } from 'express';
import { UserModel } from '../models/user.model';
import { createCrudController } from './crud.controller';
import { Response } from 'express';
import { hash } from 'bcrypt';
import { env } from '../config/env';
import { RoleModel } from '../models/role.model';
import { generateToken } from '../utils/jwt';
import { AuthRequest } from '../middlewares/auth.middleware';

const base = createCrudController(UserModel);

export const UserController = {
	...base,
	// Perfil del usuario autenticado (datos completos, sin password)
	me: async (req: AuthRequest, res: Response) => {
		try {
			const userId = req.user?.distinctId || req.user?.id;
			if (!userId) return returnError(res, 401, 'Unauthorized');
			const u = await UserModel.findById(userId)
				.select('-password -__v')
				.populate({ path: 'role', select: 'name description permissions' });
			if (!u) return returnError(res, 404, 'User not found');
			return res.json({ ok: true, user: u });
		} catch (e) {
			return returnError(res, 500, 'Error fetching profile');
		}
	},
	// Actualizar perfil propio (sin cambiar password/role)
	updateMe: async (req: AuthRequest, res: Response) => {
		try {
			const userId = req.user?.id;
			if (!userId) return returnError(res, 401, 'Unauthorized');
			const { password, role, email, name, phone, address, ...rest } = req.body ?? {};
			if (password != null) return returnError(res, 400, 'Password cannot be changed via this endpoint');
			if (role != null) return returnError(res, 400, 'Role cannot be changed via this endpoint');
			const updateDoc: any = {};
			if (name != null) updateDoc.name = String(name);
			if (phone != null) updateDoc.phone = String(phone);
			if (address != null) updateDoc.address = String(address);
			if (email != null) {
				const exists = await UserModel.findOne({ email, _id: { $ne: userId } }).select('_id');
				if (exists) return returnError(res, 400, 'This email is already in use');
				updateDoc.email = String(email);
			}
			// permitimos campos extra no sensibles si existieran (ej. metadata)
			Object.assign(updateDoc, rest);
			const imageUrl = (req as any).file?.path || null;
			if (imageUrl) updateDoc.profile_picture = imageUrl;
			const updated = await UserModel.findByIdAndUpdate(userId, updateDoc, { new: true })
				.select('-password -__v')
				.populate({ path: 'role', select: 'name description' });
			if (!updated) return returnError(res, 404, 'Not found');
			return res.json({ ok: true, user: updated });
		} catch (e) {
			return returnError(res, 500, 'Error updating profile');
		}
	},
	list: async (req: Request, res: Response) => {
		try {
			const users = await UserModel.find().select('-password -__v').populate({
				path: 'role',
				select: 'name description',
			});

			res.status(200).json({ ok: true, users });
		} catch (err) {
			res.status(500).json({ error: 'Error during fetching users' });
		}
	},
	create: async (req: Request, res: Response) => {
		try {
			const { name, email, password } = req.body;

			// Validación de contraseña
			const hasUppercase = typeof password === 'string' && /[A-Z]/.test(password);
			const hasNumber = typeof password === 'string' && /\d/.test(password);
			const hasSpecial = typeof password === 'string' && /[^A-Za-z0-9]/.test(password);

			if (!password || !hasUppercase || !hasNumber || !hasSpecial) {
				return res.status(400).json({
					message:
						'Password must include at least one uppercase letter, one number, and one special character',
				});
			}

			// Email único
			const existing = await UserModel.findOne({ email });
			if (existing) {
				return res.status(400).json({ message: 'This email is already in use' });
			}

			const hashedPass = await hash(password, 10);

			// 🔥 ASIGNACIÓN FIJA DEL ROL
			const DEFAULT_ROLE_ID = '693784c6753b94da92239f4f';

			const newUser = await UserModel.create({
				name,
				email,
				password: hashedPass,
				role: DEFAULT_ROLE_ID,
			});

			const payload: any = {
				id: newUser._id,
				email: newUser.email,
				address: newUser.address,
			};

			const token = generateToken(payload);

			res.cookie('token', token, {
				httpOnly: true,
				secure: env.nodeEnv === 'production',
				sameSite: env.nodeEnv === 'production' ? 'none' : 'lax',
				maxAge: 1000 * 60 * 60 * 2,
			});

			return res.json({ message: 'User registered successfully' });
		} catch (err) {
			console.log(err);
			return res.status(500).json({ error: 'Error during register' });
		}
	},

	update: async (req: Request, res: Response) => {
		try {
			const userId = req.params.id;
			const { password, role, email, ...rest } = req.body ?? {};

			// Este endpoint NO permite cambiar la contraseña
			if (password != null) {
				return res
					.status(400)
					.json({ message: 'Password cannot be changed via this endpoint' });
			}

			// Validar unicidad de email si se actualiza
			if (email != null) {
				const existing = await UserModel.findOne({ email, _id: { $ne: userId } }).select(
					'_id'
				);
				if (existing) {
					return res.status(400).json({ message: 'This email is already in use' });
				}
			}

			// Construir objeto de actualización permitido
			const updateDoc: any = { ...rest };
			if (email != null) updateDoc.email = email;

			// Permitir cambio de rol (admin ya está controlado por permisos en la ruta)
			if (role != null) {
				const roleExists = await RoleModel.findById(role).select('_id');
				if (!roleExists) {
					return res.status(400).json({ message: 'Invalid role id' });
				}
				updateDoc.role = role;
			}

			const imageUrl = (req as any).file?.path || null;
			if (imageUrl) updateDoc.profile_picture = imageUrl;

			const updated = await UserModel.findByIdAndUpdate(userId, updateDoc, { new: true })
				.select('-password -__v')
				.populate({ path: 'role', select: 'name description' });
			if (!updated) return res.status(404).json({ message: 'Not found' });
			return res.json(updated);
		} catch (err) {
			return res.status(500).json({ error: 'Error updating user' });
		}
	},

	get: async (req: Request, res: Response) => {
		try {
			const { id } = req.params; // ID del usuario desde la URL

			if (!id) {
				return res.status(400).json({ message: 'El ID del usuario es obligatorio' });
			}

			// Buscar usuario por id y popular favorites
			const user = await UserModel.findById(id).populate('favorites');

			if (!user) {
				return res.status(404).json({ message: 'Usuario no encontrado' });
			}

			return res.status(200).json({ data: user });
		} catch (error) {
			console.error('Error en getUserById:', error);
			return res.status(500).json({ message: 'Error interno del servidor' });
		}
	},
};

function returnError(res: Response, code: number, message: string) {
	return res.status(code).json({ message });
}
