"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const role_controller_1 = require("../controllers/role.controller");
const users_controller_1 = require("../controllers/users.controller");
const auth_controller_1 = require("../controllers/auth.controller");
const category_controller_1 = require("../controllers/category.controller");
const product_controller_1 = require("../controllers/product.controller");
const service_controller_1 = require("../controllers/service.controller");
const visit_controller_1 = require("../controllers/visit.controller");
const order_Controller_1 = require("../controllers/order.Controller");
const payment_controller_1 = require("../controllers/payment.controller");
const sales_controller_1 = require("../controllers/sales.controller");
const permission_controller_1 = require("../controllers/permission.controller");
const auth_middleware_1 = require("../middlewares/auth.middleware");
const verifyRole_1 = require("../middlewares/verifyRole");
const quotation_controller_1 = require("../controllers/quotation.controller");
const chat_controller_1 = require("../controllers/chat.controller");
const cloudinary_1 = require("../utils/cloudinary");
const router = (0, express_1.Router)();
function mountCrud(path, controller) {
    if (controller.list)
        router.get(`/${path}`, (0, verifyRole_1.verifyRole)(path, 'view'), controller.list);
    if (controller.get)
        router.get(`/${path}/:id`, (0, verifyRole_1.verifyRole)(path, 'view'), controller.get);
    if (controller.create)
        router.post(`/${path}`, (0, verifyRole_1.verifyRole)(path, 'create'), controller.create);
    if (controller.update)
        router.put(`/${path}/:id`, (0, verifyRole_1.verifyRole)(path, 'update'), controller.update);
    if (controller.remove)
        router.delete(`/${path}/:id`, (0, verifyRole_1.verifyRole)(path, 'delete'), controller.remove);
}
// === RUTAS PUBLICAS === //
router.post('/auth/login', auth_controller_1.AuthController.login);
router.post('/auth/logout', auth_controller_1.AuthController.logout);
router.get('/auth/me', auth_middleware_1.verifyToken, auth_controller_1.AuthController.me);
router.post('/auth/google', auth_controller_1.AuthController.google);
router.post('/auth/profile', auth_middleware_1.verifyToken, auth_controller_1.AuthController.profile);
// Recuperación de contraseña (público)
router.post('/auth/forgot-password', auth_controller_1.AuthController.forgotPassword);
router.post('/auth/reset-password', auth_controller_1.AuthController.resetPassword);
// Registro público con cookie
router.post('/auth/register', auth_controller_1.AuthController.register);
// Registro público de usuarios (para permitir sign-up y tests)
router.post('/users', users_controller_1.UserController.create);
// Catálogo público: categorías, productos y servicios visibles sin login
// Listado y detalle abiertos
if (category_controller_1.CategoryControlleer.list)
    router.get('/categories', category_controller_1.CategoryControlleer.list);
if (category_controller_1.CategoryControlleer.get)
    router.get('/categories/:id', category_controller_1.CategoryControlleer.get);
if (product_controller_1.ProductController.list)
    router.get('/products', product_controller_1.ProductController.list);
if (product_controller_1.ProductController.get)
    router.get('/products/:id', product_controller_1.ProductController.get);
if (service_controller_1.ServiceController.list)
    router.get('/services', service_controller_1.ServiceController.list);
if (service_controller_1.ServiceController.get)
    router.get('/services/:id', service_controller_1.ServiceController.get);
// === RUTAS PROTEGIDAS === //
router.use(auth_middleware_1.verifyToken);
// Cambio de contraseña (autenticado)
router.post('/auth/change-password', auth_controller_1.AuthController.changePassword);
// Perfil propio (autenticado)
if (users_controller_1.UserController.me)
    router.get('/users/me', users_controller_1.UserController.me);
if (users_controller_1.UserController.updateMe)
    router.put('/users/me', cloudinary_1.upload.single('profile_picture'), users_controller_1.UserController.updateMe);
