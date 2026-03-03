"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PermissionController = void 0;
const permission_model_1 = require("../models/permission.model");
const crud_controller_1 = require("./crud.controller");
const base = (0, crud_controller_1.createCrudController)(permission_model_1.PermissionModel);
exports.PermissionController = {
    ...base,
    create: async (req, res) => {
        try {
            const { module, action } = req.body ?? {};
            if (!module || typeof module !== 'string' || !module.trim()) {
                return res.status(400).json({ message: 'module is required' });
            }
            if (!action || typeof action !== 'string' || !action.trim()) {
                return res.status(400).json({ message: 'action is required' });
            }
            const perm = await permission_model_1.PermissionModel.create({ module: module.trim(), action: action.trim() });
            return res.status(201).json(perm);
        }
        catch (err) {
            console.error(err);
            return res.status(500).json({ error: 'Internal server error' });
        }
    },
    list: async (req, res) => {
        try {
            const permisos = await permission_model_1.PermissionModel.aggregate([
                // Derivar module/action desde 'name' si no existen los campos (compatibilidad con seeds antiguos)
                {
                    $addFields: {
                        derivedModule: {
                            $ifNull: [
                                '$module',
                                { $arrayElemAt: [{ $split: ['$name', '.'] }, 0] },
                            ],
                        },
                        derivedAction: {
                            $ifNull: [
                                '$action',
                                { $arrayElemAt: [{ $split: ['$name', '.'] }, 1] },
                            ],
                        },
                    },
                },
                {
                    $group: {
                        _id: '$derivedModule',
                        permissions: {
                            $push: {
                                _id: '$_id',
                                module: '$derivedModule',
                                action: '$derivedAction',
                            },
                        },
                    },
                },
                {
                    $project: {
                        _id: 0,
                        module: '$_id',
                        permissions: 1,
                    },
                },
            ]);
            res.status(200).json({ ok: true, permisos });
        }
        catch (err) {
            console.error(err);
            res.status(500).json({ error: 'Error al obtener permisos' });
        }
    },
};
