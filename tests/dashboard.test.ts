import request from 'supertest';
import { createApp } from '../src/app';
import { setupInMemoryMongo, teardownInMemoryMongo } from './setup-db';
import { hash } from 'bcrypt';
import { RoleModel } from '../src/models/role.model';
import { PermissionModel } from '../src/models/permission.model';
import { UserModel } from '../src/models/user.model';
import { CategoryModel } from '../src/models/category.model';
import { ProductModel } from '../src/models/product.model';
import { ServiceModel } from '../src/models/service.model';
import { OrderModel } from '../src/models/order.model';

describe('Dashboard', () => {
	const app = createApp();

	beforeAll(async () => {
		await setupInMemoryMongo();
	});

	afterAll(async () => {
		await teardownInMemoryMongo();
	});

	it('returns monthly/quarterly/semiannual series for paid orders (admin only)', async () => {
		const perm = await PermissionModel.create({ module: 'dashboard', action: 'view' } as any);
		const role = await RoleModel.create({
			name: 'Administrador',
			description: 'Admin',
			permissions: [perm._id],
		});
		const password = 'Secret123!';
		await UserModel.create({
			name: 'Admin',
			email: 'admin@test.com',
			password: await hash(password, 10),
			role: role._id,
		});

		const category = await CategoryModel.create({ name: 'Muebles' } as any);
		const product = await ProductModel.create({ name: 'Silla', category: category._id } as any);
		const service = await ServiceModel.create({ name: 'Tapizado' } as any);

		const startedAt = new Date('2026-01-15T10:00:00.000Z');
		await OrderModel.create({
			user: (await UserModel.findOne({ email: 'admin@test.com' }).select('_id'))!._id,
			status: 'entregado',
			startedAt,
			items: [
				{ tipo: 'producto', id_producto: product._id, cantidad: 2, valor: 100 },
				{ tipo: 'servicio', id_servicio: service._id, cantidad: 1, valor: 50 },
			],
			payments: [
				{ amount: 150, paidAt: new Date('2026-01-16T10:00:00.000Z'), method: 'qr', status: 'aprobado' },
			],
		} as any);

		const login = await request(app)
			.post('/api/auth/login')
			.send({ email: 'admin@test.com', password });
		expect(login.status).toBe(200);
		const cookies = login.headers['set-cookie'];
		expect(cookies).toBeDefined();

		const from = '2026-01-01';
		const to = '2026-12-31';
		const resp = await request(app)
			.get(`/api/dashboard?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&limit=10`)
			.set('Cookie', cookies);

		expect(resp.status).toBe(200);
		expect(resp.body.ok).toBe(true);
		expect(resp.body.summary.totalSales).toBe(1);
		expect(resp.body.summary.totalRevenue).toBe(150);
		expect(resp.body.series.monthly).toBeDefined();
		expect(resp.body.series.quarterly).toBeDefined();
		expect(resp.body.series.semiannual).toBeDefined();

		const topProducts = resp.body.topItems.products;
		const topServices = resp.body.topItems.services;
		expect(Array.isArray(topProducts)).toBe(true);
		expect(Array.isArray(topServices)).toBe(true);
		expect(topProducts[0].quantity).toBe(2);
		expect(topServices[0].quantity).toBe(1);
	});
});
