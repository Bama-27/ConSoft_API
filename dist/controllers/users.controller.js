"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UserController = void 0;
const user_model_1 = require("../models/user.model");
const crud_controller_1 = require("./crud.controller");
const bcrypt_1 = require("bcrypt");
const env_1 = require("../config/env");
const role_model_1 = require("../models/role.model");
const jwt_1 = require("../utils/jwt");
const base = (0, crud_controller_1.createCrudController)(user_model_1.UserModel);
exports.UserController = {
    ...base,
    // Perfil del usuario autenticado (datos completos, sin password)
    me: async (req, res) => {
        try {
            const userId = req.user?.distinctId || req.user?.id;
            if (!userId)
                return returnError(res, 401, 'Unauthorized');
            const u = await user_model_1.UserModel.findById(userId)
                .select('-password -__v')
                .populate({ path: 'role', select: 'name description permissions' });
            if (!u)
                return returnError(res, 404, 'User not found');
            return res.json({ ok: true, user: u });
        }
        catch (e) {
            return returnError(res, 500, 'Error fetching profile');
        }
    },
    // Actualizar perfil propio (sin cambiar password/role)
    updateMe: async (req, res) => {
        try {
            const userId = req.user?.id;
            if (!userId)
                return returnError(res, 401, 'Unauthorized');
            const { password, role, email, name, phone, address, ...rest } = req.body ?? {};
            if (password != null)
                return returnError(res, 400, 'Password cannot be changed via this endpoint');
            if (role != null)
                return returnError(res, 400, 'Role cannot be changed via this endpoint');
            const updateDoc = {};
            if (name != null)
                updateDoc.name = String(name);
            if (phone != null)
                updateDoc.phone = String(phone);
            if (address != null)
                updateDoc.address = String(address);
            if (email != null) {
                const exists = await user_model_1.UserModel.findOne({ email, _id: { $ne: userId } }).select('_id');
                if (exists)
                    return returnError(res, 400, 'This email is already in use');
                updateDoc.email = String(email);
            }
            // permitimos campos extra no sensibles si existieran (ej. metadata)
            Object.assign(updateDoc, rest);
            const imageUrl = req.file?.path || null;
            if (imageUrl)
                updateDoc.profile_picture = imageUrl;
            const updated = await user_model_1.UserModel.findByIdAndUpdate(userId, updateDoc, { new: true })
                .select('-password -__v')
                .populate({ path: 'role', select: 'name description' });
            if (!updated)
                return returnError(res, 404, 'Not found');
            return res.json({ ok: true, user: updated });
        }
        catch (e) {
            return returnError(res, 500, 'Error updating profile');
        }
    },
    list: async (req, res) => {
        try {
            const users = await user_model_1.UserModel.find().select('-password -__v').populate({
                path: 'role',
                select: 'name description',
            });
            res.status(200).json({ ok: true, users });
        }
        catch (err) {
            res.status(500).json({ error: 'Error during fetching users' });
        }
    },
    create: async (req, res) => {
        try {
            const { name, email, password } = req.body;
            // Validación de contraseña
            const hasUppercase = typeof password === 'string' && /[A-Z]/.test(password);
            const hasNumber = typeof password === 'string' && /\d/.test(password);
            const hasSpecial = typeof password === 'string' && /[^A-Za-z0-9]/.test(password);
            if (!password || !hasUppercase || !hasNumber || !hasSpecial) {
                return res.status(400).json({
                    message: 'Password must include at least one uppercase letter, one number, and one special character',
                });
            }
            // Email único
            const existing = await user_model_1.UserModel.findOne({ email });
            if (existing) {
                return res.status(400).json({ message: 'This email is already in use' });
            }
            const hashedPass = await (0, bcrypt_1.hash)(password, 10);
            // 🔥 ASIGNACIÓN FIJA DEL ROL
            const DEFAULT_ROLE_ID = '693784c6753b94da92239f4f';
            const newUser = await user_model_1.UserModel.create({
                name,
                email,
                password: hashedPass,
                role: DEFAULT_ROLE_ID,
            });
            const payload = {
                id: newUser._id,
                email: newUser.email,
                address: newUser.address,
            };
            const token = (0, jwt_1.generateToken)(payload);
            res.cookie('token', token, {
                httpOnly: true,
                secure: env_1.env.nodeEnv === 'production',
                sameSite: env_1.env.nodeEnv === 'production' ? 'none' : 'lax',
                maxAge: 1000 * 60 * 60 * 2,
            });
            return res.json({ message: 'User registered successfully' });
        }
        catch (err) {
            console.log(err);
            return res.status(500).json({ error: 'Error during register' });
        }
    },
    update: async (req, res) => {
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
                const existing = await user_model_1.UserModel.findOne({ email, _id: { $ne: userId } }).select('_id');
                if (existing) {
                    return res.status(400).json({ message: 'This email is already in use' });
                }
            }
            // Construir objeto de actualización permitido
            const updateDoc = { ...rest };
            if (email != null)
                updateDoc.email = email;
            // Permitir cambio de rol (admin ya está controlado por permisos en la ruta)
            if (role != null) {
                const roleExists = await role_model_1.RoleModel.findById(role).select('_id');
                if (!roleExists) {
                    return res.status(400).json({ message: 'Invalid role id' });
                }
                updateDoc.role = role;
            }
            const imageUrl = req.file?.path || null;
            if (imageUrl)
                updateDoc.profile_picture = imageUrl;
            const updated = await user_model_1.UserModel.findByIdAndUpdate(userId, updateDoc, { new: true })
                .select('-password -__v')
                .populate({ path: 'role', select: 'name description' });
            if (!updated)
                return res.status(404).json({ message: 'Not found' });
            return res.json(updated);
        }
        catch (err) {
            return res.status(500).json({ error: 'Error updating user' });
        }
    },
    get: async (req, res) => {
        try {
            const { id } = req.params; // ID del usuario desde la URL
            if (!id) {
                return res.status(400).json({ message: 'El ID del usuario es obligatorio' });
            }
            // Buscar usuario por id y popular favorites
            const user = await user_model_1.UserModel.findById(id).populate('favorites');
            if (!user) {
                return res.status(404).json({ message: 'Usuario no encontrado' });
            }
            return res.status(200).json({ data: user });
        }
        catch (error) {
            console.error('Error en getUserById:', error);
            return res.status(500).json({ message: 'Error interno del servidor' });
        }
    },
};
function returnError(res, code, message) {
    return res.status(code).json({ message });
}
