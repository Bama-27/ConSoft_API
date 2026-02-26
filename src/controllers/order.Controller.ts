import { Request, Response } from 'express';
import { OrderModel } from '../models/order.model';
import { createCrudController } from './crud.controller';
import { AuthRequest } from '../middlewares/auth.middleware';
import { ProductModel } from '../models/product.model';
import { ServiceModel } from '../models/service.model';
import mongoose from 'mongoose';

const base = createCrudController(OrderModel);

// 🔥 Helper function para calcular días restantes
// 🔥 Helper function para calcular días restantes - VERSIÓN CORREGIDA
const calcDiasRestantes = (start?: any) => {
	if (!start) return '–';
	
	// Si es una función, no podemos usarla
	if (typeof start === 'function') return '–';
	
	try {
		const hoy = new Date();
		const inicio = new Date(start);
		
		// Verificar si la fecha es válida
		if (isNaN(inicio.getTime())) return '–';
		
		const fin = new Date(inicio);
		fin.setDate(fin.getDate() + 15);
		const diff = Math.ceil((fin.getTime() - hoy.getTime()) / (1000 * 60 * 60 * 24));
		return diff <= 0 ? '0 Días' : `${diff} Días`;
	} catch (error) {
		return '–';
	}
};
// 🔥 Helper function para calcular totales
const calculateOrderTotals = (order: any) => {
	const total = (order?.items ?? []).reduce((sum: number, item: any) => sum + (item?.valor || 0), 0);
	const APPROVED = new Set(['aprobado', 'confirmado']);
	const paid = (order?.payments ?? []).reduce((sum: number, p: any) => {
		const status = String(p?.status || '').toLowerCase();
		return APPROVED.has(status) ? sum + (p?.amount || 0) : sum;
	}, 0);
	return { total, paid, restante: total - paid };
};

