"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OrderModel = void 0;
// models/order.model.ts
const mongoose_1 = require("mongoose");
const PaymentSchema = new mongoose_1.Schema({
    amount: { type: Number, required: true },
    paidAt: { type: Date, required: true },
    method: { type: String, required: true, trim: true },
    status: { type: String, required: true, trim: true },
    receiptUrl: { type: String, trim: true },
    ocrText: { type: String, trim: true },
});
const AttachmentSchema = new mongoose_1.Schema({
    url: { type: String, required: true, trim: true },
    type: { type: String, required: true, trim: true },
    uploadedBy: { type: mongoose_1.Types.ObjectId, ref: 'User', required: true },
    uploadedAt: { type: Date, default: () => new Date() },
    item_id: { type: mongoose_1.Types.ObjectId, required: true },
}, { _id: true });
const ReviewSchema = new mongoose_1.Schema({
    user: { type: mongoose_1.Types.ObjectId, ref: 'User', required: true },
    rating: { type: Number, required: true, min: 1, max: 5 },
    comment: { type: String, trim: true },
    createdAt: { type: Date, default: () => new Date() },
}, { _id: true });
const OrderSchema = new mongoose_1.Schema({
    user: { type: mongoose_1.Types.ObjectId, ref: 'User', required: true },
    // 🔥 NUEVOS ESTADOS
    status: {
        type: String,
        required: true,
        trim: true,
        enum: ['Pendiente', 'Pendiente (abono parcial)', 'En proceso', 'Completado', 'Cancelado'],
        default: 'Pendiente'
    },
    address: { type: String, trim: true },
    startedAt: { type: Date },
    deliveredAt: { type: Date },
    productionStartedAt: { type: Date }, // 🔥 Cuándo inició producción (al alcanzar 30%)
    // 🔥 NUEVO: Abono inicial
    initialPayment: {
        amount: { type: Number, default: 0 },
        method: { type: String, enum: ['offline_cash', 'offline_transfer', null], default: null },
        registeredAt: { type: Date },
        registeredBy: { type: mongoose_1.Types.ObjectId, ref: 'User' }
    },
    items: [
        {
            tipo: { type: String, enum: ['producto', 'servicio'], required: true, trim: true, default: "servicio" },
            id_producto: { type: mongoose_1.Types.ObjectId, ref: 'Producto' },
            id_servicio: { type: mongoose_1.Types.ObjectId, ref: 'Servicio' },
            imageUrl: { type: String, trim: true },
            detalles: { type: String },
            cantidad: { type: Number, default: 1 },
            valor: { type: Number },
        }
    ],
    payments: { type: [PaymentSchema], default: [] },
    attachments: { type: [AttachmentSchema], default: [] },
    reviews: { type: [ReviewSchema], default: [] },
}, { timestamps: true });
// 🔥 Método helper para calcular totales
OrderSchema.methods.calculateTotals = function () {
    const total = this.items.reduce((sum, item) => sum + (item.valor || 0), 0);
    const APPROVED = new Set(['aprobado', 'confirmado']);
    const paid = this.payments.reduce((sum, p) => {
        const status = String(p.status || '').toLowerCase();
        return APPROVED.has(status) ? sum + (p.amount || 0) : sum;
    }, 0);
    return { total, paid, restante: total - paid };
};
// 🔥 Método para actualizar estado según pagos
OrderSchema.methods.updateStatusFromPayments = function () {
    const { total, paid } = this.calculateTotals();
    const initialAmount = this.initialPayment?.amount || 0;
    const totalWithInitial = paid; // Los pagos ya incluyen todo, pero el initialPayment ya debería estar en payments
    if (totalWithInitial >= total) {
        this.paymentStatus = 'Pagado';
        this.status = 'Completado';
    }
    else if (totalWithInitial >= total * 0.3) {
        this.status = 'En proceso';
        if (!this.productionStartedAt) {
            this.productionStartedAt = new Date();
        }
    }
    else if (totalWithInitial > 0) {
        this.status = 'Pendiente (abono parcial)';
    }
    else {
        this.status = 'Pendiente';
    }
};
// Índices
OrderSchema.index({ user: 1, status: 1, startedAt: -1 });
OrderSchema.index({ status: 1, startedAt: -1 });
exports.OrderModel = (0, mongoose_1.model)('Pedido', OrderSchema);
