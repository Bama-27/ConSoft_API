"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CategoryController = exports.CategoryControlleer = void 0;
const category_model_1 = require("../models/category.model");
const crud_controller_1 = require("./crud.controller");
const base = (0, crud_controller_1.createCrudController)(category_model_1.CategoryModel);
exports.CategoryControlleer = {
    ...base,
    list: async (req, res) => {
        try {
            const categories = await category_model_1.CategoryModel.find().populate('products');
            if (!categories) {
                return res.status(404).json({ ok: false, message: 'No categories found' });
            }
            res.status(200).json({ ok: true, categories });
        }
        catch (error) {
            console.log(error);
            res.status(500).json({ message: 'Internal server error' });
        }
    },
    create: async (req, res) => {
        try {
            const { name, description } = req.body ?? {};
            if (!name || typeof name !== 'string' || !name.trim()) {
                return res.status(400).json({ message: 'name is required' });
            }
            const created = await category_model_1.CategoryModel.create({ name: name.trim(), description });
            return res.status(201).json(created);
        }
        catch (error) {
            console.log(error);
            return res.status(500).json({ message: 'Internal server error' });
        }
    },
};
// Alias para mantener compatibilidad y evitar errores por el typo
exports.CategoryController = exports.CategoryControlleer;