export const OrderController = {
	...base,

	// ✅ MÉTODO EXISTENTE: Subir imágenes al pedido
	addAttachments: async (req: AuthRequest, res: Response) => {
		try {
			const userId = req.user?.id;
			const itemId = req.body.item_id;

			if (!userId) return res.status(401).json({ message: 'Unauthorized' });
			const orderId = req.params.id;
			const order = await OrderModel.findById(orderId);
			if (!order) return res.status(404).json({ message: 'Order not found' });
			
			const isOwner = String(order.user) === String(userId);
			const rolePermissions = ((req.user?.role as any)?.permissions ?? []) as any[];
			const hasOrdersUpdatePermission =
				Array.isArray(rolePermissions) &&
				rolePermissions.some((p) => p?.module === 'orders' && p?.action === 'update');
			if (!isOwner && !hasOrdersUpdatePermission) {
				return res.status(403).json({ message: 'Forbidden' });
			}
			const files = ((req as any).files as any[]) ?? [];
			if (!files.length) {
				return res.status(400).json({ message: 'No files uploaded' });
			}
			const newAttachments =
				files.map((f) => ({
					url: f?.path || f?.filename,
					type: 'product_image',
					uploadedBy: userId,
					uploadedAt: new Date(),
					item_id: itemId,
				})) ?? [];

			order.attachments.push(...(newAttachments as any));
			await order.save();
			const populated = await order
				.populate('user', 'name email')
				.then((o) => o.populate('items.id_servicio'))
				.then((o) => o.populate('items.id_producto'));
			return res.status(200).json({ ok: true, order: populated });
		} catch (error) {
			console.error('Error uploading attachments:', error);
			return res.status(500).json({ error: 'Error uploading attachments' });
		}
	},

	// ✅ MÉTODO EXISTENTE: Obtener un pedido por ID
	get: async (req: Request, res: Response) => {
		try {
			const order = await OrderModel.findById(req.params.id)
				.populate('user', '-password -__v ')
				.populate('payments')
				.populate('items.id_servicio')
				.populate('items.id_producto')
				.lean();
				
			if (!order) return res.status(404).json({ message: 'Not found' });
			
			const { total, paid, restante } = calculateOrderTotals(order);
			const necesitaAbono = (order?.initialPayment?.amount || 0) < total * 0.3;
			const porcentajeAbono = total > 0 ? ((order?.initialPayment?.amount || 0) / total) * 100 : 0;
			
			return res.json({ 
				...order, 
				total, 
				paid, 
				restante,
				necesitaAbono,
				porcentajeAbono,
				puedeIniciarProduccion: paid >= total * 0.3
			});
		} catch (error) {
			console.error('Error retrieving order:', error);
			return res.status(500).json({ message: 'Error retrieving order' });
		}
	},

	// ✅ MÉTODO EXISTENTE: Crear reseña
	createReview: async (req: AuthRequest, res: Response) => {
		try {
			const userId = req.user?.id;
			if (!userId) return res.status(401).json({ message: 'Unauthorized' });
			const orderId = req.params.id;
			const { rating, comment } = req.body ?? {};
			const parsedRating = Number(rating);
			if (!Number.isFinite(parsedRating) || parsedRating < 1 || parsedRating > 5) {
				return res.status(400).json({ message: 'rating must be a number between 1 and 5' });
			}
			const order = await OrderModel.findById(orderId).populate('user', '_id');
			if (!order) return res.status(404).json({ message: 'Order not found' });

			const isOwner = String((order as any).user?._id ?? order.user) === String(userId);
			const rolePermissions = ((req.user?.role as any)?.permissions ?? []) as any[];
			const hasOrdersUpdatePermission =
				Array.isArray(rolePermissions) &&
				rolePermissions.some((p) => p?.module === 'orders' && p?.action === 'update');
			if (!isOwner && !hasOrdersUpdatePermission) {
				return res.status(403).json({ message: 'Forbidden' });
			}

			const existing = (order as any).reviews?.some((r: any) => String(r?.user) === String(userId));
			if (existing) {
				return res.status(409).json({ message: 'Review already exists for this order' });
			}

			(order as any).reviews = (order as any).reviews ?? [];
			(order as any).reviews.push({
				user: userId,
				rating: parsedRating,
				comment: comment != null ? String(comment) : undefined,
				createdAt: new Date(),
			});
			await order.save();

			const createdReview = (order as any).reviews[(order as any).reviews.length - 1];
			return res.status(201).json({ ok: true, review: createdReview });
		} catch (_e) {
			console.error('Error creating review:', _e);
			return res.status(500).json({ message: 'Error creating review' });
		}
	},

	// ✅ MÉTODO EXISTENTE: Listar reseñas
	listReviews: async (req: AuthRequest, res: Response) => {
		try {
			const userId = req.user?.id;
			if (!userId) return res.status(401).json({ message: 'Unauthorized' });
			const orderId = req.params.id;
			const order = await OrderModel.findById(orderId).select('user reviews').lean();
			if (!order) return res.status(404).json({ message: 'Order not found' });

			const isOwner = String((order as any).user) === String(userId);
			const rolePermissions = ((req.user?.role as any)?.permissions ?? []) as any[];
			const hasOrdersViewPermission =
				Array.isArray(rolePermissions) &&
				rolePermissions.some((p) => p?.module === 'orders' && p?.action === 'view');
			if (!isOwner && !hasOrdersViewPermission) {
				return res.status(403).json({ message: 'Forbidden' });
			}

			return res.json({ ok: true, reviews: (order as any).reviews ?? [] });
		} catch (_e) {
			console.error('Error listing reviews:', _e);
			return res.status(500).json({ message: 'Error listing reviews' });
		}
	},

	// ✅ MÉTODO EXISTENTE ACTUALIZADO: Crear pedido (admin)
	create: async (req: AuthRequest, res: Response) => {
		try {
			const adminId = req.user?.id;
			if (!adminId) return res.status(401).json({ message: 'Unauthorized' });
			
			const { user, items, address, startedAt, initialPayment } = req.body;
			
			if (!user || !Array.isArray(items) || items.length === 0) {
				return res.status(400).json({ message: 'user and items are required' });
			}

			const total = items.reduce((sum: number, item: any) => sum + (item.valor || 0), 0);
			
			let status = 'Pendiente';
			let productionStartedAt = null;
			let payments: any[] = [];
			
			if (initialPayment?.amount > 0) {
				const payment = {
					amount: initialPayment.amount,
					paidAt: new Date(),
					method: initialPayment.method === 'cash' ? 'offline_cash' : 'offline_transfer',
					status: 'aprobado',
				};
				payments = [payment];
				
				if (initialPayment.amount >= total) {
					status = 'Completado';
				} else if (initialPayment.amount >= total * 0.3) {
					status = 'En proceso';
					productionStartedAt = new Date();
				} else {
					status = 'Pendiente (abono parcial)';
				}
			}

			const orderData: any = {
				user,
				status,
				address,
				startedAt: startedAt || new Date(),
				items,
				payments,
				attachments: [],
			};

			if (initialPayment?.amount > 0) {
				orderData.initialPayment = {
					amount: initialPayment.amount,
					method: initialPayment.method === 'cash' ? 'offline_cash' : 'offline_transfer',
					registeredAt: new Date(),
					registeredBy: adminId
				};
				
				if (productionStartedAt) {
					orderData.productionStartedAt = productionStartedAt;
				}
			}

			const order = await OrderModel.create(orderData);
			
			const populatedOrder = await OrderModel.findById(order._id)
				.populate('user', 'name email')
				.populate('items.id_servicio')
				.populate('items.id_producto')
				.lean();

			return res.status(201).json({ ok: true, order: populatedOrder });
		} catch (error) {
			console.error('Error creating order:', error);
			return res.status(500).json({ error: 'Error creating order' });
		}
	},

	// ✅ MÉTODO EXISTENTE ACTUALIZADO: Crear pedido para el usuario autenticado (cliente)
	createForMe: async (req: AuthRequest, res: Response) => {
		try {
			const userId = req.user?.id;
			if (!userId) return res.status(401).json({ message: 'Unauthorized' });
			
			const { items, address, quotationId } = req.body ?? {};
			
			if (!Array.isArray(items) || items.length === 0) {
				return res.status(400).json({ message: 'items is required and must be a non-empty array' });
			}

			let initialPaymentAmount = 0;
			let initialPaymentMethod = null;
			
			if (quotationId) {
				try {
					const QuotationModel = mongoose.model('Cotizacion');
					const quotation = await QuotationModel.findById(quotationId).lean();
					if (quotation && (quotation as any).initialPayment) {
						initialPaymentAmount = (quotation as any).initialPayment.amount || 0;
						initialPaymentMethod = (quotation as any).initialPayment.method;
					}
				} catch (err) {
					console.error('Error fetching quotation:', err);
				}
			}

			const productIds = new Set<string>();
			const serviceIds = new Set<string>();
			const baseItems = items.map((it: any) => {
				const tipo = it.tipo || (it.id_producto ? 'producto' : 'servicio');
				const item: any = { tipo };
				if (tipo === 'producto' && it.id_producto) {
					item.id_producto = it.id_producto;
					productIds.add(String(it.id_producto));
				}
				if (tipo === 'servicio' && it.id_servicio) {
					item.id_servicio = it.id_servicio;
					serviceIds.add(String(it.id_servicio));
				}
				if (it.detalles != null) item.detalles = it.detalles;
				if (it.cantidad != null) {
					const qty = Number(it.cantidad);
					item.cantidad = Number.isFinite(qty) && qty > 0 ? qty : 1;
				}
				if (typeof it.valor === 'number') item.valor = it.valor;
				return item;
			});

			const [products, services] = await Promise.all([
				productIds.size
					? ProductModel.find({ _id: { $in: Array.from(productIds) } }).select('_id imageUrl').lean()
					: [],
				serviceIds.size
					? ServiceModel.find({ _id: { $in: Array.from(serviceIds) } }).select('_id imageUrl').lean()
					: [],
			]);
			
			const prodMap = new Map<string, string>();
			const servMap = new Map<string, string>();
			(products as any[]).forEach((p) => prodMap.set(String(p._id), p.imageUrl || ''));
			(services as any[]).forEach((s) => servMap.set(String(s._id), s.imageUrl || ''));

			const normalizedItems = baseItems.map((it: any) => {
				if (it.tipo === 'producto' && it.id_producto) {
					it.imageUrl = prodMap.get(String(it.id_producto)) || undefined;
				}
				if (it.tipo === 'servicio' && it.id_servicio) {
					it.imageUrl = servMap.get(String(it.id_servicio)) || undefined;
				}
				return it;
			});

			const total = normalizedItems.reduce((sum: number, item: any) => sum + (item.valor || 0), 0);
			
			let status = 'Pendiente';
			let payments: any[] = [];
			let productionStartedAt = null;
			
			if (initialPaymentAmount > 0) {
				payments.push({
					amount: initialPaymentAmount,
					paidAt: new Date(),
					method: initialPaymentMethod === 'cash' ? 'offline_cash' : 'offline_transfer',
					status: 'aprobado',
				});
				
				if (initialPaymentAmount >= total) {
					status = 'Completado';
				} else if (initialPaymentAmount >= total * 0.3) {
					status = 'En proceso';
					productionStartedAt = new Date();
				} else {
					status = 'Pendiente (abono parcial)';
				}
			}

			const order = await OrderModel.create({
				user: userId,
				status,
				address,
				startedAt: new Date(),
				items: normalizedItems,
				payments,
				attachments: [],
				productionStartedAt,
				initialPayment: initialPaymentAmount > 0 ? {
					amount: initialPaymentAmount,
					method: initialPaymentMethod === 'cash' ? 'offline_cash' : 'offline_transfer',
					registeredAt: new Date(),
					registeredBy: userId
				} : null
			});

			const populatedOrder = await OrderModel.findById(order._id)
				.populate('user', 'name email')
				.populate('items.id_servicio')
				.populate('items.id_producto')
				.lean();

			return res.status(201).json({ ok: true, order: populatedOrder });
		} catch (error) {
			console.error('Error creating order for me:', error);
			return res.status(500).json({ error: 'Error creating order' });
		}
	},

	// ✅ MÉTODO EXISTENTE ACTUALIZADO: Listar pedidos (admin)
	list: async (req: Request, res: Response) => {
		try {
			const orders = await OrderModel.find()
				.sort({ createdAt: -1 })
				.populate('user', '-password -__v ')
				.populate('payments')
				.populate('items.id_servicio')
				.populate('items.id_producto')
				.lean();

			const result = orders
				.map((order) => {
					const { total, paid, restante } = calculateOrderTotals(order);
					const necesitaAbono = (order?.initialPayment?.amount || 0) < total * 0.3;
					
					return {
						...order,
						total,
						paid,
						restante,
						necesitaAbono,
						paymentStatus: restante <= 0 ? 'Pagado' : 'Pendiente',
					};
				})
				.filter((order) => order.paymentStatus != 'Pagado');

			res.json(result);
		} catch (error) {
			console.error('Error listing orders:', error);
			res.status(500).json({ message: 'Error retrieving orders' });
		}
	},

	// ✅ MÉTODO EXISTENTE ACTUALIZADO: Listar pedidos del usuario autenticado
	listMine: async (req: AuthRequest, res: Response) => {
		try {
			const userId = req.user?.id;
			if (!userId) return res.status(401).json({ message: 'Unauthorized' });
			
			const orders = await OrderModel.find({ user: userId })
				.populate('user', '-password -__v ')
				.populate('payments')
				.populate('items.id_servicio')
				.populate('items.id_producto')
				.sort({ startedAt: -1 })
				.lean();

			const result = orders.map((order) => {
				const { total, paid, restante } = calculateOrderTotals(order);
				const necesitaAbono = (order?.initialPayment?.amount || 0) < total * 0.3;
				const porcentajeAbono = total > 0 ? ((order?.initialPayment?.amount || 0) / total) * 100 : 0;
				
				let nombre = 'Pedido';
				const firstItem = order.items?.[0];
				if (firstItem) {
					if (firstItem.id_servicio && typeof firstItem.id_servicio === 'object' && (firstItem.id_servicio as any).name) {
						nombre = (firstItem.id_servicio as any).name;
					} else if (firstItem.id_producto && typeof firstItem.id_producto === 'object' && (firstItem.id_producto as any).name) {
						nombre = (firstItem.id_producto as any).name;
					}
				}
				
				return {
					id: order._id,
					nombre,
					estado: order.status,
					valor: `$${total.toLocaleString('es-CO')} COP`,
					restante: restante.toLocaleString('es-CO'),
					dias: calcDiasRestantes(order.startedAt),
					requiereAbono: necesitaAbono,
					porcentajeAbono,
					raw: {
						_id: order._id,
						total,
						initialPaymentAmount: order?.initialPayment?.amount || 0,
						payments: order.payments,
						status: order.status,
					}
				};
			});

			return res.json({ ok: true, orders: result });
		} catch (error) {
			console.error('Error in listMine:', error);
			return res.status(500).json({ error: 'Error retrieving my orders' });
		}
	},
};