// Pedidos/Visitas del usuario autenticado (móvil)
if (visit_controller_1.VisitController.createForMe)
    router.post('/visits/mine', visit_controller_1.VisitController.createForMe);
if (visit_controller_1.VisitController.listMine)
    router.get('/visits/mine', visit_controller_1.VisitController.listMine);
if (product_controller_1.ProductController.create)
    router.post('/products', cloudinary_1.upload.single('image'), product_controller_1.ProductController.create);
if (service_controller_1.ServiceController.create)
    router.post('/services', cloudinary_1.upload.single('image'), service_controller_1.ServiceController.create);
if (users_controller_1.UserController.update)
    router.put('/users/:id', cloudinary_1.upload.single('profile_picture'), users_controller_1.UserController.update);
// Adjuntar imágenes a un pedido existente (propietario)
if (order_Controller_1.OrderController.addAttachments)
    router.post('/orders/:id/attachments', cloudinary_1.upload.array('product_images', 10), order_Controller_1.OrderController.addAttachments);
mountCrud('roles', role_controller_1.RoleController);
mountCrud('users', users_controller_1.UserController);
mountCrud('categories', category_controller_1.CategoryControlleer);
mountCrud('products', product_controller_1.ProductController);
mountCrud('services', service_controller_1.ServiceController);
mountCrud('visits', visit_controller_1.VisitController);
// Pedidos del usuario autenticado (sin necesidad de permiso de admin)
router.get('/orders/mine', order_Controller_1.OrderController.listMine);
// crear/consultar pedidos del usuario autenticado sin permisos
if (order_Controller_1.OrderController.createForMe)
    router.post('/orders/mine', cloudinary_1.upload.array('product_images', 10), order_Controller_1.OrderController.createForMe);
if (order_Controller_1.OrderController.listMine)
    router.get('/orders/mine', order_Controller_1.OrderController.listMine);
mountCrud('orders', order_Controller_1.OrderController);
mountCrud('payments', payment_controller_1.PaymentController);
// Pago por OCR de comprobante
router.post('/orders/:id/payments/ocr', cloudinary_1.upload.single('payment_image'), payment_controller_1.PaymentController.createFromReceiptOcr);
mountCrud('sales', sales_controller_1.SaleController);
mountCrud('permissions', permission_controller_1.PermissionController);
// === COTIZACIONES (protegidas sólo por autenticación; permisos finos se pueden agregar luego) === //
router.get('/quotations/mine', quotation_controller_1.QuotationController.listMine);
router.post('/quotations/cart', quotation_controller_1.QuotationController.createOrGetCart);
router.post('/quotations/quick', quotation_controller_1.QuotationController.quickCreate);
router.post('/quotations/:id/items', quotation_controller_1.QuotationController.addItem);
router.put('/quotations/:id/items/:itemId', quotation_controller_1.QuotationController.updateItem);
router.delete('/quotations/:id/items/:itemId', quotation_controller_1.QuotationController.removeItem);
router.post('/quotations/:id/submit', quotation_controller_1.QuotationController.submit);
router.post('/quotations/:id/quote', (0, verifyRole_1.verifyRole)('quotations', 'update'), quotation_controller_1.QuotationController.adminSetQuote);
router.post('/quotations/:id/decision', quotation_controller_1.QuotationController.userDecision);
router.get('/quotations', (0, verifyRole_1.verifyRole)('quotations', 'view'), quotation_controller_1.QuotationController.listAll);
router.get('/quotations/:id', quotation_controller_1.QuotationController.get);
router.get('/quotations/:quotationId/messages', chat_controller_1.ChatController.listMessages);
// Permitir a administradores leer mensajes de cualquier cotización
// (dueño ya pasa por verificación dentro del controlador)
// Nota: esta línea debe ir DESPUÉS de router.use(verifyToken)
// pero antes de montar otros middlewares que no apliquen.
exports.default = router;
