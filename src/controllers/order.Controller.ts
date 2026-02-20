import { Request, Response } from 'express';
import { OrderModel } from '../models/order.model';
import { createCrudController } from './crud.controller';
import { AuthRequest } from '../middlewares/auth.middleware';
import { ProductModel } from '../models/product.model';
import { ServiceModel } from '../models/service.model';

const base = createCrudController(OrderModel);

export const OrderController = {
	...base,
	// Subir imágenes al pedido (adjuntos a nivel pedido)
	addAttachments: async (req: AuthRequest, res: Response) => {
		try {
			const userId = req.user?.id;
			const itemId = req.body.item_id;

			if (!userId) return res.status(401).json({ message: 'Unauthorized' });
			const orderId = req.params.id;
			const order = await OrderModel.findById(orderId);
			if (!order) return res.status(404).json({ message: 'Order not found' });
			// Validar propiedad del pedido o permisos de admin sobre pedidos
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
			return res.status(500).json({ error: 'Error uploading attachments' });
		}
	},

	get: async (req: Request, res: Response) => {
		try {
			const order = await OrderModel.findById(req.params.id)
				.populate('user', '-password -__v ')
				.populate('payments')
				.populate('items.id_servicio')
				.populate('items.id_producto');
			if (!order) return res.status(404).json({ message: 'Not found' });
			const total = order.items.reduce((sum, item) => sum + (item.valor || 0), 0);
			const APPROVED = new Set(['aprobado', 'confirmado']);
			const paid = order.payments.reduce((sum, p) => {
				const status = String(p.status || '').toLowerCase();
				return APPROVED.has(status) ? sum + (p.amount || 0) : sum;
			}, 0);
			const restante = total - paid;
			return res.json({ ...order.toObject(), total, paid, restante });
		} catch (error) {
			return res.status(500).json({ message: 'Error retrieving order' });
		}
	},
	// Crear pedido para el usuario autenticado (móvil)
	createForMe: async (req: AuthRequest, res: Response) => {
		try {
			const userId = req.user?.id;
			if (!userId) return res.status(401).json({ message: 'Unauthorized' });
			const { items, address } = req.body ?? {};
			if (!Array.isArray(items) || items.length === 0) {
				return res
					.status(400)
					.json({ message: 'items is required and must be a non-empty array' });
			}
			// Normalizar entrada y recolectar ids para consultar imageUrl
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

			// Consultar imagenes en lote
			const [products, services] = await Promise.all([
				productIds.size
					? ProductModel.find({ _id: { $in: Array.from(productIds) } }).select(
							'_id imageUrl',
						)
					: [],
				serviceIds.size
					? ServiceModel.find({ _id: { $in: Array.from(serviceIds) } }).select(
							'_id imageUrl',
						)
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
			const files = ((req as any).files as any[]) ?? [];
			const attachments =
				files.map((f) => ({
					url: f?.path || f?.filename,
					type: 'product_image',
					uploadedBy: userId,
					uploadedAt: new Date(),
				})) ?? [];
			const order = await OrderModel.create({
				user: userId,
				status: 'en_proceso',
				address,
				startedAt: new Date(),
				items: normalizedItems,
				payments: [],
				attachments,
			} as any);
			const populated = await order
				.populate('user', 'name email')
				.then((o) => o.populate('items.id_servicio'))
				.then((o) => o.populate('items.id_producto'));
			return res.status(201).json({ ok: true, order: populated });
		} catch (error) {
			return res.status(500).json({ error: 'Error creating order' });
		}
	},
	list: async (req: Request, res: Response) => {
		try {
			const orders = await OrderModel.find()
				.sort({ createdAt: -1 })
				.populate('user', '-password -__v ')
				.populate('payments')
				.populate('items.id_servicio')
				.populate('items.id_producto');

			const result = orders
				.map((order) => {
					const total = order.items.reduce((sum, item) => sum + (item.valor || 0), 0);
					const APPROVED = new Set(['aprobado', 'confirmado']);
					const paid = order.payments.reduce((sum, p) => {
						const status = String(p.status || '').toLowerCase();
						return APPROVED.has(status) ? sum + (p.amount || 0) : sum;
					}, 0);
					const restante = total - paid;

					return {
						...order.toObject(),
						total,
						paid,
						restante,
						paymentStatus: restante <= 0 ? 'Pagado' : 'Pendiente',
					};
				})
				.filter((order) => order.paymentStatus != 'Pagado');

			res.json(result);
		} catch (error) {
			res.status(500).json({ message: 'Error retrieving orders' });
		}
	},
	// Lista de pedidos del usuario autenticado
	listMine: async (req: AuthRequest, res: Response) => {
		try {
			const userId = req.user?.id;
			if (!userId) return res.status(401).json({ message: 'Unauthorized' });
			const orders = await OrderModel.find({ user: userId })
				.populate('user', '-password -__v ')
				.populate('payments')
				.populate('items.id_servicio')
				.populate('items.id_producto')
				.sort({ startedAt: -1 });

			const result = orders.map((order) => {
				const total = order.items.reduce((sum, item) => sum + (item.valor || 0), 0);
				const APPROVED = new Set(['aprobado', 'confirmado']);
				const paid = order.payments.reduce((sum, p) => {
					const status = String(p.status || '').toLowerCase();
					return APPROVED.has(status) ? sum + (p.amount || 0) : sum;
				}, 0);
				const restante = total - paid;
				return {
					...order.toObject(),
					total,
					paid,
					restante,
					paymentStatus: restante <= 0 ? 'Pagado' : 'Pendiente',
				};
			});

			return res.json({ ok: true, orders: result });
		} catch (error) {
			return res.status(500).json({ error: 'Error retrieving my orders' });
		}
	},
};
