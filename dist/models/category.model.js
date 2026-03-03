"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CategoryModel = void 0;
const mongoose_1 = require("mongoose");
const CategorySchema = new mongoose_1.Schema({
    name: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
});
//Virtual populate
CategorySchema.virtual('products', {
    ref: 'Producto',
    localField: '_id',
    foreignField: 'category',
});
CategorySchema.set('toJSON', { virtuals: true });
// Índice por nombre para búsquedas
CategorySchema.index({ name: 1 });
exports.CategoryModel = (0, mongoose_1.model)('Categoria', CategorySchema);
