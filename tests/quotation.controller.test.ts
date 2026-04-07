import request from 'supertest';
import { createApp } from '../src/app';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { hash } from 'bcrypt';
import { RoleModel } from '../src/models/role.model';
import { UserModel } from '../src/models/user.model';
import { QuotationModel } from '../src/models/quotation.model';
import { ProductModel } from '../src/models/product.model';
import { CategoryControlleer } from '../src/controllers/category.controller';
import { CategoryModel } from '../src/models/category.model';

describe('Quotation Controller Integration Tests', () => {
    const app = createApp();
    let mongo: MongoMemoryServer;
    let adminCookie: any;
    let clientCookie: any;
    let clientId: mongoose.Types.ObjectId;
    let productId: mongoose.Types.ObjectId;

    beforeAll(async () => {
        mongo = await MongoMemoryServer.create();
        await mongoose.connect(mongo.getUri());

        const role = await RoleModel.create({ 
            name: 'Admin', 
            description: 'Admin', 
            permissions: [] 
        });
        
        const password = 'AdminPassword123!';
        await UserModel.create({
            name: 'AdminUser',
            email: 'admin_quo@test.com',
            password: await hash(password, 10),
            role: role._id,
        });

        const clientRole = await RoleModel.create({ name: 'Client' });
        const client = await UserModel.create({
            name: 'ClientQuo',
            email: 'client_quo@test.com',
            password: await hash(password, 10),
            role: clientRole._id,
        });
        clientId = client._id;

        const category = await CategoryModel.create({ name: 'Test Category' });
        const product = await ProductModel.create({
            name: 'Test Product',
            price: 100,
            category: category._id
        });
        productId = product._id;

        const loginAdmin = await request(app)
            .post('/api/auth/login')
            .send({ email: 'admin_quo@test.com', password });
        adminCookie = loginAdmin.headers['set-cookie'];

        const loginClient = await request(app)
            .post('/api/auth/login')
            .send({ email: 'client_quo@test.com', password });
        clientCookie = loginClient.headers['set-cookie'];
    });

    afterAll(async () => {
        await mongoose.connection.dropDatabase();
        await mongoose.connection.close();
        await mongo.stop();
    });

    beforeEach(async () => {
        await QuotationModel.deleteMany({});
    });

    describe('GET /api/quotations/mine', () => {
        it('should list my quotations', async () => {
            await QuotationModel.create({ user: clientId, status: 'Solicitada', items: [] });
            
            const res = await request(app)
                .get('/api/quotations/mine')
                .set('Cookie', clientCookie);

            expect(res.status).toBe(200);
            expect(res.body.ok).toBe(true);
            expect(res.body.quotations.length).toBe(1);
        });
    });

    describe('POST /api/quotations/cart', () => {
        it('should create or get cart', async () => {
            const res = await request(app)
                .post('/api/quotations/cart')
                .set('Cookie', clientCookie);

            expect(res.status).toBe(200);
            expect(res.body.cart.status).toBe('Carrito');
        });
    });

    describe('POST /api/quotations/:id/items', () => {
        it('should add item to quotation', async () => {
            const quo = await QuotationModel.create({ user: clientId, status: 'Solicitada', items: [] });

            const res = await request(app)
                .post(`/api/quotations/${quo._id}/items`)
                .set('Cookie', clientCookie)
                .send({
                    productId: productId.toString(),
                    quantity: 2,
                    color: 'red'
                });

            expect(res.status).toBe(200);
            expect(res.body.quotation.items.length).toBe(1);
        });

        it('should add custom item', async () => {
            const quo = await QuotationModel.create({ user: clientId, status: 'Solicitada', items: [] });

            const res = await request(app)
                .post(`/api/quotations/${quo._id}/items`)
                .set('Cookie', clientCookie)
                .send({
                    isCustom: true,
                    customDetails: {
                        name: 'Custom chair',
                        description: 'A custom chair description'
                    },
                    quantity: 1,
                    color: 'blue'
                });

            expect(res.status).toBe(200);
            expect(res.body.quotation.items.length).toBe(1);
            expect(res.body.quotation.items[0].isCustom).toBe(true);
        });
    });
});
