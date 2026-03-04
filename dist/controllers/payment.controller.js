"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PaymentController = void 0;
const order_model_1 = require("../models/order.model");
const crud_controller_1 = require("./crud.controller");
const ocr_1 = require("../utils/ocr");
const base = (0, crud_controller_1.createCrudController)(order_model_1.OrderModel);
exports.PaymentController = {
    ...base,
    calculateOrderTotals: (order) => {
        const total = (order?.items ?? []).reduce((sum, item) => sum + (item?.valor || 0), 0);
        const APPROVED = new Set(['aprobado', 'confirmado']);
        const paid = (order?.payments ?? []).reduce((sum, p) => {
            const status = String(p?.status || '').toLowerCase();
            return APPROVED.has(status) ? sum + (p?.amount || 0) : sum;
        }, 0);
        // 🔥 Agregar información del abono inicial
        const initialPayment = order?.initialPayment?.amount || 0;
        const necesitaAbono = initialPayment < total * 0.3;
        const porcentajeAbono = total > 0 ? (initialPayment / total) * 100 : 0;
        return {
            total,
            paid,
            restante: total - paid,
            necesitaAbono,
            porcentajeAbono,
        };
    },
    list: async (req, res) => {
        try {
            const orders = await order_model_1.OrderModel.find();
            const payments = orders.map((order) => {
                const { total, paid, restante, necesitaAbono, porcentajeAbono } = exports.PaymentController.calculateOrderTotals(order);
                let acumulado = 0;
                const APPROVED = new Set(['aprobado', 'confirmado']);
                const pagosConRestante = order.payments.map((p) => {
                    const status = String(p.status || '').toLowerCase();
                    if (APPROVED.has(status)) {
                        acumulado += p.amount || 0;
                    }
                    return {
                        ...p.toObject(),
                        restante: total - acumulado,
                    };
                });
                return {
                    _id: order._id,
                    total,
                    paid: acumulado,
                    restante: total - acumulado,
                    necesitaAbono,
                    porcentajeAbono,
                    payments: pagosConRestante,
                };
            });
            res.status(200).json({ ok: true, payments });
        }
        catch (error) {
            console.error(error);
            res.status(500).json({ message: 'Internal server error' });
        }
    },
    get: async (req, res) => {
        try {
            const orderId = req.params.id;
            const order = await order_model_1.OrderModel.findById(orderId);
            if (!order)
                return res.status(404).json({ message: 'Order not found' });
            const { total, paid, restante, necesitaAbono, porcentajeAbono } = exports.PaymentController.calculateOrderTotals(order);
            let acumulado = 0;
            const APPROVED = new Set(['aprobado', 'confirmado']);
            const pagosConRestante = order.payments.map((p) => {
                const status = String(p.status || '').toLowerCase();
                if (APPROVED.has(status)) {
                    acumulado += p.amount || 0;
                }
                return {
                    ...p.toObject(),
                    restante: total - acumulado,
                };
            });
            return res.json({
                _id: order._id,
                total,
                paid: acumulado,
                restante: total - acumulado,
                necesitaAbono,
                porcentajeAbono,
                payments: pagosConRestante,
            });
        }
        catch (error) {
            console.error(error);
            return res.status(500).json({ message: 'Internal server error' });
        }
    },
    create: async (req, res) => {
        try {
            const { orderId, amount, paidAt, method, status } = req.body;
            if (!orderId || amount == null || !paidAt || !method || !status) {
                return res
                    .status(400)
                    .json({ message: 'orderId, amount, paidAt, method, status are required' });
            }
            const order = await order_model_1.OrderModel.findById(orderId);
            if (!order)
                return res.status(404).json({ message: 'Order not found' });
            order.payments.push({ amount, paidAt, method, status });
            await order.save();
            const payment = order.payments[order.payments.length - 1];
            return res.status(201).json(payment);
        }
        catch (error) {
            console.error(error);
            return res.status(500).json({ message: 'Internal server error' });
        }
    },
    // Preview de pago a partir de imagen con OCR (NO crea pago)
    createFromReceiptOcr: async (req, res) => {
        try {
            console.log('req.file:', req.file);
            const orderId = req.params.id || req.body.orderId;
            const file = req.file;
            if (!orderId)
                return res.status(400).json({ message: 'orderId is required (path or body)' });
            if (!file?.path)
                return res.status(400).json({ message: 'payment_image file is required' });
            const order = await order_model_1.OrderModel.findById(orderId);
            if (!order)
                return res.status(404).json({ message: 'Order not found' });
            const totals = exports.PaymentController.calculateOrderTotals(order);
            // Extraer texto y parsear monto
            const text = await (0, ocr_1.extractTextFromImage)(file.path);
            console.log('OCR text:', text);
            const parsedAmount = (0, ocr_1.parseAmountFromText)(text || '');
            console.log('Parsed amount:', parsedAmount);
            if (parsedAmount == null) {
                return res.status(422).json({
                    message: 'No se pudo detectar un monto válido en el comprobante',
                    ocrText: text,
                });
            }
            const projectedRestante = totals.restante - parsedAmount;
            return res.status(200).json({
                ok: true,
                orderId: String(order._id),
                current: {
                    total: totals.total,
                    paid: totals.paid,
                    restante: totals.restante,
                },
                detectedAmount: parsedAmount,
                projected: {
                    amountToPay: parsedAmount,
                    restanteAfter: projectedRestante,
                },
                receipt: {
                    receiptUrl: file.path,
                    ocrText: text,
                },
            });
        }
        catch (error) {
            console.error(error);
            return res.status(500).json({ message: 'Internal server error' });
        }
    },
    // Enviar solicitud de aprobación (crea pago en estado pendiente)
    submitReceiptOcr: async (req, res) => {
        try {
            const orderId = req.params.id || req.body.orderId;
            const { amount, paidAt, method, receiptUrl, ocrText } = req.body ?? {};
            if (!orderId)
                return res.status(400).json({ message: 'orderId is required' });
            const parsedAmount = Number(amount);
            if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
                return res.status(400).json({ message: 'amount must be a positive number' });
            }
            const order = await order_model_1.OrderModel.findById(orderId);
            if (!order)
                return res.status(404).json({ message: 'Order not found' });
            // Agregar el pago
            order.payments.push({
                amount: parsedAmount,
                paidAt: paidAt ? new Date(paidAt) : new Date(),
                method: String(method ?? 'comprobante'),
                status: 'pendiente', // Pendiente de aprobación
                receiptUrl: receiptUrl ? String(receiptUrl) : undefined,
                ocrText: ocrText ? String(ocrText) : undefined,
            });
            // Guardar antes de actualizar estado
            await order.save();
            // 🔥 Actualizar estado basado en los pagos aprobados (solo aprobados)
            // Nota: este nuevo pago está pendiente, no afecta aún
            const payment = order.payments[order.payments.length - 1];
            return res.status(201).json({ ok: true, payment });
        }
        catch (error) {
            console.error(error);
            return res.status(500).json({ message: 'Internal server error' });
        }
    },
    update: async (req, res) => {
        try {
            const orderId = req.params.id;
            const { paymentId, amount, paidAt, method, status } = req.body;
            if (!paymentId)
                return res.status(400).json({ message: 'paymentId is required' });
            const update = {};
            if (amount != null)
                update['payments.$.amount'] = amount;
            if (paidAt != null)
                update['payments.$.paidAt'] = paidAt;
            if (method != null)
                update['payments.$.method'] = method;
            if (status != null)
                update['payments.$.status'] = status;
            const updated = await order_model_1.OrderModel.findOneAndUpdate({ _id: orderId, 'payments._id': paymentId }, { $set: update }, { new: true });
            if (!updated)
                return res.status(404).json({ message: 'Order or payment not found' });
            const payment = updated.payments.id(paymentId);
            return res.json(payment);
        }
        catch (error) {
            console.error(error);
            return res.status(500).json({ message: 'Internal server error' });
        }
    },
    remove: async (req, res) => {
        try {
            const orderId = req.params.id;
            const { paymentId } = req.body;
            if (!paymentId)
                return res.status(400).json({ message: 'paymentId is required' });
            const updated = await order_model_1.OrderModel.findByIdAndUpdate(orderId, { $pull: { payments: { _id: paymentId } } }, { new: true });
            if (!updated)
                return res.status(404).json({ message: 'Order not found' });
            return res.status(204).send();
        }
        catch (error) {
            console.error(error);
            return res.status(500).json({ message: 'Internal server error' });
        }
    },
};
