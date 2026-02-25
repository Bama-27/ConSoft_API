// middlewares/optionalAuth.ts
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { AuthRequest } from './auth.middleware';

export const optionalAuth = (req: AuthRequest, res: Response, next: NextFunction) => {
	try {
		const token = req.cookies?.accessToken;

		if (!token) {
			req.user = undefined;
			return next();
		}

		const decoded = jwt.verify(token, process.env.JWT_SECRET!) as any;
		req.user = decoded;

		next();
	} catch {
		req.user = undefined;
		next();
	}
};
