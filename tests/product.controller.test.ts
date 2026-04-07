import request from 'supertest';
import { createApp } from '../src/app';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { hash } from 'bcrypt';
import { RoleModel } from '../src/models/role.model';
import { PermissionModel } from '../src/models/permission.model';
import { UserModel } from '../src/models/user.model';
import { ProductModel } from '../src/models/product.model';
import { CategoryModel } from '../src/models/category.model';

describe('Product Controller Integration Tests', () => {
    const app = createApp();
    let mongo: MongoMemoryServer;
    let adminCookie: any;
    let categoryId: mongoose.Types.ObjectId;

    beforeAll(async () => {
        mongo = await MongoMemoryServer.create();
        await mongoose.connect(mongo.getUri());

        const createPerm = await PermissionModel.create({ module: 'products', action: 'create' } as any);
        const updatePerm = await PermissionModel.create({ module: 'products', action: 'update' } as any);
        const deletePerm = await PermissionModel.create({ module: 'products', action: 'delete' } as any);
        
        const role = await RoleModel.create({ 
            name: 'Admin', 
            description: 'Admin', 
            permissions: [createPerm._id, updatePerm._id, deletePerm._id] 
        });
        
        const password = 'AdminPassword123!';
        await UserModel.create({
            name: 'AdminUser',
            email: 'admin_prod@test.com',
            password: await hash(password, 10),
            role: role._id,
        });

        const category = await CategoryModel.create({ name: 'Furniture' });
        categoryId = category._id;

        const loginRes = await request(app)
            .post('/api/auth/login')
            .send({ email: 'admin_prod@test.com', password });
        adminCookie = loginRes.headers['set-cookie'];
    });

    afterAll(async () => {
        await mongoose.connection.dropDatabase();
        await mongoose.connection.close();
        await mongo.stop();
    });

    beforeEach(async () => {
        await ProductModel.deleteMany({});
    });

    describe('POST /api/products', () => {
        it('should create a new product', async () => {
            const res = await request(app)
                .post('/api/products')
                .set('Cookie', adminCookie)
                // Usando send o attach si fuera multipart, el app.js no parece interceptar multer globalmente acá sin auth primero
                // Let's use simple fields
                .field('name', 'Chair')
                .field('category', categoryId.toString())
                .field('description', 'A comfortable chair');

            expect(res.status).toBe(201);
            expect(res.body.name).toBe('Chair');
            // Nota: multer se aplica si pasamos algo multipart. A veces supertest hace que res sea 500 si no puede parsearlo bien si la ruta tiene multer en api.ts. Probemos simple POST.
        });

        it('should return 400 if name is missing', async () => {
            const res = await request(app)
                .post('/api/products')
                .set('Cookie', adminCookie)
                .send({ category: categoryId.toString() });

            expect(res.status).toBe(400);
        });
    });

    describe('GET /api/products', () => {
        it('should list products publicly', async () => {
            await ProductModel.create({ name: 'Sofa', category: categoryId });
            await ProductModel.create({ name: 'Table', category: categoryId });

            const res = await request(app).get('/api/products');

            expect(res.status).toBe(200);
            expect(res.body.ok).toBe(true);
            expect(res.body.products).toBeDefined();
            expect(res.body.products.length).toBe(2);
        });

        it('should list products filtering by search', async () => {
            await ProductModel.create({ name: 'Sofa', category: categoryId });
            await ProductModel.create({ name: 'Table', category: categoryId });

            const res = await request(app).get('/api/products?search=sofa');

            expect(res.status).toBe(200);
            expect(res.body.ok).toBe(true);
            expect(res.body.products.length).toBe(1);
            expect(res.body.products[0].name).toBe('Sofa');
        });
    });

    describe('GET /api/products/:id', () => {
        it('should get a specific product', async () => {
            const product = await ProductModel.create({ name: 'Desk', category: categoryId });

            const res = await request(app).get(`/api/products/${product._id}`);
            expect(res.status).toBe(200);
            expect(res.body.ok).toBe(true);
            expect(res.body.data.name).toBe('Desk');
        });
    });

    describe('PUT /api/products/:id', () => {
        it('should update an existing product', async () => {
            const product = await ProductModel.create({ name: 'OldName', category: categoryId });

            const res = await request(app)
                .put(`/api/products/${product._id}`)
                .set('Cookie', adminCookie)
                .send({ name: 'NewName' });

            expect(res.status).toBe(200);
            expect(res.body.ok).toBe(true);
            expect(res.body.data.name).toBe('NewName');
        });
    });

    describe('DELETE /api/products/:id', () => {
        it('should delete a product', async () => {
            const product = await ProductModel.create({ name: 'ToDelete', category: categoryId });

            const res = await request(app)
                .delete(`/api/products/${product._id}`)
                .set('Cookie', adminCookie);

            expect(res.status).toBe(204);
        });
    });
});
