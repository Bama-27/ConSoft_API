import { Request, Response } from 'express';
import { UserModel } from '../models/user.model';
import { compare, hash } from 'bcrypt';
import { generateToken } from '../utils/jwt';
import { env } from '../config/env';
import { AuthRequest } from '../middlewares/auth.middleware';
import { OAuth2Client } from 'google-auth-library';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { sendEmail } from '../utils/mailer';
import { RoleModel } from '../models/role.model';

export const AuthController = {
	login: async (req: Request, res: Response) => {
		try {
			const { email, password } = req.body;
			const user = await UserModel.findOne({ email }).populate({
				path: 'role',
				populate: {
					path: 'permissions',
					model: 'Permiso',
				},
			});

			if (!user) {
				return res.status(404).json({ message: 'User not found' });
			}

			const isMatch = await compare(password, user.password);

			if (!isMatch) {
				return res.status(400).json({ message: 'Incorrect password, please try again' });
			}

			const payload: any = {
				id: user._id,
				email: user.email,
				address: user.address,
			};

			const token = generateToken(payload);

			res.cookie('token', token, {
				httpOnly: true,
				secure: env.nodeEnv === 'production',
				sameSite: env.nodeEnv === 'production' ? 'none' : 'lax',
				maxAge: 1000 * 60 * 60 * 2,
			});

			res.status(200).json({ message: 'Login successful' });
		} catch (err) {
			res.status(500).json({ error: 'Error during login' });
		}
	},

	// Registro público con cookie httpOnly
	register: async (req: Request, res: Response) => {
		try {
			const { name, email, password } = req.body ?? {};
			if (!name || !email || !password) {
				return res.status(400).json({ message: 'name, email and password are required' });
			}
			const existing = await UserModel.findOne({ email });
			if (existing) {
				return res.status(400).json({ message: 'This email is already in use' });
			}
			const hasUppercase = typeof password === 'string' && /[A-Z]/.test(password);
			const hasNumber = typeof password === 'string' && /\d/.test(password);
			const hasSpecial = typeof password === 'string' && /[^A-Za-z0-9]/.test(password);
			if (!hasUppercase || !hasNumber || !hasSpecial) {
				return res.status(400).json({
					message:
						'Password must include at least one uppercase letter, one number, and one special character',
				});
			}
			const hashedPass = await hash(password, 10);
			let roleId: string | undefined = env.defaultUserRoleId;
			if (!roleId) {
				let fallbackRole = await RoleModel.findOne({ name: { $in: ['Usuario', 'Cliente'] } }).select('_id');
				if (!fallbackRole) {
					await RoleModel.create({ name: 'Usuario', description: 'Usuario estándar' });
					fallbackRole = await RoleModel.findOne({ name: 'Usuario' }).select('_id');
				}
				roleId = String((fallbackRole as any)._id);
			}
			const user = await UserModel.create({ name, email, password: hashedPass, role: roleId });
			const token = generateToken({ id: user._id, email: user.email });
			res.cookie('token', token, {
				httpOnly: true,
				secure: env.nodeEnv === 'production',
				sameSite: env.nodeEnv === 'production' ? 'none' : 'lax',
				maxAge: 1000 * 60 * 60 * 2,
			});
			return res.status(201).json({ ok: true, message: 'User registered successfully' });
		} catch (_e) {
			return res.status(500).json({ error: 'Error during register' });
		}
	},

	google: async (req: Request, res: Response) => {
		try {
			const { idToken } = req.body || {};
			if (!idToken) return res.status(400).json({ message: 'idToken is required' });
			if (!env.googleClientId)
				return res.status(500).json({ message: 'Google client not configured' });

			const client = new OAuth2Client(env.googleClientId);
			const ticket = await client.verifyIdToken({ idToken, audience: env.googleClientId });
			const payload = ticket.getPayload();
			if (!payload || !payload.email)
				return res.status(400).json({ message: 'Invalid Google token' });
			if (!payload.email_verified)
				return res.status(400).json({ message: 'Email not verified by Google' });

			const email = payload.email.toLowerCase();
			let user = await UserModel.findOne({ email });
			if (!user) {
				const tempPassword = crypto.randomBytes(16).toString('hex');
				const hashed = await hash(tempPassword, 10);
				const role = env.defaultUserRoleId; // default role from env
				user = await UserModel.create({
					name: payload.name || email,
					email,
					password: hashed,
					role,
				});
			}

			const token = generateToken({ id: user._id, email: user.email });
			res.cookie('token', token, {
				httpOnly: true,
				secure: env.nodeEnv === 'production',
				sameSite: env.nodeEnv === 'production' ? 'none' : 'lax',
				maxAge: 1000 * 60 * 60 * 2,
			});

			return res.status(200).json({ message: 'Login successful' });
		} catch (err) {
			return res.status(500).json({ error: 'Error during Google login' });
		}
	},

	logout: async (_req: Request, res: Response) => {
		try {
			res.clearCookie('token', {
				httpOnly: true,
				secure: env.nodeEnv === 'production',
				sameSite: env.nodeEnv === 'production' ? 'none' : 'lax',
			});
			res.json({ message: 'Logout successful' });
		} catch (err) {
			res.status(500).json({ error: 'Error during logout' });
		}
	},

	me: (req: AuthRequest, res: Response) => {
		if (!req.user) {
			return res.status(401).json({ message: 'Unauthorized' });
		}
		res.status(200).json(req.user);
	},

	profile: async (req: AuthRequest, res: Response) => {
		if (!req.user) {
			return res.status(401).json({ message: 'Unauthorized' });
		}
		const userId = req.user.id;
		const userInfo = await UserModel.findOne({ _id: userId });
		if (!userInfo) {
			return res.status(404).json({ ok: false, message: 'User not found' });
		}
		const { password, favorites, registeredAt, role, ...safeUser } = userInfo.toObject();
		res.status(200).json({ ok: true, user: safeUser });
	},

	changePassword: async (req: AuthRequest, res: Response) => {
		try {
			const userId = req.user?.id;
			if (!userId) return res.status(401).json({ message: 'Unauthorized' });
			const { currentPassword, newPassword } = req.body ?? {};
			if (!currentPassword || !newPassword) {
				return res.status(400).json({ message: 'currentPassword and newPassword are required' });
			}
			const hasUppercase = typeof newPassword === 'string' && /[A-Z]/.test(newPassword);
			const hasNumber = typeof newPassword === 'string' && /\d/.test(newPassword);
			const hasSpecial = typeof newPassword === 'string' && /[^A-Za-z0-9]/.test(newPassword);
			if (!hasUppercase || !hasNumber || !hasSpecial) {
				return res.status(400).json({
					message:
						'Password must include at least one uppercase letter, one number, and one special character',
				});
			}
			const user = await UserModel.findById(userId).select('password');
			if (!user) return res.status(404).json({ message: 'User not found' });
			const ok = await compare(currentPassword, user.password);
			if (!ok) return res.status(400).json({ message: 'Current password is incorrect' });
			const hashed = await hash(newPassword, 10);
			user.password = hashed as any;
			await user.save();
			return res.json({ ok: true, message: 'Password updated' });
		} catch (_e) {
			return res.status(500).json({ error: 'Error changing password' });
		}
	},

	forgotPassword: async (req: Request, res: Response) => {
		try {
			const { email } = req.body ?? {};
			if (!email) return res.status(400).json({ message: 'email is required' });
			const user = await UserModel.findOne({ email }).select('_id email');
			if (!user) return res.json({ ok: true }); // no filtrar usuarios
			const token = jwt.sign({ id: String(user._id), purpose: 'reset' }, env.jwt_secret, {
				expiresIn: '30m',
			});
			const linkBase = env.frontendOrigins[0] || 'http://localhost:3000';
			const link = `${linkBase}/reset-password?token=${encodeURIComponent(token)}`;
			await sendEmail({
				to: user.email,
				subject: 'Recuperar contraseña',
				text: `Para restablecer tu contraseña, abre este enlace: ${link}`,
				html: `<p>Para restablecer tu contraseña, abre este enlace:</p><p><a href="${link}">Restablecer contraseña</a></p>`,
			});
			return res.json({ ok: true });
		} catch (_e) {
			return res.status(500).json({ error: 'Error starting password recovery' });
		}
	},

	resetPassword: async (req: Request, res: Response) => {
		try {
			const { token, newPassword } = req.body ?? {};
			if (!token || !newPassword) return res.status(400).json({ message: 'token and newPassword are required' });
			const hasUppercase = typeof newPassword === 'string' && /[A-Z]/.test(newPassword);
			const hasNumber = typeof newPassword === 'string' && /\d/.test(newPassword);
			const hasSpecial = typeof newPassword === 'string' && /[^A-Za-z0-9]/.test(newPassword);
			if (!hasUppercase || !hasNumber || !hasSpecial) {
				return res.status(400).json({
					message:
						'Password must include at least one uppercase letter, one number, and one special character',
				});
			}
			const decoded = jwt.verify(token, env.jwt_secret) as any;
			if (!decoded?.id || decoded?.purpose !== 'reset') {
				return res.status(400).json({ message: 'Invalid token' });
			}
			const user = await UserModel.findById(decoded.id).select('_id password');
			if (!user) return res.status(404).json({ message: 'User not found' });
			const hashed = await hash(newPassword, 10);
			user.password = hashed as any;
			await user.save();
			return res.json({ ok: true, message: 'Password reset successfully' });
		} catch (_e) {
			return res.status(400).json({ error: 'Invalid or expired token' });
		}
	},
};
