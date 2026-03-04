"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.quotationController = void 0;
const mongoose_1 = require("mongoose");
const quotation_model_1 = require("../models/quotation.model");
const order_model_1 = require("../models/order.model");
const env_1 = require("../config/env");
const mailer_1 = require("../utils/mailer");
const template_service_1 = require("../services/template.service");
exports.quotationController = {
    listMine: async (req, res) => {
        try {
            const userId = req.user?.id;
            if (!userId)
                return res.status(401).json({ message: 'Unauthorized' });
            const quotations = await quotation_model_1.QuotationModel.find({ user: userId })
                .sort({ createdAt: -1 })
                .populate('user', 'name email')
                .populate({ path: 'items.product', select: 'name imageUrl description category' });
            return res.status(200).json({ ok: true, quotations });
        }
        catch (error) {
            console.error('Error listing my quotations:', error);
            return res.status(500).json({ error: 'Error fetching quotations' });
        }
    },
    createOrGetCart: async (req, res) => {
        try {
            const userId = req.user?.id;
            if (!userId)
                return res.status(401).json({ message: 'Unauthorized' });
            let cart = await quotation_model_1.QuotationModel.findOne({ user: userId, status: 'Carrito' })
                .populate('user', 'name email')
                .populate({ path: 'items.product', select: 'name imageUrl description category' });
            if (!cart) {
                cart = await quotation_model_1.QuotationModel.create({ user: userId, status: 'Carrito', items: [] });
                cart = await quotation_model_1.QuotationModel.findById(cart._id).populate('user', 'name email');
            }
            return res.status(200).json({ ok: true, cart });
        }
        catch (error) {
            console.error('Error creating/getting cart:', error);
            return res.status(500).json({ error: 'Error with cart' });
        }
    },
    quickCreate: async (req, res) => {
        try {
            const userId = req.user?.id;
            if (!userId)
                return res.status(401).json({ message: 'Unauthorized' });
            const { items, adminNotes } = req.body;
            if (!items || !Array.isArray(items) || items.length === 0)
                return res.status(400).json({ message: 'Items array is required' });
            const quotation = await quotation_model_1.QuotationModel.create({
                user: userId,
                status: 'Solicitada',
                items,
                adminNotes: adminNotes || '',
            });
            const populated = await quotation_model_1.QuotationModel.findById(quotation._id)
                .populate('user', 'name email')
                .populate({ path: 'items.product', select: 'name imageUrl description category' });
            return res.status(201).json({ ok: true, quotation: populated });
        }
        catch (error) {
            console.error('Error quick creating quotation:', error);
            return res.status(500).json({ error: 'Error creating quotation' });
        }
    },
    adminCreate: async (req, res) => {
        try {
            const { userId, adminNotes } = req.body ?? {};
            if (!userId || !mongoose_1.Types.ObjectId.isValid(userId))
                return res.status(400).json({ message: 'Valid userId is required' });
            const quotation = await quotation_model_1.QuotationModel.create({
                user: new mongoose_1.Types.ObjectId(userId),
                status: 'Solicitada',
                items: [],
                adminNotes: adminNotes || '',
            });
            const populated = await quotation_model_1.QuotationModel.findById(quotation._id).populate('user', 'name email');
            return res.status(201).json({ ok: true, quotation: populated });
        }
        catch (error) {
            console.error('Error creating quotation as admin:', error);
            return res.status(500).json({ error: 'Error creating quotation' });
        }
    },
    addItem: async (req, res) => {
        try {
            const userId = req.user?.id;
            if (!userId)
                return res.status(401).json({ message: 'Unauthorized' });
            const { id } = req.params;
            const { productId, quantity, color, size, customDetails, isCustom } = req.body;
            const quotation = await quotation_model_1.QuotationModel.findById(id);
            if (!quotation)
                return res.status(404).json({ message: 'Quotation not found' });
            if (isCustom) {
                if (!customDetails?.name || !customDetails?.description)
                    return res.status(400).json({
                        message: 'customDetails.name and description are required for custom products',
                    });
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
            }
            else {
                if (!productId || !mongoose_1.Types.ObjectId.isValid(productId))
                    return res.status(400).json({ message: 'Valid productId is required' });
                quotation.items.push({
                    product: new mongoose_1.Types.ObjectId(productId),
                    isCustom: false,
                    quantity: quantity || 1,
                    color: color || '',
                    size: size || '',
                    price: 0,
                    itemStatus: 'normal',
                });
            }
            await quotation.save();
            const populated = await quotation_model_1.QuotationModel.findById(quotation._id)
                .populate('user', 'name email')
                .populate({ path: 'items.product', select: 'name imageUrl description category' });
            return res.status(200).json({ ok: true, quotation: populated });
        }
        catch (error) {
            console.error('Error adding item:', error);
            return res.status(500).json({ error: 'Error adding item' });
        }
    },
    updateItem: async (req, res) => {
        try {
            const userId = req.user?.id;
            if (!userId)
                return res.status(401).json({ message: 'Unauthorized' });
            const { id, itemId } = req.params;
            const { quantity, color, size, price, adminNotes } = req.body;
            const quotation = await quotation_model_1.QuotationModel.findOne({ _id: id, user: userId });
            if (!quotation)
                return res.status(404).json({ message: 'Quotation not found' });
            const item = quotation.items.id(itemId);
            if (!item)
                return res.status(404).json({ message: 'Item not found' });
            if (quantity !== undefined)
                item.quantity = quantity;
            if (color !== undefined)
                item.color = color;
            if (size !== undefined)
                item.size = size;
            if (price !== undefined)
                item.price = price;
            if (adminNotes !== undefined)
                item.adminNotes = adminNotes;
            await quotation.save();
            const populated = await quotation_model_1.QuotationModel.findById(quotation._id)
                .populate('user', 'name email')
                .populate({ path: 'items.product', select: 'name imageUrl description category' });
            return res.status(200).json({ ok: true, quotation: populated });
        }
        catch (error) {
            console.error('Error updating item:', error);
            return res.status(500).json({ error: 'Error updating item' });
        }
    },
    removeItem: async (req, res) => {
        try {
            const userId = req.user?.id;
            if (!userId)
                return res.status(401).json({ message: 'Unauthorized' });
            const { id, itemId } = req.params;
            const quotation = await quotation_model_1.QuotationModel.findOne({ _id: id, user: userId });
            if (!quotation)
                return res.status(404).json({ message: 'Quotation not found' });
            const itemToRemove = quotation.items.id(itemId);
            if (!itemToRemove)
                return res.status(404).json({ message: 'Item not found' });
            itemToRemove.deleteOne();
            await quotation.save();
            const populated = await quotation_model_1.QuotationModel.findById(quotation._id)
                .populate('user', 'name email')
                .populate({ path: 'items.product', select: 'name imageUrl description category' });
            return res
                .status(200)
                .json({ ok: true, quotation: populated, message: 'Item removed successfully' });
        }
        catch (error) {
            console.error('Error removing item:', error);
            return res.status(500).json({ error: 'Error removing item' });
        }
    },
    submit: async (req, res) => {
        try {
            const userId = req.user?.id;
            if (!userId)
                return res.status(401).json({ message: 'Unauthorized' });
            const { id } = req.params;
            const quotation = await quotation_model_1.QuotationModel.findOne({ _id: id, user: userId });
            if (!quotation)
                return res.status(404).json({ message: 'Quotation not found' });
            if (quotation.items.length === 0)
                return res.status(400).json({ message: 'Cannot submit empty quotation' });
            quotation.status = 'Solicitada';
            await quotation.save();
            const populated = await quotation_model_1.QuotationModel.findById(quotation._id)
                .populate('user', 'name email')
                .populate({ path: 'items.product', select: 'name imageUrl description category' });
            return res.status(200).json({
                ok: true,
                quotation: populated,
                message: 'Quotation submitted successfully',
            });
        }
        catch (error) {
            console.error('Error submitting quotation:', error);
            return res.status(500).json({ error: 'Error submitting quotation' });
        }
    },
    adminSetQuote: async (req, res) => {
        try {
            const { id } = req.params;
            const { items, totalEstimate, adminNotes } = req.body;
            const quotation = await quotation_model_1.QuotationModel.findById(id);
            if (!quotation)
                return res.status(404).json({ message: 'Quotation not found' });
            if (items && Array.isArray(items)) {
                items.forEach((updateItem) => {
                    const item = quotation.items.id(updateItem._id || updateItem.itemId);
                    if (item) {
                        if (updateItem.price !== undefined)
                            item.price = updateItem.price;
                        if (updateItem.adminNotes !== undefined)
                            item.adminNotes = updateItem.adminNotes;
                        if (item.isCustom && item.itemStatus === 'pending_quote')
                            item.itemStatus = 'quoted';
                    }
                });
            }
            quotation.totalEstimate =
                totalEstimate !== undefined
                    ? totalEstimate
                    : quotation.items.reduce((sum, i) => sum + (i.price || 0) * i.quantity, 0);
            if (adminNotes !== undefined)
                quotation.adminNotes = adminNotes;
            quotation.status = 'Cotizada';
            await quotation.save();
            const populated = await quotation_model_1.QuotationModel.findById(quotation._id)
                .populate('user', 'name email')
                .populate({ path: 'items.product', select: 'name imageUrl description category' });
            return res.status(200).json({ ok: true, quotation: populated });
        }
        catch (error) {
            console.error('Error setting quote:', error);
            return res.status(500).json({ error: 'Error setting quote' });
        }
    },
    userDecision: async (req, res) => {
        try {
            const userId = req.user?.id;
            if (!userId)
                return res.status(401).json({ message: 'Unauthorized' });
            const { id } = req.params;
            const { decision } = req.body ?? {};
            if (!decision || !['accepted', 'rejected'].includes(decision))
                return res.status(400).json({ message: 'decision must be accepted|rejected' });
            const quotation = await quotation_model_1.QuotationModel.findById(id).populate('user', 'email name');
            if (!quotation)
                return res.status(404).json({ message: 'Quotation not found' });
            const ownerId = String(quotation.user?._id ?? quotation.user);
            if (ownerId !== String(userId))
                return res.status(403).json({ message: 'Forbidden' });
            const isAccepted = decision === 'accepted';
            if (isAccepted) {
                quotation.status = 'En proceso';
                const existingOrder = await order_model_1.OrderModel.findOne({
                    user: quotation.user,
                    status: 'Pendiente',
                    startedAt: { $gte: new Date(Date.now() - 5 * 60 * 1000) },
                });
                if (!existingOrder) {
                    const items = (quotation.items ?? []).map((item) => ({
                        detalles: item.adminNotes ?? 'Sin notas del administrador',
                        valor: (item.price ?? 0) * item.quantity,
                        id_servicio: '6999d686f21e5a62a1823865',
                    }));
                    await order_model_1.OrderModel.create({
                        user: quotation.user,
                        status: 'Pendiente',
                        startedAt: new Date(),
                        items,
                    });
                }
            }
            else {
                quotation.status = 'Cerrada';
            }
            await quotation.save();
            const to = env_1.env.adminNotifyEmail || env_1.env.mailFrom;
            if (to) {
                const linkBase = env_1.env.frontendOrigins[0] || 'http://localhost:3000';
                const userName = quotation.user?.name || 'Cliente';
                const userEmail = quotation.user?.email || '';
                const html = await template_service_1.templateService.render('user-decision', {
                    HEADER_COLOR: isAccepted ? '#16a34a' : '#dc2626',
                    DECISION_ICON: isAccepted ? '✅' : '❌',
                    DECISION_TITLE: isAccepted ? 'Cotización Aceptada' : 'Cotización Rechazada',
                    DECISION_COLOR: isAccepted ? '#16a34a' : '#dc2626',
                    DECISION_TEXT: isAccepted ? 'aceptado' : 'rechazado',
                    DECISION_LABEL: isAccepted ? 'Aceptada' : 'Rechazada',
                    BADGE_BG: isAccepted ? '#dcfce7' : '#fee2e2',
                    BADGE_COLOR: isAccepted ? '#15803d' : '#b91c1c',
                    NEW_STATUS: isAccepted ? 'En proceso' : 'Cerrada',
                    CONDITIONAL_MESSAGE: isAccepted
                        ? 'Se ha creado un pedido a partir de esta cotización. El equipo se pondrá en contacto próximamente para coordinar los detalles.'
                        : 'El cliente ha decidido no proceder con esta cotización. Puedes contactarlo si deseas conocer el motivo.',
                    USER_NAME: userName,
                    USER_EMAIL: userEmail,
                    QUOTATION_ID: String(quotation._id).slice(-8).toUpperCase(),
                    DECISION_DATE: new Date().toLocaleDateString('es-ES', {
                        day: 'numeric',
                        month: 'long',
                        year: 'numeric',
                    }),
                    YEAR: new Date().getFullYear(),
                });
                await (0, mailer_1.sendEmail)({
                    to,
                    subject: `Decisión del cliente: ${isAccepted ? 'ACEPTÓ' : 'RECHAZÓ'} la cotización`,
                    html,
                });
            }
            try {
                const { ChatMessageModel } = await Promise.resolve().then(() => __importStar(require('../models/chatMessage.model')));
                await ChatMessageModel.deleteMany({ quotation: quotation._id });
            }
            catch (_e) {
                // no-op
            }
            await quotation_model_1.QuotationModel.deleteOne({ _id: quotation._id });
            return res.json({ ok: true, deleted: true, quotationId: String(quotation._id) });
        }
        catch (err) {
            console.error('USER DECISION ERROR 👉', err);
            return res.status(500).json({ error: 'Error applying decision' });
        }
    },
    listAll: async (req, res) => {
        try {
            const { status, page = 1, limit = 20 } = req.query;
            const filter = {};
            if (status)
                filter.status = status;
            const quotations = await quotation_model_1.QuotationModel.find(filter)
                .sort({ createdAt: -1 })
                .limit(Number(limit))
                .skip((Number(page) - 1) * Number(limit))
                .populate('user', 'name email')
                .populate({ path: 'items.product', select: 'name imageUrl description category' });
            const total = await quotation_model_1.QuotationModel.countDocuments(filter);
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
        }
        catch (error) {
            console.error('Error listing all quotations:', error);
            return res.status(500).json({ error: 'Error fetching quotations' });
        }
    },
    get: async (req, res) => {
        try {
            const { id } = req.params;
            const quotation = await quotation_model_1.QuotationModel.findById(id)
                .populate('user', 'name email')
                .populate({ path: 'items.product', select: 'name imageUrl description category' });
            if (!quotation)
                return res.status(404).json({ message: 'Quotation not found' });
            return res.status(200).json({ ok: true, quotation });
        }
        catch (error) {
            console.error('Error getting quotation:', error);
            return res.status(500).json({ error: 'Error fetching quotation' });
        }
    },
    getMyCart: async (req, res) => {
        try {
            const userId = req.user?.id;
            if (!userId)
                return res.status(401).json({ message: 'Unauthorized' });
            let cart = await quotation_model_1.QuotationModel.findOne({ user: userId, status: 'Carrito' })
                .populate('user', 'name email')
                .populate({ path: 'items.product', select: 'name imageUrl description category' });
            if (!cart) {
                cart = await quotation_model_1.QuotationModel.create({ user: userId, status: 'Carrito', items: [] });
                cart = await quotation_model_1.QuotationModel.findById(cart._id).populate('user', 'name email');
            }
            return res.status(200).json({ ok: true, cart });
        }
        catch (error) {
            console.error('Error getting cart:', error);
            return res.status(500).json({ error: 'Error fetching cart' });
        }
    },
    addItemToCart: async (req, res) => {
        try {
            const userId = req.user?.id;
            if (!userId)
                return res.status(401).json({ message: 'Unauthorized' });
            const { productId, quantity, color, size } = req.body;
            if (!productId || !mongoose_1.Types.ObjectId.isValid(productId))
                return res.status(400).json({ message: 'Valid productId is required' });
            if (!color)
                return res.status(400).json({ message: 'color is required' });
            let cart = await quotation_model_1.QuotationModel.findOne({ user: userId, status: 'Carrito' });
            if (!cart)
                cart = await quotation_model_1.QuotationModel.create({ user: userId, status: 'Carrito', items: [] });
            const existingItem = cart.items.find((item) => item.product?.toString() === productId &&
                item.color === color &&
                item.size === size &&
                !item.isCustom);
            if (existingItem) {
                existingItem.quantity += quantity || 1;
            }
            else {
                cart.items.push({
                    product: new mongoose_1.Types.ObjectId(productId),
                    isCustom: false,
                    quantity: quantity || 1,
                    color,
                    size: size || '',
                    price: 0,
                    itemStatus: 'normal',
                });
            }
            await cart.save();
            const populated = await quotation_model_1.QuotationModel.findById(cart._id)
                .populate('user', 'name email')
                .populate({ path: 'items.product', select: 'name imageUrl description category' });
            return res
                .status(201)
                .json({ ok: true, cart: populated, message: 'Product added to cart' });
        }
        catch (error) {
            console.error('Error adding item to cart:', error);
            return res.status(500).json({ error: 'Error adding item to cart' });
        }
    },
    addCustomItemToCart: async (req, res) => {
        try {
            const userId = req.user?.id;
            if (!userId)
                return res.status(401).json({ message: 'Unauthorized' });
            const { quantity, color, size, name, description, woodType, quotationId } = req.body;
            if (!name || !description)
                return res.status(400).json({ message: 'name and description required' });
            if (!color)
                return res.status(400).json({ message: 'color is required' });
            const imageUrl = req.file?.path || null;
            let cart;
            if (quotationId) {
                // Modo admin: busca por ID, no crea nada si no existe
                cart = await quotation_model_1.QuotationModel.findById(quotationId);
                if (!cart)
                    return res.status(404).json({ message: 'Quotation not found' });
            }
            else {
                // Modo cliente: busca o crea el carrito del usuario
                cart = await quotation_model_1.QuotationModel.findOne({ user: userId, status: 'Carrito' });
                if (!cart)
                    cart = await quotation_model_1.QuotationModel.create({
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
            const populated = await quotation_model_1.QuotationModel.findById(cart._id).populate('items.product');
            return res.status(201).json({ ok: true, cart: populated });
        }
        catch (error) {
            console.error(error);
            return res.status(500).json({ error: 'Error adding custom item' });
        }
    },
    updateCartItemQuantity: async (req, res) => {
        try {
            const userId = req.user?.id;
            if (!userId)
                return res.status(401).json({ message: 'Unauthorized' });
            const { itemId, quantity } = req.body;
            if (!itemId || !quantity || quantity < 1)
                return res.status(400).json({ message: 'Valid itemId and quantity are required' });
            const cart = await quotation_model_1.QuotationModel.findOne({ user: userId, status: 'Carrito' });
            if (!cart)
                return res.status(404).json({ message: 'Cart not found' });
            const item = cart.items.id(itemId);
            if (!item)
                return res.status(404).json({ message: 'Item not found in cart' });
            item.quantity = quantity;
            await cart.save();
            const populated = await quotation_model_1.QuotationModel.findById(cart._id)
                .populate('user', 'name email')
                .populate({ path: 'items.product', select: 'name imageUrl description category' });
            return res.status(200).json({ ok: true, cart: populated });
        }
        catch (error) {
            console.error('Error updating item quantity:', error);
            return res.status(500).json({ error: 'Error updating quantity' });
        }
    },
    removeCartItem: async (req, res) => {
        try {
            const userId = req.user?.id;
            if (!userId)
                return res.status(401).json({ message: 'Unauthorized' });
            const { itemId } = req.params;
            const cart = await quotation_model_1.QuotationModel.findOne({ user: userId, status: 'Carrito' });
            if (!cart)
                return res.status(404).json({ message: 'Cart not found' });
            const itemToRemove = cart.items.id(itemId);
            if (!itemToRemove)
                return res.status(404).json({ message: 'Item not found in cart' });
            itemToRemove.deleteOne();
            await cart.save();
            const populated = await quotation_model_1.QuotationModel.findById(cart._id)
                .populate('user', 'name email')
                .populate({ path: 'items.product', select: 'name imageUrl description category' });
            return res
                .status(200)
                .json({ ok: true, cart: populated, message: 'Item removed successfully' });
        }
        catch (error) {
            console.error('Error removing cart item:', error);
            return res.status(500).json({ error: 'Error removing item' });
        }
    },
    requestQuotation: async (req, res) => {
        try {
            const userId = req.user?.id;
            if (!userId)
                return res.status(401).json({ message: 'Unauthorized' });
            const cart = await quotation_model_1.QuotationModel.findOne({ user: userId, status: 'Carrito' });
            if (!cart || cart.items.length === 0)
                return res.status(400).json({ message: 'Cart is empty' });
            cart.status = 'Solicitada';
            await cart.save();
            const populated = await quotation_model_1.QuotationModel.findById(cart._id)
                .populate('user', 'name email')
                .populate({ path: 'items.product', select: 'name imageUrl description category' });
            return res.status(200).json({
                ok: true,
                quotation: populated,
                message: 'Quotation requested successfully',
            });
        }
        catch (error) {
            console.error('Error requesting quotation:', error);
            return res.status(500).json({ error: 'Error requesting quotation' });
        }
    },
};
