// controllers/quotation.controller.ts
import { Response } from 'express';
import { Types } from 'mongoose';
import { QuotationModel } from '../models/quotation.model';
import { AuthRequest } from '../middlewares/auth.middleware';
import { OrderModel } from '../models/order.model';
import { env } from '../config/env';
import { sendEmail } from '../utils/mailer';

export const quotationController = {
	// ==========================================
	// MÉTODOS ORIGINALES (mantener todos)
	// ==========================================

	// ✅ Listar mis cotizaciones
	listMine: async (req: AuthRequest, res: Response) => {
		try {
			const userId = req.user?.id;
			if (!userId) return res.status(401).json({ message: 'Unauthorized' });

			const quotations = await QuotationModel.find({ user: userId })
				.sort({ createdAt: -1 })
				.populate('user', 'name email')
				.populate({
					path: 'items.product',
					select: 'name imageUrl description category',
				});

			return res.status(200).json({ ok: true, quotations });
		} catch (error) {
			console.error('Error listing my quotations:', error);
			return res.status(500).json({ error: 'Error fetching quotations' });
		}
	},

	// ✅ Crear o obtener carrito
	createOrGetCart: async (req: AuthRequest, res: Response) => {
		try {
			const userId = req.user?.id;
			if (!userId) return res.status(401).json({ message: 'Unauthorized' });

			let cart = await QuotationModel.findOne({
				user: userId,
				status: 'Carrito',
			})
				.populate('user', 'name email')
				.populate({
					path: 'items.product',
					select: 'name imageUrl description category',
				});

			if (!cart) {
				cart = await QuotationModel.create({
					user: userId,
					status: 'Carrito',
					items: [],
				});

				cart = await QuotationModel.findById(cart._id).populate('user', 'name email');
			}

			return res.status(200).json({ ok: true, cart });
		} catch (error) {
			console.error('Error creating/getting cart:', error);
			return res.status(500).json({ error: 'Error with cart' });
		}
	},

	// ✅ Creación rápida de cotización
	quickCreate: async (req: AuthRequest, res: Response) => {
		try {
			const userId = req.user?.id;
			if (!userId) return res.status(401).json({ message: 'Unauthorized' });

			const { items, adminNotes } = req.body;

			if (!items || !Array.isArray(items) || items.length === 0) {
				return res.status(400).json({ message: 'Items array is required' });
			}

			const quotation = await QuotationModel.create({
				user: userId,
				status: 'Solicitada',
				items,
				adminNotes: adminNotes || '',
			});

			const populated = await QuotationModel.findById(quotation._id)
				.populate('user', 'name email')
				.populate({
					path: 'items.product',
					select: 'name imageUrl description category',
				});

			return res.status(201).json({ ok: true, quotation: populated });
		} catch (error) {
			console.error('Error quick creating quotation:', error);
			return res.status(500).json({ error: 'Error creating quotation' });
		}
	},

	// ✅ Agregar item a cotización
	addItem: async (req: AuthRequest, res: Response) => {
		try {
			const userId = req.user?.id;
			if (!userId) return res.status(401).json({ message: 'Unauthorized' });

			const { id } = req.params;
			const { productId, quantity, color, size, customDetails, isCustom } = req.body;

			const quotation = await QuotationModel.findOne({
				_id: id,
				user: userId,
			});

			if (!quotation) {
				return res.status(404).json({ message: 'Quotation not found' });
			}

			// ✅ Si es producto personalizado
			if (isCustom) {
				if (!customDetails?.name || !customDetails?.description) {
					return res.status(400).json({
						message:
							'customDetails.name and description are required for custom products',
					});
				}

				quotation.items.push({
					product: null,
					isCustom: true,
					customDetails: {
						name: customDetails.name,
						description: customDetails.description,
						woodType: customDetails.woodType || 'Por definir',
						referenceImage: customDetails.referenceImage || null,
					},
					quantity: quantity || 1,
					color: color || '',
					size: size || '',
					price: 0,
					itemStatus: 'pending_quote',
				});
			} else {
				// ✅ Producto normal
				if (!productId || !Types.ObjectId.isValid(productId)) {
					return res.status(400).json({ message: 'Valid productId is required' });
				}

				quotation.items.push({
					product: new Types.ObjectId(productId),
					isCustom: false,
					quantity: quantity || 1,
					color: color || '',
					size: size || '',
					price: 0,
					itemStatus: 'normal',
				});
			}

			await quotation.save();

			const populated = await QuotationModel.findById(quotation._id)
				.populate('user', 'name email')
				.populate({
					path: 'items.product',
					select: 'name imageUrl description category',
				});

			return res.status(200).json({ ok: true, quotation: populated });
		} catch (error) {
			console.error('Error adding item:', error);
			return res.status(500).json({ error: 'Error adding item' });
		}
	},

	// ✅ Actualizar item de cotización
	updateItem: async (req: AuthRequest, res: Response) => {
		try {
			const userId = req.user?.id;
			if (!userId) return res.status(401).json({ message: 'Unauthorized' });

			const { id, itemId } = req.params;
			const { quantity, color, size, price, adminNotes } = req.body;

			const quotation = await QuotationModel.findOne({
				_id: id,
				user: userId,
			});

			if (!quotation) {
				return res.status(404).json({ message: 'Quotation not found' });
			}

			// ✅ Usar .id() para encontrar el subdocumento
			const item = quotation.items.id(itemId);

			if (!item) {
				return res.status(404).json({ message: 'Item not found' });
			}

			// Actualizar campos opcionales
			if (quantity !== undefined) item.quantity = quantity;
			if (color !== undefined) item.color = color;
			if (size !== undefined) item.size = size;
			if (price !== undefined) item.price = price;
			if (adminNotes !== undefined) item.adminNotes = adminNotes;

			await quotation.save();

			const populated = await QuotationModel.findById(quotation._id)
				.populate('user', 'name email')
				.populate({
					path: 'items.product',
					select: 'name imageUrl description category',
				});

			return res.status(200).json({ ok: true, quotation: populated });
		} catch (error) {
			console.error('Error updating item:', error);
			return res.status(500).json({ error: 'Error updating item' });
		}
	},

	// ✅ Eliminar item de cotización
	removeItem: async (req: AuthRequest, res: Response) => {
		try {
			const userId = req.user?.id;
			if (!userId) return res.status(401).json({ message: 'Unauthorized' });

			const { id, itemId } = req.params;

			const quotation = await QuotationModel.findOne({
				_id: id,
				user: userId,
			});

			if (!quotation) {
				return res.status(404).json({ message: 'Quotation not found' });
			}

			// ✅ Usar .id() y .deleteOne()
			const itemToRemove = quotation.items.id(itemId);

			if (!itemToRemove) {
				return res.status(404).json({ message: 'Item not found' });
			}

			itemToRemove.deleteOne();
			await quotation.save();

			const populated = await QuotationModel.findById(quotation._id)
				.populate('user', 'name email')
				.populate({
					path: 'items.product',
					select: 'name imageUrl description category',
				});

			return res.status(200).json({
				ok: true,
				quotation: populated,
				message: 'Item removed successfully',
			});
		} catch (error) {
			console.error('Error removing item:', error);
			return res.status(500).json({ error: 'Error removing item' });
		}
	},

	// ✅ Enviar cotización (cambiar de Carrito a Solicitada)
	submit: async (req: AuthRequest, res: Response) => {
		try {
			const userId = req.user?.id;
			if (!userId) return res.status(401).json({ message: 'Unauthorized' });

			const { id } = req.params;

			const quotation = await QuotationModel.findOne({
				_id: id,
				user: userId,
			});

			if (!quotation) {
				return res.status(404).json({ message: 'Quotation not found' });
			}

			if (quotation.items.length === 0) {
				return res.status(400).json({ message: 'Cannot submit empty quotation' });
			}

			quotation.status = 'Solicitada';
			await quotation.save();

			const populated = await QuotationModel.findById(quotation._id)
				.populate('user', 'name email')
				.populate({
					path: 'items.product',
					select: 'name imageUrl description category',
				});

			return res.status(200).json({
				ok: true,
				quotation: populated,
				message: 'Quotation submitted successfully',
			});
		} catch (error) {
			console.error('Error submitting quotation:', error);
			return res.status(500).json({ error: 'Error submitting quotation' });
		}
	},

	// ✅ ADMIN: Establecer cotización (precios)
	adminSetQuote: async (req: AuthRequest, res: Response) => {
		try {
			const { id } = req.params;
			const { items, totalEstimate, adminNotes } = req.body;

			const quotation = await QuotationModel.findById(id);

			if (!quotation) {
				return res.status(404).json({ message: 'Quotation not found' });
			}

			// Actualizar precios de items
			if (items && Array.isArray(items)) {
				items.forEach((updateItem: any) => {
					const item = quotation.items.id(updateItem._id || updateItem.itemId);
					if (item) {
						if (updateItem.price !== undefined) item.price = updateItem.price;
						if (updateItem.adminNotes !== undefined)
							item.adminNotes = updateItem.adminNotes;

						// Marcar items custom como cotizados
						if (item.isCustom && item.itemStatus === 'pending_quote') {
							item.itemStatus = 'quoted';
						}
					}
				});
			}

			// Calcular o usar el total provisto
			if (totalEstimate !== undefined) {
				quotation.totalEstimate = totalEstimate;
			} else {
				quotation.totalEstimate = quotation.items.reduce(
					(sum, i) => sum + (i.price || 0) * i.quantity,
					0,
				);
			}

			if (adminNotes !== undefined) {
				quotation.adminNotes = adminNotes;
			}

			quotation.status = 'Cotizada';
			await quotation.save();

			const populated = await QuotationModel.findById(quotation._id)
				.populate('user', 'name email')
				.populate({
					path: 'items.product',
					select: 'name imageUrl description category',
				});

			return res.status(200).json({ ok: true, quotation: populated });
		} catch (error) {
			console.error('Error setting quote:', error);
			return res.status(500).json({ error: 'Error setting quote' });
		}
	},

	userDecision: async (req: AuthRequest, res: Response) => {
		try {
			const userId = req.user?.id;
			if (!userId) return res.status(401).json({ message: 'Unauthorized' });
			const { id } = req.params;
			const { decision } = req.body ?? {}; // 'accept' | 'reject'
			if (!decision || !['accepted', 'rejected'].includes(decision)) {
				return res.status(400).json({ message: 'decision must be accepted|rejected' });
			}
			const quotation = await QuotationModel.findById(id).populate('user', 'email');
			if (!quotation) return res.status(404).json({ message: 'Quotation not found' });
			const ownerId = String((quotation.user as any)?._id ?? quotation.user);
			if (ownerId !== String(userId)) {
				return res.status(403).json({ message: 'Forbidden' });
			}
			if (decision === 'accepted') {
				quotation.status = 'En proceso';
				// Crear pedido si no existe uno derivado de esta cotización (heurística simple)
				const existingOrder = await OrderModel.findOne({
					user: quotation.user as any,
					status: 'En Proceso',
					startedAt: { $gte: new Date(Date.now() - 5 * 60 * 1000) }, // últimos 5 minutos
				});
				if (!existingOrder) {
					const items = (quotation.items ?? []).map((item) => {
						const price = item.price ?? 0; // precio unitario guardado en la cotización
						const subtotal = price * item.quantity; // subtotal calculado dinámicamente

						return {
							detalles: item.adminNotes ?? 'Sin notas del administrador',
							valor: subtotal, // aquí guardamos subtotal dinámico
							id_servicio: '6935c21d5a32d156edbfe527', // o el id que corresponda
						};
					});

					await OrderModel.create({
						user: quotation.user as any,
						status: 'En Proceso',
						startedAt: new Date(),
						items,
					} as any);
				}
			} else {
				quotation.status = 'Cerrada';
			}
			await quotation.save();

			// Notificar al admin
			const to = env.adminNotifyEmail || env.mailFrom;
			if (to) {
				const linkBase = env.frontendOrigins[0] || 'http://localhost:3000';
				const link = `${linkBase}/cotizaciones/${quotation._id}`;
				await sendEmail({
					to,
					subject: `Decisión del cliente: ${
						decision === 'accepted' ? 'ACEPTÓ' : 'RECHAZÓ'
					} la cotización`,
					text: `El cliente ha ${
						decision === 'accepted' ? 'aceptado' : 'rechazado'
					} la cotización. ${link}`,
					html: `<p>El cliente ha <strong>${
						decision === 'accept' ? 'aceptado' : 'rechazado'
					}</strong> la cotización.</p><p><a href="${link}">Ver cotización</a></p>`,
				});
			}
			// Eliminar mensajes de chat y la cotización para permitir nuevas solicitudes
			try {
				const { ChatMessageModel } = await import('../models/chatMessage.model');
				await ChatMessageModel.deleteMany({ quotation: quotation._id });
			} catch (_e) {
				// no-op si el modelo no está disponible por alguna razón
			}
			await QuotationModel.deleteOne({ _id: quotation._id });
			return res.json({ ok: true, deleted: true, quotationId: String(quotation._id) });
		} catch (err) {
			return res.status(500).json({ error: 'Error applying decision' });
		}
	},

	// ✅ ADMIN: Listar todas las cotizaciones
	listAll: async (req: AuthRequest, res: Response) => {
		try {
			const { status, page = 1, limit = 20 } = req.query;

			const filter: any = {};
			if (status) filter.status = status;

			const quotations = await QuotationModel.find(filter)
				.sort({ createdAt: -1 })
				.limit(Number(limit))
				.skip((Number(page) - 1) * Number(limit))
				.populate('user', 'name email')
				.populate({
					path: 'items.product',
					select: 'name imageUrl description category',
				});

			const total = await QuotationModel.countDocuments(filter);

			return res.status(200).json({
				ok: true,
				quotations,
				pagination: {
					total,
					page: Number(page),
					limit: Number(limit),
					pages: Math.ceil(total / Number(limit)),
				},
			});
		} catch (error) {
			console.error('Error listing all quotations:', error);
			return res.status(500).json({ error: 'Error fetching quotations' });
		}
	},

	// ✅ Obtener una cotización específica
	get: async (req: AuthRequest, res: Response) => {
		try {
			const { id } = req.params;

			const quotation = await QuotationModel.findById(id)
				.populate('user', 'name email')
				.populate({
					path: 'items.product',
					select: 'name imageUrl description category',
				});

			if (!quotation) {
				return res.status(404).json({ message: 'Quotation not found' });
			}

			return res.status(200).json({ ok: true, quotation });
		} catch (error) {
			console.error('Error getting quotation:', error);
			return res.status(500).json({ error: 'Error fetching quotation' });
		}
	},

	// ==========================================
	// MÉTODOS ADICIONALES PARA CARRITO
	// ==========================================

	// ✅ Obtener carrito activo
	getMyCart: async (req: AuthRequest, res: Response) => {
		try {
			const userId = req.user?.id;
			if (!userId) return res.status(401).json({ message: 'Unauthorized' });

			let cart = await QuotationModel.findOne({
				user: userId,
				status: 'Carrito',
			})
				.populate('user', 'name email')
				.populate({
					path: 'items.product',
					select: 'name imageUrl description category',
				});

			if (!cart) {
				cart = await QuotationModel.create({
					user: userId,
					status: 'Carrito',
					items: [],
				});

				cart = await QuotationModel.findById(cart._id).populate('user', 'name email');
			}

			return res.status(200).json({ ok: true, cart });
		} catch (error) {
			console.error('Error getting cart:', error);
			return res.status(500).json({ error: 'Error fetching cart' });
		}
	},

	// ✅ Agregar producto NORMAL al carrito
	addItemToCart: async (req: AuthRequest, res: Response) => {
		try {
			const userId = req.user?.id;
			if (!userId) return res.status(401).json({ message: 'Unauthorized' });

			const { productId, quantity, color, size } = req.body;

			if (!productId || !Types.ObjectId.isValid(productId)) {
				return res.status(400).json({ message: 'Valid productId is required' });
			}

			if (!color) {
				return res.status(400).json({ message: 'color is required' });
			}

			let cart = await QuotationModel.findOne({
				user: userId,
				status: 'Carrito',
			});

			if (!cart) {
				cart = await QuotationModel.create({
					user: userId,
					status: 'Carrito',
					items: [],
				});
			}

			// Verificar si ya existe
			const existingItem = cart.items.find(
				(item: any) =>
					item.product?.toString() === productId &&
					item.color === color &&
					item.size === size &&
					!item.isCustom,
			);

			if (existingItem) {
				existingItem.quantity += quantity || 1;
			} else {
				cart.items.push({
					product: new Types.ObjectId(productId),
					isCustom: false,
					quantity: quantity || 1,
					color,
					size: size || '',
					price: 0,
					itemStatus: 'normal',
				});
			}

			await cart.save();

			const populated = await QuotationModel.findById(cart._id)
				.populate('user', 'name email')
				.populate({
					path: 'items.product',
					select: 'name imageUrl description category',
				});

			return res.status(201).json({
				ok: true,
				cart: populated,
				message: 'Product added to cart',
			});
		} catch (error) {
			console.error('Error adding item to cart:', error);
			return res.status(500).json({ error: 'Error adding item to cart' });
		}
	},

	// ✅ Agregar producto PERSONALIZADO al carrito
	addCustomItemToCart: async (req: AuthRequest, res: Response) => {
		try {
			const userId = req.user?.id;
			if (!userId) return res.status(401).json({ message: 'Unauthorized' });

			const { quantity, color, size, name, description, woodType } = req.body;

			if (!name || !description) {
				return res.status(400).json({ message: 'name and description required' });
			}

			if (!color) {
				return res.status(400).json({ message: 'color is required' });
			}

			const imageUrl = (req as any).file?.path || null;

			let cart = await QuotationModel.findOne({
				user: userId,
				status: 'Carrito',
			});

			if (!cart) {
				cart = await QuotationModel.create({
					user: userId,
					status: 'Carrito',
					items: [],
				});
			}

			cart.items.push({
				product: null,
				isCustom: true,
				customDetails: {
					name,
					description,
					woodType: woodType || 'Por definir',
					referenceImage: imageUrl,
				},
				quantity: Number(quantity) || 1,
				color,
				size: size || '',
				price: 0,
				itemStatus: 'pending_quote',
			});

			await cart.save();

			const populated = await QuotationModel.findById(cart._id).populate('items.product');

			return res.status(201).json({
				ok: true,
				cart: populated,
			});
		} catch (error) {
			console.error(error);
			return res.status(500).json({ error: 'Error adding custom item' });
		}
	},

	// ✅ Actualizar cantidad en carrito
	updateCartItemQuantity: async (req: AuthRequest, res: Response) => {
		try {
			const userId = req.user?.id;
			if (!userId) return res.status(401).json({ message: 'Unauthorized' });

			const { itemId, quantity } = req.body;

			if (!itemId || !quantity || quantity < 1) {
				return res.status(400).json({
					message: 'Valid itemId and quantity are required',
				});
			}

			const cart = await QuotationModel.findOne({
				user: userId,
				status: 'Carrito',
			});

			if (!cart) {
				return res.status(404).json({ message: 'Cart not found' });
			}

			const item = cart.items.id(itemId);

			if (!item) {
				return res.status(404).json({ message: 'Item not found in cart' });
			}

			item.quantity = quantity;
			await cart.save();

			const populated = await QuotationModel.findById(cart._id)
				.populate('user', 'name email')
				.populate({
					path: 'items.product',
					select: 'name imageUrl description category',
				});

			return res.status(200).json({ ok: true, cart: populated });
		} catch (error) {
			console.error('Error updating item quantity:', error);
			return res.status(500).json({ error: 'Error updating quantity' });
		}
	},

	// ✅ Eliminar item del carrito
	removeCartItem: async (req: AuthRequest, res: Response) => {
		try {
			const userId = req.user?.id;
			if (!userId) return res.status(401).json({ message: 'Unauthorized' });

			const { itemId } = req.params;

			const cart = await QuotationModel.findOne({
				user: userId,
				status: 'Carrito',
			});

			if (!cart) {
				return res.status(404).json({ message: 'Cart not found' });
			}

			const itemToRemove = cart.items.id(itemId);

			if (!itemToRemove) {
				return res.status(404).json({ message: 'Item not found in cart' });
			}

			itemToRemove.deleteOne();
			await cart.save();

			const populated = await QuotationModel.findById(cart._id)
				.populate('user', 'name email')
				.populate({
					path: 'items.product',
					select: 'name imageUrl description category',
				});

			return res.status(200).json({
				ok: true,
				cart: populated,
				message: 'Item removed successfully',
			});
		} catch (error) {
			console.error('Error removing cart item:', error);
			return res.status(500).json({ error: 'Error removing item' });
		}
	},

	// ✅ Solicitar cotización (convertir carrito)
	requestQuotation: async (req: AuthRequest, res: Response) => {
		try {
			const userId = req.user?.id;
			if (!userId) return res.status(401).json({ message: 'Unauthorized' });

			const cart = await QuotationModel.findOne({
				user: userId,
				status: 'Carrito',
			});

			if (!cart || cart.items.length === 0) {
				return res.status(400).json({ message: 'Cart is empty' });
			}

			cart.status = 'Solicitada';
			await cart.save();

			const populated = await QuotationModel.findById(cart._id)
				.populate('user', 'name email')
				.populate({
					path: 'items.product',
					select: 'name imageUrl description category',
				});

			return res.status(200).json({
				ok: true,
				quotation: populated,
				message: 'Quotation requested successfully',
			});
		} catch (error) {
			console.error('Error requesting quotation:', error);
			return res.status(500).json({ error: 'Error requesting quotation' });
		}
	},
};
