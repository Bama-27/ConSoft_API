"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthController = void 0;
const user_model_1 = require("../models/user.model");
const bcrypt_1 = require("bcrypt");
const jwt_1 = require("../utils/jwt");
const env_1 = require("../config/env");
const google_auth_library_1 = require("google-auth-library");
const crypto_1 = __importDefault(require("crypto"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const mailer_1 = require("../utils/mailer");
const role_model_1 = require("../models/role.model");
const refreshToken_model_1 = require("../models/refreshToken.model");
exports.AuthController = {
    login: async (req, res) => {
        try {
            const { email, password } = req.body;
            const user = await user_model_1.UserModel.findOne({ email }).populate({
                path: 'role',
                populate: {
                    path: 'permissions',
                    model: 'Permiso',
                },
            });
            if (!user) {
                return res.status(404).json({ message: 'User not found' });
            }
            const isMatch = await (0, bcrypt_1.compare)(password, user.password);
            if (!isMatch) {
                return res.status(400).json({ message: 'Incorrect password, please try again' });
            }
            const payload = {
                id: user._id,
                email: user.email,
                address: user.address,
            };
            const token = (0, jwt_1.generateToken)(payload);
            // Generar refresh token seguro y guardarlo en BD
            const refreshTokenValue = crypto_1.default.randomBytes(40).toString('hex');
            const refreshTokenExpiry = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
            await refreshToken_model_1.RefreshTokenModel.create({
                userId: user._id,
                token: refreshTokenValue,
                expiresAt: refreshTokenExpiry,
                revoked: false,
            });
            res.cookie('token', token, {
                httpOnly: true,
                secure: env_1.env.nodeEnv === 'production',
                sameSite: env_1.env.nodeEnv === 'production' ? 'none' : 'lax',
                maxAge: 1000 * 60 * 30,
            });
            res.cookie('refreshToken', refreshTokenValue, {
                httpOnly: true,
                secure: env_1.env.nodeEnv === 'production',
                sameSite: env_1.env.nodeEnv === 'production' ? 'none' : 'lax',
                maxAge: 1000 * 60 * 60 * 24 * 30,
            });
            res.status(200).json({ message: 'Login successful' });
        }
        catch (err) {
            res.status(500).json({ error: 'Error during login' });
        }
    },
    // Registro público con cookie httpOnly
    register: async (req, res) => {
        try {
            const { name, email, password } = req.body ?? {};
            if (!name || !email || !password) {
                return res.status(400).json({ message: 'name, email and password are required' });
            }
            const existing = await user_model_1.UserModel.findOne({ email });
            if (existing) {
                return res.status(400).json({ message: 'This email is already in use' });
            }
            const hasUppercase = typeof password === 'string' && /[A-Z]/.test(password);
            const hasNumber = typeof password === 'string' && /\d/.test(password);
            const hasSpecial = typeof password === 'string' && /[^A-Za-z0-9]/.test(password);
            if (!hasUppercase || !hasNumber || !hasSpecial) {
                return res.status(400).json({
                    message: 'Password must include at least one uppercase letter, one number, and one special character',
                });
            }
            const hashedPass = await (0, bcrypt_1.hash)(password, 10);
            let roleId = env_1.env.defaultUserRoleId;
            if (!roleId) {
                let fallbackRole = await role_model_1.RoleModel.findOne({ name: { $in: ['Usuario', 'Cliente'] } }).select('_id');
                if (!fallbackRole) {
                    await role_model_1.RoleModel.create({ name: 'Usuario', description: 'Usuario estándar' });
                    fallbackRole = await role_model_1.RoleModel.findOne({ name: 'Usuario' }).select('_id');
                }
                roleId = String(fallbackRole._id);
            }
            const user = await user_model_1.UserModel.create({ name, email, password: hashedPass, role: roleId });
            const token = (0, jwt_1.generateToken)({ id: user._id, email: user.email });
            // Generar refresh token seguro y guardarlo en BD
            const refreshTokenValue = crypto_1.default.randomBytes(40).toString('hex');
            const refreshTokenExpiry = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 días
            await refreshToken_model_1.RefreshTokenModel.create({
                userId: user._id,
                token: refreshTokenValue,
                expiresAt: refreshTokenExpiry,
                revoked: false,
            });
            res.cookie('token', token, {
                httpOnly: true,
                secure: env_1.env.nodeEnv === 'production',
                sameSite: env_1.env.nodeEnv === 'production' ? 'none' : 'lax',
                maxAge: 1000 * 60 * 30,
            });
            res.cookie('refreshToken', refreshTokenValue, {
                httpOnly: true,
                secure: env_1.env.nodeEnv === 'production',
                sameSite: env_1.env.nodeEnv === 'production' ? 'none' : 'lax',
                maxAge: 1000 * 60 * 60 * 24 * 30,
            });
            return res.status(201).json({ ok: true, message: 'User registered successfully' });
        }
        catch (_e) {
            return res.status(500).json({ error: 'Error during register' });
        }
    },
    google: async (req, res) => {
        try {
            const { idToken } = req.body || {};
            if (!idToken)
                return res.status(400).json({ message: 'idToken is required' });
            if (!env_1.env.googleClientId)
                return res.status(500).json({ message: 'Google client not configured' });
            const client = new google_auth_library_1.OAuth2Client(env_1.env.googleClientId);
            const ticket = await client.verifyIdToken({ idToken, audience: env_1.env.googleClientId });
            const payload = ticket.getPayload();
            if (!payload || !payload.email)
                return res.status(400).json({ message: 'Invalid Google token' });
            if (!payload.email_verified)
                return res.status(400).json({ message: 'Email not verified by Google' });
            const email = payload.email.toLowerCase();
            let user = await user_model_1.UserModel.findOne({ email });
            if (!user) {
                const tempPassword = crypto_1.default.randomBytes(16).toString('hex');
                const hashed = await (0, bcrypt_1.hash)(tempPassword, 10);
                const role = env_1.env.defaultUserRoleId; // default role from env
                user = await user_model_1.UserModel.create({
                    name: payload.name || email,
                    email,
                    password: hashed,
                    role,
                });
            }
            const token = (0, jwt_1.generateToken)({ id: user._id, email: user.email });
            // Generar refresh token seguro y guardarlo en BD
            const refreshTokenValue = crypto_1.default.randomBytes(40).toString('hex');
            const refreshTokenExpiry = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 días
            await refreshToken_model_1.RefreshTokenModel.create({
                userId: user._id,
                token: refreshTokenValue,
                expiresAt: refreshTokenExpiry,
                revoked: false,
            });
            res.cookie('token', token, {
                httpOnly: true,
                secure: env_1.env.nodeEnv === 'production',
                sameSite: env_1.env.nodeEnv === 'production' ? 'none' : 'lax',
                maxAge: 1000 * 60 * 30,
            });
            res.cookie('refreshToken', refreshTokenValue, {
                httpOnly: true,
                secure: env_1.env.nodeEnv === 'production',
                sameSite: env_1.env.nodeEnv === 'production' ? 'none' : 'lax',
                maxAge: 1000 * 60 * 60 * 24 * 30,
            });
            return res.status(200).json({ message: 'Login successful' });
        }
        catch (err) {
            return res.status(500).json({ error: 'Error during Google login' });
        }
    },
    logout: async (req, res) => {
        try {
            // Revocar refresh token en BD si existe
            const token = req.cookies?.refreshToken;
            if (token) {
                await refreshToken_model_1.RefreshTokenModel.updateOne({ token, revoked: false }, { revoked: true });
            }
            res.clearCookie('token', {
                httpOnly: true,
                secure: env_1.env.nodeEnv === 'production',
                sameSite: env_1.env.nodeEnv === 'production' ? 'none' : 'lax',
            });
            res.clearCookie('refreshToken', {
                httpOnly: true,
                secure: env_1.env.nodeEnv === 'production',
                sameSite: env_1.env.nodeEnv === 'production' ? 'none' : 'lax',
            });
            res.json({ message: 'Logout successful' });
        }
        catch (err) {
            res.status(500).json({ error: 'Error during logout' });
        }
    },
    refresh: async (req, res) => {
        try {
            const token = req.cookies?.refreshToken;
            if (!token)
                return res.status(401).json({ message: 'Refresh token required' });
            // Validar que el token existe en BD y no está revocado
            const storedToken = await refreshToken_model_1.RefreshTokenModel.findOne({ token, revoked: false });
            if (!storedToken) {
                return res.status(403).json({ message: 'Invalid or revoked refresh token' });
            }
            // Validar que no ha expirado
            if (storedToken.expiresAt < new Date()) {
                await refreshToken_model_1.RefreshTokenModel.updateOne({ _id: storedToken._id }, { revoked: true });
                return res.status(403).json({ message: 'Refresh token expired' });
            }
            // Obtener usuario
            const dbUser = await user_model_1.UserModel.findById(storedToken.userId).select('email address');
            if (!dbUser) {
                await refreshToken_model_1.RefreshTokenModel.updateOne({ _id: storedToken._id }, { revoked: true });
                return res.status(401).json({ message: 'User not found' });
            }
            // Revocar el token viejo
            await refreshToken_model_1.RefreshTokenModel.updateOne({ _id: storedToken._id }, { revoked: true });
            // Generar nuevo par de tokens
            const newAccess = (0, jwt_1.generateToken)({ id: dbUser._id, email: dbUser.email, address: dbUser.address });
            const newRefreshTokenValue = crypto_1.default.randomBytes(40).toString('hex');
            const newRefreshTokenExpiry = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
            await refreshToken_model_1.RefreshTokenModel.create({
                userId: dbUser._id,
                token: newRefreshTokenValue,
                expiresAt: newRefreshTokenExpiry,
                revoked: false,
            });
            res.cookie('token', newAccess, {
                httpOnly: true,
                secure: env_1.env.nodeEnv === 'production',
                sameSite: env_1.env.nodeEnv === 'production' ? 'none' : 'lax',
                maxAge: 1000 * 60 * 30,
            });
            res.cookie('refreshToken', newRefreshTokenValue, {
                httpOnly: true,
                secure: env_1.env.nodeEnv === 'production',
                sameSite: env_1.env.nodeEnv === 'production' ? 'none' : 'lax',
                maxAge: 1000 * 60 * 60 * 24 * 30,
            });
            return res.status(200).json({ ok: true });
        }
        catch (_e) {
            return res.status(403).json({ message: 'Invalid or expired refresh token' });
        }
    },
    me: (req, res) => {
        if (!req.user) {
            return res.status(401).json({ message: 'Unauthorized' });
        }
        res.status(200).json(req.user);
    },
    profile: async (req, res) => {
        if (!req.user) {
            return res.status(401).json({ message: 'Unauthorized' });
        }
        const userId = req.user.id;
        const userInfo = await user_model_1.UserModel.findOne({ _id: userId });
        if (!userInfo) {
            return res.status(404).json({ ok: false, message: 'User not found' });
        }
        const { password, favorites, registeredAt, role, ...safeUser } = userInfo.toObject();
        res.status(200).json({ ok: true, user: safeUser });
    },
    changePassword: async (req, res) => {
        try {
            const userId = req.user?.id;
            if (!userId)
                return res.status(401).json({ message: 'Unauthorized' });
            const { currentPassword, newPassword } = req.body ?? {};
            if (!currentPassword || !newPassword) {
                return res.status(400).json({ message: 'currentPassword and newPassword are required' });
            }
            const hasUppercase = typeof newPassword === 'string' && /[A-Z]/.test(newPassword);
            const hasNumber = typeof newPassword === 'string' && /\d/.test(newPassword);
            const hasSpecial = typeof newPassword === 'string' && /[^A-Za-z0-9]/.test(newPassword);
            if (!hasUppercase || !hasNumber || !hasSpecial) {
                return res.status(400).json({
                    message: 'Password must include at least one uppercase letter, one number, and one special character',
                });
            }
            const user = await user_model_1.UserModel.findById(userId).select('password');
            if (!user)
                return res.status(404).json({ message: 'User not found' });
            const ok = await (0, bcrypt_1.compare)(currentPassword, user.password);
            if (!ok)
                return res.status(400).json({ message: 'Current password is incorrect' });
            const hashed = await (0, bcrypt_1.hash)(newPassword, 10);
            user.password = hashed;
            await user.save();
            return res.json({ ok: true, message: 'Password updated' });
        }
        catch (_e) {
            return res.status(500).json({ error: 'Error changing password' });
        }
    },
    forgotPassword: async (req, res) => {
        try {
            const { email } = req.body ?? {};
            if (!email)
                return res.status(400).json({ message: 'email is required' });
            const user = await user_model_1.UserModel.findOne({ email }).select('_id email');
            if (!user)
                return res.json({ ok: true }); // no filtrar usuarios
            const token = jsonwebtoken_1.default.sign({ id: String(user._id), purpose: 'reset' }, env_1.env.jwt_secret, {
                expiresIn: '30m',
            });
            const linkBase = env_1.env.frontendOrigins[0] || 'http://localhost:3000';
            const link = `${linkBase}/reset-password?token=${encodeURIComponent(token)}`;
            await (0, mailer_1.sendEmail)({
                to: user.email,
                subject: 'Recuperar contraseña',
                text: `Para restablecer tu contraseña, abre este enlace: ${link}`,
                html: `<p>Para restablecer tu contraseña, abre este enlace:</p><p><a href="${link}">Restablecer contraseña</a></p>`,
            });
            return res.json({ ok: true });
        }
        catch (_e) {
            return res.status(500).json({ error: 'Error starting password recovery' });
        }
    },
    resetPassword: async (req, res) => {
        try {
            const { token, newPassword } = req.body ?? {};
            if (!token || !newPassword)
                return res.status(400).json({ message: 'token and newPassword are required' });
            const hasUppercase = typeof newPassword === 'string' && /[A-Z]/.test(newPassword);
            const hasNumber = typeof newPassword === 'string' && /\d/.test(newPassword);
            const hasSpecial = typeof newPassword === 'string' && /[^A-Za-z0-9]/.test(newPassword);
            if (!hasUppercase || !hasNumber || !hasSpecial) {
                return res.status(400).json({
                    message: 'Password must include at least one uppercase letter, one number, and one special character',
                });
            }
            const decoded = jsonwebtoken_1.default.verify(token, env_1.env.jwt_secret);
            if (!decoded?.id || decoded?.purpose !== 'reset') {
                return res.status(400).json({ message: 'Invalid token' });
            }
            const user = await user_model_1.UserModel.findById(decoded.id).select('_id password');
            if (!user)
                return res.status(404).json({ message: 'User not found' });
            const hashed = await (0, bcrypt_1.hash)(newPassword, 10);
            user.password = hashed;
            await user.save();
            return res.json({ ok: true, message: 'Password reset successfully' });
        }
        catch (_e) {
            return res.status(400).json({ error: 'Invalid or expired token' });
        }
    },
};
