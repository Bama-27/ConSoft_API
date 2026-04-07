import request from 'supertest';
import { createApp } from '../src/app';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { hash } from 'bcrypt';
import { RoleModel } from '../src/models/role.model';
import { PermissionModel } from '../src/models/permission.model';
import { UserModel } from '../src/models/user.model';
import { CategoryModel } from '../src/models/category.model';

describe('Category Controller Integration Tests', () => {
	const app = createApp();
	let mongo: MongoMemoryServer;
	let adminCookie: any;

	beforeAll(async () => {
		mongo = await MongoMemoryServer.create();
		await mongoose.connect(mongo.getUri());

		// Create permissions for categories
		const createPerm = await PermissionModel.create({ module: 'categories', action: 'create' } as any);
		const updatePerm = await PermissionModel.create({ module: 'categories', action: 'update' } as any);
		const deletePerm = await PermissionModel.create({ module: 'categories', action: 'delete' } as any);

		const role = await RoleModel.create({ 
			name: 'Admin', 
			description: 'Admin', 
			permissions: [createPerm._id, updatePerm._id, deletePerm._id] 
		});
		
		const password = 'AdminPassword123!';
		await UserModel.create({
			name: 'AdminUser',
			email: 'admin_cat@test.com',
			password: await hash(password, 10),
			role: role._id,
		});

		// Login to get cookie
		const loginRes = await request(app)
			.post('/api/auth/login')
			.send({ email: 'admin_cat@test.com', password });
		adminCookie = loginRes.headers['set-cookie'];
	});

	afterAll(async () => {
		await mongoose.connection.dropDatabase();
		await mongoose.connection.close();
		await mongo.stop();
	});

	beforeEach(async () => {
		await CategoryModel.deleteMany({});
	});

	describe('POST /api/categories', () => {
		it('should create a new category', async () => {
			const res = await request(app)
				.post('/api/categories')
				.set('Cookie', adminCookie)
				.send({ name: 'Electronics', description: 'Electronic devices' });

			expect(res.status).toBe(201);
			expect(res.body.name).toBe('Electronics');
			expect(res.body.description).toBe('Electronic devices');
		});

		it('should return 401 if not authenticated', async () => {
			const res = await request(app)
				.post('/api/categories')
				.send({ name: 'Furniture' });

			expect(res.status).toBe(401);
		});

		it('should return 400 if name is missing', async () => {
			const res = await request(app)
				.post('/api/categories')
				.set('Cookie', adminCookie)
				.send({ description: 'No name' });

			expect(res.status).toBe(400);
			expect(res.body.message).toBe('name is required');
		});
	});

	describe('GET /api/categories', () => {
		it('should list categories publicly', async () => {
			await CategoryModel.create({ name: 'Books', description: 'All kinds of books' });
			await CategoryModel.create({ name: 'Toys', description: 'Toys for kids' });

			const res = await request(app)
				.get('/api/categories')
				.send();

			expect(res.status).toBe(200);
			expect(res.body.ok).toBe(true);
			expect(res.body.categories).toBeDefined();
			expect(res.body.categories.length).toBe(2);
		});
	});

	describe('GET /api/categories/:id', () => {
		it('should get a single category by id publicly', async () => {
			const cat = await CategoryModel.create({ name: 'Food', description: 'Yummy' });

			const res = await request(app).get(`/api/categories/${cat._id}`);
			expect(res.status).toBe(200);
			expect(res.body.ok).toBe(true);
			expect(res.body.data.name).toBe('Food');
		});

		it('should return 404 for invalid id format or missing category', async () => {
			const res = await request(app).get(`/api/categories/5f4eba3a123f4b23456789ab`);
			expect(res.status).toBe(404);
		});
	});

	describe('PUT /api/categories/:id', () => {
		it('should update an existing category', async () => {
			const cat = await CategoryModel.create({ name: 'OldName', description: 'OldDesc' });

			const res = await request(app)
				.put(`/api/categories/${cat._id}`)
				.set('Cookie', adminCookie)
				.send({ name: 'NewName' });

			expect(res.status).toBe(200);
			expect(res.body.ok).toBe(true);
			expect(res.body.data.name).toBe('NewName');
		});
	});

	describe('DELETE /api/categories/:id', () => {
		it('should delete a category', async () => {
			const cat = await CategoryModel.create({ name: 'ToDelete' });

			const deleteRes = await request(app)
				.delete(`/api/categories/${cat._id}`)
				.set('Cookie', adminCookie);

			expect(deleteRes.status).toBe(204);

			const getRes = await request(app).get(`/api/categories/${cat._id}`);
			expect(getRes.status).toBe(404);
		});
	});
});
