import { Request, Response, NextFunction } from 'express';
import jwt, { Secret } from 'jsonwebtoken';
import { env } from '../config/env';
import { UserModel } from '../models/user.model';
import { generateToken } from '../utils/jwt';

export interface AuthRequest extends Request {
	user?: any;
}

function readBearerToken(req: Request): string | null {
	try {
		const auth = req.headers?.authorization || '';
		if (!auth) return null;
		const [scheme, token] = auth.split(' ');
		if (scheme?.toLowerCase() !== 'bearer' || !token) return null;
		return token.trim();
	} catch {
		return null;
	}
}

export async function verifyToken(req: AuthRequest, res: Response, next: NextFunction) {
	try {
		const secret: Secret = env.jwt_secret;
		const rawAccess = req.cookies?.token || readBearerToken(req);

		if (!rawAccess) {
			return res.status(401).json({ message: 'Access denied. No token provided' });
		}

		const decoded = jwt.verify(rawAccess, secret) as any;
		const userId = decoded?.id;
		if (!userId) {
			return res.status(403).json({ message: 'Invalid token payload' });
		}
		// Cargar usuario fresco con rol y permisos
		const dbUser = await UserModel.findById(userId)
			.select('email role address')
			.populate({
				path: 'role',
				select: 'name permissions',
				populate: { path: 'permissions', model: 'Permiso', select: 'module action name' },
			})
			.lean();
		if (!dbUser) {
			return res.status(401).json({ message: 'User not found' });
		}
		req.user = {
			id: String(userId),
			email: dbUser.email,
			role: dbUser.role,
			address: dbUser.address,
		};
		next();
	} catch (err) {
		return res.status(403).json({ message: 'Invalid or expired token' });
	}
}
