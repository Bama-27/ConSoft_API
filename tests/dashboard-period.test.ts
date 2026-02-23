import request from 'supertest';
import { createApp } from '../src/app';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { hash } from 'bcrypt';
import { RoleModel } from '../src/models/role.model';
import { PermissionModel } from '../src/models/permission.model';
import { UserModel } from '../src/models/user.model';
import { CategoryModel } from '../src/models/category.model';
import { ProductModel } from '../src/models/product.model';
import { OrderModel } from '../src/models/order.model';

describe('Dashboard period filter', () => {
	const app = createApp();
	let mongo: MongoMemoryServer;

	beforeAll(async () => {
		mongo = await MongoMemoryServer.create();
		await mongoose.connect(mongo.getUri());
	});

	afterAll(async () => {
		await mongoose.connection.dropDatabase();
		await mongoose.connection.close();
		await mongo.stop();
	});

	it('supports period=month and returns previous and current blocks', async () => {
		const perm = await PermissionModel.create({ module: 'dashboard', action: 'view' } as any);
		const role = await RoleModel.create({ name: 'Administrador', description: 'Admin', permissions: [perm._id] });
		const password = 'Secret123!';
		await UserModel.create({
			name: 'Admin',
			email: 'admin3@test.com',
			password: await hash(password, 10),
			role: role._id,
		});

		const category = await CategoryModel.create({ name: 'Muebles' } as any);
		const product = await ProductModel.create({ name: 'Silla', category: category._id } as any);
		const user = await UserModel.findOne({ email: 'admin3@test.com' }).select('_id');

		// Pedido pagado en Enero 2026
		await OrderModel.create({
			user: user!._id,
			status: 'entregado',
			startedAt: new Date('2026-01-15T10:00:00.000Z'),
			items: [{ tipo: 'producto', id_producto: product._id, cantidad: 1, valor: 100 }],
			payments: [
				{ amount: 100, paidAt: new Date('2026-01-16T10:00:00.000Z'), method: 'qr', status: 'aprobado' },
			],
		} as any);

		const login = await request(app)
			.post('/api/auth/login')
			.send({ email: 'admin3@test.com', password });
		expect(login.status).toBe(200);
		const cookies = login.headers['set-cookie'];
		expect(cookies).toBeDefined();

		const resp = await request(app)
			.get('/api/dashboard?period=month&compare=true')
			.set('Cookie', cookies);

		expect(resp.status).toBe(200);
		expect(resp.body.ok).toBe(true);
		expect(resp.body.mode).toBe('period');
		expect(resp.body.period).toBe('month');
		expect(resp.body.previous).toBeDefined();
		expect(resp.body.current).toBeDefined();
		expect(resp.body.previous.summary).toBeDefined();
		expect(resp.body.current.summary).toBeDefined();
	});
});
