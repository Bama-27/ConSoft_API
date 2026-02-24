import { Schema, model, Types, InferSchemaType } from 'mongoose';

const PaymentSchema = new Schema(
  {
    amount: { type: Number, required: true },
    paidAt: { type: Date, required: true },
    method: { type: String, required: true, trim: true },
    status: { type: String, required: true, trim: true },
    // Campos opcionales para trazabilidad del comprobante
    receiptUrl: { type: String, trim: true },
    ocrText: { type: String, trim: true },
  },
);

const AttachmentSchema = new Schema(
  {
    url: { type: String, required: true, trim: true },
    type: { type: String, required: true, trim: true },
    uploadedBy: { type: Types.ObjectId, ref: 'User', required: true },
    uploadedAt: { type: Date, default: () => new Date() },
    item_id: { type: Types.ObjectId, required: true }, 
  },
  { _id: true }
);

const ReviewSchema = new Schema(
	{
		user: { type: Types.ObjectId, ref: 'User', required: true },
		rating: { type: Number, required: true, min: 1, max: 5 },
		comment: { type: String, trim: true },
		createdAt: { type: Date, default: () => new Date() },
	},
	{ _id: true }
);



const OrderSchema = new Schema(
  {
    user: { type: Types.ObjectId, ref: 'User', required: true },
    status: { type: String, required: true, trim: true },
    address: { type: String, trim: true },
    startedAt: { type: Date },
    deliveredAt: { type: Date },
    items: [
      {
        // Identifica si el ítem corresponde a un producto o servicio
        tipo: { type: String, enum: ['producto', 'servicio'], required: true, trim: true, default: "servicio" },
        // Referencias opcionales según el tipo
        id_producto: { type: Types.ObjectId, ref: 'Producto' },
        id_servicio: { type: Types.ObjectId, ref: 'Servicio' },
				// Snapshot de imagen del producto/servicio al momento de crear el pedido
				imageUrl: { type: String, trim: true },
        // Datos complementarios
        detalles: { type: String },
        cantidad: { type: Number, default: 1 },
        valor: { type: Number },
      }
    ],
    payments: { type: [PaymentSchema], default: [] },
    attachments: { type: [AttachmentSchema], default: [] },
		reviews: { type: [ReviewSchema], default: [] },
  },
  {timestamps: true}
);

// Índices para reportes y listados
OrderSchema.index({ user: 1, status: 1, startedAt: -1 });
OrderSchema.index({ status: 1, startedAt: -1 });

export const OrderModel = model('Pedido', OrderSchema);





