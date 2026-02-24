import request from 'supertest';
import { createApp } from '../src/app';
import { hash } from 'bcrypt';
import { RoleModel } from '../src/models/role.model';
import { UserModel } from '../src/models/user.model';
import { OrderModel } from '../src/models/order.model';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';

let mongo: MongoMemoryServer;

async function setupInMemoryMongo() {
	mongo = await MongoMemoryServer.create();
	const uri = mongo.getUri();
	await mongoose.connect(uri);
}

async function teardownInMemoryMongo() {
	await mongoose.connection.dropDatabase();
	await mongoose.connection.close();
	if (mongo) await mongo.stop();
}

// Reseñas embebidas en Pedido

describe('Order reviews', () => {
	const app = createApp();

	beforeAll(async () => {
		await setupInMemoryMongo();
	});

	afterAll(async () => {
		await teardownInMemoryMongo();
	});

	it('allows owner to create a single review per order and list it', async () => {
		const role = await RoleModel.create({ name: 'Usuario', description: 'User', permissions: [] });
		const password = 'Secret123!';
		const user = await UserModel.create({
			name: 'Client',
			email: 'client2@test.com',
			password: await hash(password, 10),
			role: role._id,
		});

		const order = await OrderModel.create({
			user: user._id,
			status: 'entregado',
			address: 'Calle 1',
			startedAt: new Date(),
			items: [],
			payments: [],
			attachments: [],
			reviews: [],
		} as any);

		const login = await request(app)
			.post('/api/auth/login')
			.send({ email: 'client2@test.com', password });
		expect(login.status).toBe(200);
		const cookies = login.headers['set-cookie'];
		expect(cookies).toBeDefined();

		const create = await request(app)
			.post(`/api/orders/${order._id}/reviews`)
			.set('Cookie', cookies)
			.send({ rating: 5, comment: 'Excelente' });
		expect(create.status).toBe(201);
		expect(create.body.ok).toBe(true);
		expect(create.body.review.rating).toBe(5);

		const dup = await request(app)
			.post(`/api/orders/${order._id}/reviews`)
			.set('Cookie', cookies)
			.send({ rating: 4, comment: 'Otra' });
		expect(dup.status).toBe(409);

		const list = await request(app)
			.get(`/api/orders/${order._id}/reviews`)
			.set('Cookie', cookies);
		expect(list.status).toBe(200);
		expect(list.body.ok).toBe(true);
		expect(Array.isArray(list.body.reviews)).toBe(true);
		expect(list.body.reviews.length).toBe(1);
	});
});
