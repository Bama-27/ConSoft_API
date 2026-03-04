"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RoleController = void 0;
const role_model_1 = require("../models/role.model");
const crud_controller_1 = require("./crud.controller");
const mongoose_1 = __importDefault(require("mongoose"));
const base = (0, crud_controller_1.createCrudController)(role_model_1.RoleModel);
exports.RoleController = {
    ...base,
    list: async (_req, res) => {
        try {
            const roles = await role_model_1.RoleModel.find().populate('usersCount').populate('permissions');
            return res.status(200).json({ ok: true, roles });
        }
        catch (error) {
            console.error(error);
            return res.status(500).json({ error: 'Internal server error' });
        }
    },
    create: async (req, res) => {
        try {
            const { name, description, permissions } = req.body ?? {};
            if (!name || typeof name !== 'string' || !name.trim()) {
                return res.status(400).json({ message: 'name is required' });
            }
            if (permissions != null && !Array.isArray(permissions)) {
                return res.status(400).json({ message: 'must permissions be an array of ids' });
            }
            const cleaned = Array.isArray(permissions)
                ? Array.from(new Set(permissions
                    .filter(Boolean)
                    .map((p) => String(p))
                    .filter((p) => mongoose_1.default.isValidObjectId(p))))
                : undefined;
            const newRole = await role_model_1.RoleModel.create({
                name: name.trim(),
                description,
                permissions: cleaned,
            });
            return res.status(201).json(newRole);
        }
        catch (error) {
            console.error(error);
            return res.status(500).json({ error: 'Internal server error' });
        }
    },
    update: async (req, res) => {
        try {
            const roleId = req.params.id;
            const { name, description, permissions } = req.body ?? {};
            const updateDoc = {};
            if (name != null)
                updateDoc.name = name;
            if (description != null)
                updateDoc.description = description;
            if (permissions != null) {
                if (!Array.isArray(permissions)) {
                    return res.status(400).json({ message: 'permissions must be an array of ids' });
                }
                const cleaned = permissions
                    .filter(Boolean)
                    .map((p) => String(p))
                    .filter((p) => mongoose_1.default.isValidObjectId(p));
                const unique = Array.from(new Set(cleaned));
                updateDoc.permissions = unique;
            }
            const updated = await role_model_1.RoleModel.findByIdAndUpdate(roleId, updateDoc, {
                new: true,
            }).populate('permissions');
            if (!updated)
                return res.status(404).json({ message: 'Not found' });
            return res.json({ ok: true, data: updated });
        }
        catch (error) {
            console.error(error);
            return res.status(500).json({ error: 'Internal server error' });
        }
    },
};
