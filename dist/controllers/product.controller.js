"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProductController = void 0;
const product_model_1 = require("../models/product.model");
const crud_controller_1 = require("./crud.controller");
const base = (0, crud_controller_1.createCrudController)(product_model_1.ProductModel);
exports.ProductController = {
    ...base,
    list: async (req, res) => {
        try {
            const products = await product_model_1.ProductModel.find().populate('category');
            if (!products) {
                return res.status(404).json({ ok: false, message: 'No products found' });
            }
            res.status(200).json({ ok: true, products });
        }
        catch (error) {
            console.error(error);
            res.status(500).json({ message: 'Internal server error' });
        }
    },
    create: async (req, res) => {
        try {
            const { name, category, description, status } = req.body ?? {};
            if (!name || typeof name !== 'string' || !name.trim()) {
                return res.status(400).json({ message: 'name is required' });
            }
            if (!category) {
                return res.status(400).json({ message: 'category is required' });
            }
            const imageUrl = req.file?.path || null;
            // No hay CategoryModel aquí; validación de existencia mínima se omite para evitar dependencia circular
            const created = await product_model_1.ProductModel.create({
                name: name.trim(),
                description,
                category,
                status,
                imageUrl,
            });
            return res.status(201).json(created);
        }
        catch (error) {
            console.error(error);
            return res.status(500).json({ message: 'Internal server error' });
        }
    },
};
