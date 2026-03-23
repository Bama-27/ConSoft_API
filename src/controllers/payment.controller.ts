import { Request, Response } from 'express';
import { OrderModel } from '../models/order.model';
import { createCrudController } from './crud.controller';
import { extractTextFromImage, parseAmountFromText, parseReferenceFromText } from '../utils/ocr';

const base = createCrudController(OrderModel);

export const PaymentController = {
	...base,
	calculateOrderTotals: (order: any) => {
		const total = (order?.items ?? []).reduce(
			(sum: number, item: any) => sum + (item?.valor || 0),
			0,
		);
		const APPROVED = new Set(['aprobado', 'approved', 'confirmado', 'pagado', 'paid']);
		const PENDING = new Set(['pendiente', 'pending', 'en_revision', 'en_proceso', 'processing']);

		let paidApproved = 0;
		let paidPending = 0;

		// Ordenar pagos por fecha
		const payments = Array.isArray(order?.payments) ? order.payments : [];
		const sortedPayments = [...payments].sort((a, b) =>
			new Date(a.paidAt).getTime() - new Date(b.paidAt).getTime()
		);

		let runningTotal = 0;
		const historyPayments = sortedPayments.map(p => {
			const status = String(p?.status || '').toLowerCase();
			const amount = Number(p.amount || 0);
			if (APPROVED.has(status)) {
				paidApproved += amount;
			} else if (PENDING.has(status)) {
				paidPending += amount;
			}
			runningTotal += amount;

			const pObj = typeof p.toObject === 'function' ? p.toObject() : p;

			return {
				...pObj,
				proyectado: total - runningTotal
			};
		});

		const paidTotal = paidApproved + paidPending;

		// 🔥 Agregar información del abono inicial
		const initialPaymentValue = order?.initialPayment?.amount || 0;
		const necesitaAbono = initialPaymentValue < total * 0.3;
		const porcentajeAbono = total > 0 ? (initialPaymentValue / total) * 100 : 0;

		return {
			total,
			paid: paidApproved,
			paidApproved,
			paidPending,
			paidTotal,
			restante: total - paidApproved,
			restanteConPendientes: total - paidTotal,
			necesitaAbono,
			porcentajeAbono,
			payments: historyPayments
		};
	},

	list: async (req: Request, res: Response) => {
		try {
			const page = Math.max(1, Number(req.query.page) || 1);
			const limit = Math.max(1, Number(req.query.limit) || 20);
			const skip = (page - 1) * limit;

			const matchFilter: any = {};
			if (req.query.search) {
				const searchStr = String(req.query.search);
				const escapedSearch = searchStr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
				const regex = new RegExp(escapedSearch, 'i');
				
				// Buscar por nombre del usuario
				const userMatches = await import('../models/user.model').then(m => m.UserModel.find({ name: regex }).select('_id'));
				const userIds = userMatches.map(u => u._id);
				
				const orConditions: any[] = [
					{ user: { $in: userIds } }
				];

				// Si es un ID parcial (hexadecimal), buscar por _id
				if (searchStr.match(/^[0-9a-fA-F]+$/)) {
					orConditions.push({
						$expr: {
							$gt: [
								{ $indexOfCP: [{ $toLower: { $toString: '$_id' } }, searchStr.toLowerCase()] },
								-1
							]
						}
					});
				}

				matchFilter.$or = orConditions;
			}

			// Agregación para desglosar pagos y paginar sobre ellos
			const aggregation = [
				{ $match: matchFilter },
				// Poblar usuario antes de proyectar
				{
					$lookup: {
						from: 'usuarios', // Nombre de la colección de usuarios
						localField: 'user',
						foreignField: '_id',
						as: 'user'
					}
				},
				{ $unwind: { path: '$user', preserveNullAndEmptyArrays: true } },
				// Clonar el documento para mantener el array original
				{
					$project: {
						doc: "$$ROOT",
						payment: "$payments"
					}
				},
				{ $unwind: "$payment" },
				{ $sort: { "payment.paidAt": -1 as any } },
				{
					$facet: {
						metadata: [{ $count: "total" }],
						data: [
							{ $skip: skip },
							{ $limit: limit },
							{
								$project: {
									_id: 0,
									order: "$doc",
									payment: "$payment"
								}
							}
						]
					}
				}
			];

			const [result] = await OrderModel.aggregate(aggregation);
			const totalPayments = result.metadata[0]?.total || 0;

			const payments = result.data.map((item: any) => {
				const order = item.order;
				const totals = PaymentController.calculateOrderTotals(order);
				
				return {
					payment: item.payment,
					summary: {
						...totals,
						_id: order._id,
						user: order.user
					}
				};
			});

			res.status(200).json({
				ok: true,
				payments,
				pagination: {
					page,
					limit,
					total: totalPayments,
					pages: Math.ceil(totalPayments / limit),
				},
			});
		} catch (error) {
			console.error("Error in PaymentController.list:", error);
			res.status(500).json({ message: 'Internal server error' });
		}
	},

	get: async (req: Request, res: Response) => {
		try {
			const orderId = req.params.id;
			const order = await OrderModel.findById(orderId);
			if (!order) return res.status(404).json({ message: 'Order not found' });

			const totals = PaymentController.calculateOrderTotals(order);

			return res.json({
				...totals,
				_id: order._id,
				paid: totals.paidApproved,
			});
		} catch (error) {
			console.error(error);
			return res.status(500).json({ message: 'Internal server error' });
		}
	},

	create: async (req: Request, res: Response) => {
		try {
			const { orderId, amount, paidAt, method, status, reference } = req.body;
			if (!orderId || amount == null || !paidAt || !method || !status) {
				return res
					.status(400)
					.json({ message: 'orderId, amount, paidAt, method, status are required' });
			}

			const order = await OrderModel.findById(orderId);
			if (!order) return res.status(404).json({ message: 'Order not found' });

			order.payments.push({ amount, paidAt, method, status, reference } as any);
			await order.save();

			const payment = order.payments[order.payments.length - 1];
			return res.status(201).json(payment);
		} catch (error) {
			console.error(error);
			return res.status(500).json({ message: 'Internal server error' });
		}
	},

	// Preview de pago a partir de imagen con OCR (NO crea pago)
	createFromReceiptOcr: async (req: Request, res: Response) => {
		try {
			console.log('req.file:', (req as any).file);
			const orderId = req.params.id || req.body.orderId;
			const file: any = (req as any).file;
			if (!orderId)
				return res.status(400).json({ message: 'orderId is required (path or body)' });
			if (!file?.path)
				return res.status(400).json({ message: 'payment_image file is required' });

			const order = await OrderModel.findById(orderId);
			if (!order) return res.status(404).json({ message: 'Order not found' });
			const totals = PaymentController.calculateOrderTotals(order);

			// Extraer texto y parsear monto
			const text = await extractTextFromImage(file.path);
			console.log('OCR text:', text);
			const parsedAmount = parseAmountFromText(text || '');
			const parsedReference = parseReferenceFromText(text || '');
			console.log('Parsed amount:', parsedAmount);
			console.log('Parsed reference:', parsedReference);

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
				detectedReference: parsedReference,
				projected: {
					amountToPay: parsedAmount,
					restanteAfter: projectedRestante,
				},
				receipt: {
					receiptUrl: file.path,
					ocrText: text,
				},
			});
		} catch (error) {
			console.error(error);
			return res.status(500).json({ message: 'Internal server error' });
		}
	},

	// Enviar solicitud de aprobación (crea pago en estado pendiente)
	submitReceiptOcr: async (req: Request, res: Response) => {
		try {
			const orderId = req.params.id || req.body.orderId;
			const { amount, paidAt, method, receiptUrl, ocrText, reference } = req.body ?? {};

			if (!orderId) return res.status(400).json({ message: 'orderId is required' });

			const parsedAmount = Number(amount);
			if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
				return res.status(400).json({ message: 'amount must be a positive number' });
			}

			const order = await OrderModel.findById(orderId);
			if (!order) return res.status(404).json({ message: 'Order not found' });

			// Agregar el pago
			order.payments.push({
				amount: parsedAmount,
				paidAt: paidAt ? new Date(paidAt) : new Date(),
				method: String(method ?? 'comprobante'),
				status: 'pendiente', // Pendiente de aprobación
				receiptUrl: receiptUrl ? String(receiptUrl) : undefined,
				reference: reference ? String(reference) : undefined,
				ocrText: ocrText ? String(ocrText) : undefined,
			} as any);

			// Guardar antes de actualizar estado
			await order.save();

			// 🔥 Actualizar estado basado en los pagos aprobados (solo aprobados)
			// Nota: este nuevo pago está pendiente, no afecta aún
			const payment = order.payments[order.payments.length - 1];

			return res.status(201).json({ ok: true, payment });
		} catch (error) {
			console.error(error);
			return res.status(500).json({ message: 'Internal server error' });
		}
	},
	update: async (req: Request, res: Response) => {
		try {
			const orderId = req.params.id;
			const { paymentId, amount, paidAt, method, status, reference } = req.body;
			if (!paymentId) return res.status(400).json({ message: 'paymentId is required' });

			const update: any = {};
			if (amount != null) update['payments.$.amount'] = amount;
			if (paidAt != null) update['payments.$.paidAt'] = paidAt;
			if (method != null) update['payments.$.method'] = method;
			if (status != null) update['payments.$.status'] = status;
			if (reference != null) update['payments.$.reference'] = reference;

			const updated = await OrderModel.findOneAndUpdate(
				{ _id: orderId, 'payments._id': paymentId },
				{ $set: update },
				{ new: true },
			);
			if (!updated) return res.status(404).json({ message: 'Order or payment not found' });

			const payment = updated.payments.id(paymentId);
			return res.json(payment);
		} catch (error) {
			console.error(error);
			return res.status(500).json({ message: 'Internal server error' });
		}
	},

	remove: async (req: Request, res: Response) => {
		try {
			const orderId = req.params.id;
			const { paymentId } = req.body;
			if (!paymentId) return res.status(400).json({ message: 'paymentId is required' });

			const updated = await OrderModel.findByIdAndUpdate(
				orderId,
				{ $pull: { payments: { _id: paymentId } } },
				{ new: true },
			);
			if (!updated) return res.status(404).json({ message: 'Order not found' });

			return res.status(204).send();
		} catch (error) {
			console.error(error);
			return res.status(500).json({ message: 'Internal server error' });
		}
	},
};
