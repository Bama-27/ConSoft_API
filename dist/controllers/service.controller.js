"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ServiceController = void 0;
const service_model_1 = require("../models/service.model");
const crud_controller_1 = require("./crud.controller");
const base = (0, crud_controller_1.createCrudController)(service_model_1.ServiceModel);
exports.ServiceController = {
    ...base,
    create: async (req, res) => {
        try {
            const { name, description, status } = req.body ?? {};
            if (!name || typeof name !== 'string' || !name.trim()) {
                return res.status(400).json({ message: 'name is required' });
            }
            const imageUrl = req.file?.path || null; // ← igual que en productos
            const created = await service_model_1.ServiceModel.create({
                name: name.trim(),
                description,
                imageUrl,
                status,
            });
            return res.status(201).json(created);
        }
        catch (err) {
            return res.status(500).json({ message: 'Internal server error' });
        }
    },
};
