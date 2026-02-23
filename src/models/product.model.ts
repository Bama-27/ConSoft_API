import { Schema, model, Types, InferSchemaType } from 'mongoose';

const ProductSchema = new Schema(
	{
		name: { type: String, required: true, trim: true },
		description: { type: String, trim: true },
		descriptionC: { type: String, trim: true },
		category: { type: Types.ObjectId, ref: 'Categoria', required: true },
		status: { type: Boolean },
		imageUrl: { type: String },
	},
);

// Índices para listados/filtrado
ProductSchema.index({ category: 1 });
ProductSchema.index({ name: 1 });

export const ProductModel = model('Producto', ProductSchema);
