import { Router } from 'express';
import { RoleController } from '../controllers/role.controller';
import { UserController } from '../controllers/users.controller';
import { AuthController } from '../controllers/auth.controller';
import { CategoryControlleer } from '../controllers/category.controller';
import { ProductController } from '../controllers/product.controller';
import { ServiceController } from '../controllers/service.controller';
import { VisitController } from '../controllers/visit.controller';
import { OrderController } from '../controllers/order.Controller';
import { PaymentController } from '../controllers/payment.controller';
import { SaleController } from '../controllers/sales.controller';
import { PermissionController } from '../controllers/permission.controller';
import { verifyToken } from '../middlewares/auth.middleware';
import { verifyRole } from '../middlewares/verifyRole';
import { QuotationController } from '../controllers/quotation.controller';
import { ChatController } from '../controllers/chat.controller';
import { upload } from '../utils/cloudinary';
import { DashboardController } from '../controllers/dashboard.controller';

const router = Router();

function mountCrud(path: string, controller: any) {
	if (controller.list) router.get(`/${path}`, verifyRole(path, 'view'), controller.list);
	if (controller.get) router.get(`/${path}/:id`, verifyRole(path, 'view'), controller.get);
	if (controller.create) router.post(`/${path}`, verifyRole(path, 'create'), controller.create);
	if (controller.update)
		router.put(`/${path}/:id`, verifyRole(path, 'update'), controller.update);
	if (controller.remove)
		router.delete(`/${path}/:id`, verifyRole(path, 'delete'), controller.remove);
}

// === RUTAS PUBLICAS === //
router.post('/auth/login', AuthController.login);
router.post('/auth/logout', AuthController.logout);
router.get('/auth/me', verifyToken, AuthController.me);
router.post('/auth/google', AuthController.google);
router.post('/auth/profile', verifyToken, AuthController.profile);
// Recuperación de contraseña (público)
router.post('/auth/forgot-password', AuthController.forgotPassword);
router.post('/auth/reset-password', AuthController.resetPassword);
// Registro público con cookie
router.post('/auth/register', AuthController.register);
// Registro público de usuarios (para permitir sign-up y tests)
router.post('/users', UserController.create);

// Catálogo público: categorías, productos y servicios visibles sin login
// Listado y detalle abiertos
if (CategoryControlleer.list) router.get('/categories', CategoryControlleer.list);
if (CategoryControlleer.get) router.get('/categories/:id', CategoryControlleer.get);
if (ProductController.list) router.get('/products', ProductController.list);
if (ProductController.get) router.get('/products/:id', ProductController.get);
if (ServiceController.list) router.get('/services', ServiceController.list);
if (ServiceController.get) router.get('/services/:id', ServiceController.get);

// === RUTAS PROTEGIDAS === //
router.use(verifyToken);
// Cambio de contraseña (autenticado)
router.post('/auth/change-password', AuthController.changePassword);
// Perfil propio (autenticado)
if ((UserController as any).me) router.get('/users/me', (UserController as any).me);
if ((UserController as any).updateMe)
	router.put('/users/me', upload.single('profile_picture'), (UserController as any).updateMe);
// Chat - mensajes directos entre usuarios (DM)
router.get('/chat/dm/:userId', ChatController.listDmWithUser);
// Pedidos/Visitas del usuario autenticado (móvil)
if ((VisitController as any).createForMe) router.post('/visits/mine', (VisitController as any).createForMe);
if ((VisitController as any).listMine) router.get('/visits/mine', (VisitController as any).listMine);
if (ProductController.create)
	router.post('/products', upload.single('image'), ProductController.create);
if (ServiceController.create)
	router.post('/services', upload.single('image'), ServiceController.create);
if (UserController.update) router.put('/users/:id', upload.single('profile_picture'), UserController.update);
// Adjuntar imágenes a un pedido existente (propietario)
if ((OrderController as any).addAttachments)
	router.post('/orders/:id/attachments', upload.array('product_images', 10), (OrderController as any).addAttachments);

// Dashboard (solo admin)
router.get('/dashboard', verifyRole('dashboard', 'view'), DashboardController.get);

mountCrud('roles', RoleController);
mountCrud('users', UserController);
mountCrud('categories', CategoryControlleer);
mountCrud('products', ProductController);
mountCrud('services', ServiceController);
mountCrud('visits', VisitController);
// Pedidos del usuario autenticado (sin necesidad de permiso de admin)
router.get('/orders/mine', OrderController.listMine);
// crear/consultar pedidos del usuario autenticado sin permisos
if ((OrderController as any).createForMe) router.post('/orders/mine', upload.array('product_images', 10), (OrderController as any).createForMe);
if ((OrderController as any).listMine) router.get('/orders/mine', (OrderController as any).listMine);
mountCrud('orders', OrderController);
mountCrud('payments', PaymentController);
// Pago por OCR de comprobante
router.post('/orders/:id/payments/ocr', upload.single('payment_image'), PaymentController.createFromReceiptOcr);
mountCrud('sales', SaleController);
mountCrud('permissions', PermissionController);

// === COTIZACIONES (protegidas sólo por autenticación; permisos finos se pueden agregar luego) === //
router.get('/quotations/mine', QuotationController.listMine);
router.post('/quotations/cart', QuotationController.createOrGetCart);
router.post('/quotations/quick', QuotationController.quickCreate);
router.post('/quotations/:id/items', QuotationController.addItem);
router.put('/quotations/:id/items/:itemId', QuotationController.updateItem);
router.delete('/quotations/:id/items/:itemId', QuotationController.removeItem);
router.post('/quotations/:id/submit', QuotationController.submit);
router.post(
	'/quotations/:id/quote',
	verifyRole('quotations', 'update'),
	QuotationController.adminSetQuote
);
router.post('/quotations/:id/decision', QuotationController.userDecision);
router.get('/quotations', verifyRole('quotations', 'view'), QuotationController.listAll);
router.get('/quotations/:id', QuotationController.get);
router.get('/quotations/:quotationId/messages', ChatController.listMessages);
// Permitir a administradores leer mensajes de cualquier cotización
// (dueño ya pasa por verificación dentro del controlador)
// Nota: esta línea debe ir DESPUÉS de router.use(verifyToken)
// pero antes de montar otros middlewares que no apliquen.

export default router;