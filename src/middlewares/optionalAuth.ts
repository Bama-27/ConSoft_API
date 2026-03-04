// middlewares/optionalAuth.ts
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { AuthRequest } from './auth.middleware';
import { env } from '../config/env';

export const optionalAuth = (req: AuthRequest, res: Response, next: NextFunction) => {
	try {
		const secret = env.jwt_secret;
		const token = req.cookies?.token;

		if (!token) {
			req.user = undefined;
			return next();
		}

		try {
			const decoded = jwt.verify(token, secret) as any;
			req.user = decoded;
			return next();
		} catch {
			req.user = undefined;
			return next();
		}
	} catch {
		req.user = undefined;
		next();
	}
};
