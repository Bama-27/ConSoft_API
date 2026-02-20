// models/Quotation.ts
import { Schema, model, Types } from 'mongoose';

const QuotationItemSchema = new Schema(
	{
		product: {
			type: Types.ObjectId,
			ref: 'Producto',
			required: false, // null para productos custom
			default: null,
		},
		isCustom: { type: Boolean, default: false }, // Flag para productos personalizados

		// ✅ customDetails solo tiene info adicional para productos custom
		customDetails: {
			name: {
				type: String,
				trim: true,
				required: function (this: any) {
					return this.parent().isCustom; // ✅ Accede al campo padre
				},
			},
			description: {
				type: String,
				trim: true,
				required: function (this: any) {
					return this.parent().isCustom;
				},
			},
			woodType: { type: String, trim: true },
			referenceImage: { type: String }, // Base64 o URL
		},

		// ✅ Campos comunes para TODOS los items (custom y normales)
		quantity: { type: Number, required: true, min: 1, default: 1 },
		color: { type: String, trim: true, required: true },
		size: { type: String, trim: true, default: '' },
		price: { type: Number, required: false, default: 0 }, // precio unitario
		adminNotes: { type: String, trim: true, default: '' },
		itemStatus: {
			type: String,
			enum: ['normal', 'pending_quote', 'quoted', 'confirmed'],
			default: 'normal',
		},
	},
	{ _id: true },
);

const QuotationSchema = new Schema(
	{
		user: { type: Types.ObjectId, ref: 'User', required: true },
		status: {
			type: String,
			enum: ['Carrito', 'Solicitada', 'En proceso', 'Cotizada', 'Cerrada'],
			default: 'Carrito',
		},
		items: { type: [QuotationItemSchema], default: [] },
		totalEstimate: { type: Number, default: 0 }, // suma de todos los items.total
		adminNotes: { type: String, trim: true },
	},
	{ timestamps: true, collection: 'cotizaciones' },
);

// Garantiza UN solo carrito activo por usuario
QuotationSchema.index(
	{ user: 1, status: 1 },
	{ unique: true, partialFilterExpression: { status: 'Carrito' } },
);

// Índices para listados
QuotationSchema.index({ user: 1, createdAt: -1 });
QuotationSchema.index({ status: 1, createdAt: -1 });

export const QuotationModel = model('Cotizacion', QuotationSchema);
