import jwt from 'jsonwebtoken';
import { env } from '../config/env';

export function generateToken(payload: object, expiresIn: string | number = '30m') {
	return jwt.sign(payload, env.jwt_secret as jwt.Secret, { expiresIn } as jwt.SignOptions);
}

export function generateRefreshToken(payload: object, expiresIn: string | number = '1d') {
	return jwt.sign(
		{ ...payload, purpose: 'refresh' },
		env.jwt_secret as jwt.Secret,
		{ expiresIn } as jwt.SignOptions,
	);
}
