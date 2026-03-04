"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.verifyToken = verifyToken;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const env_1 = require("../config/env");
const user_model_1 = require("../models/user.model");
function readBearerToken(req) {
    try {
        const auth = req.headers?.authorization || '';
        if (!auth)
            return null;
        const [scheme, token] = auth.split(' ');
        if (scheme?.toLowerCase() !== 'bearer' || !token)
            return null;
        return token.trim();
    }
    catch {
        return null;
    }
}
async function verifyToken(req, res, next) {
    try {
        const secret = env_1.env.jwt_secret;
        const rawAccess = req.cookies?.token || readBearerToken(req);
        if (!rawAccess) {
            return res.status(401).json({ message: 'Access denied. No token provided' });
        }
        const decoded = jsonwebtoken_1.default.verify(rawAccess, secret);
        const userId = decoded?.id;
        if (!userId) {
            return res.status(403).json({ message: 'Invalid token payload' });
        }
        // Cargar usuario fresco con rol y permisos
        const dbUser = await user_model_1.UserModel.findById(userId)
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
    }
    catch (err) {
        return res.status(403).json({ message: 'Invalid or expired token' });
    }
}
