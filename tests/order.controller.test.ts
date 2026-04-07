import request from 'supertest';
import { createApp } from '../src/app';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { hash } from 'bcrypt';
import { RoleModel } from '../src/models/role.model';
import { PermissionModel } from '../src/models/permission.model';
import { UserModel } from '../src/models/user.model';
import { OrderModel } from '../src/models/order.model';

describe('Order Controller Integration Tests', () => {
    const app = createApp();
    let mongo: MongoMemoryServer;
    let adminCookie: any;
    let clientCookie: any;
    let clientId: mongoose.Types.ObjectId;

    beforeAll(async () => {
        mongo = await MongoMemoryServer.create();
        await mongoose.connect(mongo.getUri());

        const viewPerm = await PermissionModel.create({ module: 'orders', action: 'view' } as any);
        const createPerm = await PermissionModel.create({ module: 'orders', action: 'create' } as any);
        const updatePerm = await PermissionModel.create({ module: 'orders', action: 'update' } as any);
        const role = await RoleModel.create({ 
            name: 'Admin', 
            description: 'Admin', 
            permissions: [viewPerm._id, createPerm._id, updatePerm._id] 
        });
        
        const password = 'AdminPassword123!';
        await UserModel.create({
            name: 'AdminUser',
            email: 'admin_order@test.com',
            password: await hash(password, 10),
            role: role._id,
        });

        const clientRole = await RoleModel.create({ name: 'Client' });
        const client = await UserModel.create({
            name: 'ClientOrder',
            email: 'client_order@test.com',
            password: await hash(password, 10),
            role: clientRole._id,
        });
        clientId = client._id;

        const loginAdmin = await request(app)
            .post('/api/auth/login')
            .send({ email: 'admin_order@test.com', password });
        adminCookie = loginAdmin.headers['set-cookie'];

        const loginClient = await request(app)
            .post('/api/auth/login')
            .send({ email: 'client_order@test.com', password });
        clientCookie = loginClient.headers['set-cookie'];
    });

    afterAll(async () => {
        await mongoose.connection.dropDatabase();
        await mongoose.connection.close();
        await mongo.stop();
    });

    beforeEach(async () => {
        await OrderModel.deleteMany({});
    });

    describe('GET /api/orders', () => {
        it('should list orders for admin', async () => {
            await OrderModel.create({
                user: clientId,
                startedAt: new Date(),
                items: [{ valor: 100 }],
                payments: [{ amount: 10, status: 'aprobado', method: 'cash', paidAt: new Date() }]
            } as any);

            const res = await request(app)
                .get('/api/orders')
                .set('Cookie', adminCookie);

            expect(res.status).toBe(200);
            expect(res.body.ok).toBe(true);
            expect(res.body.orders.length).toBe(1);
        });
    });

    describe('POST /api/orders', () => {
        it('should create an order by admin', async () => {
            const res = await request(app)
                .post('/api/orders')
                .set('Cookie', adminCookie)
                .send({
                    user: clientId.toString(),
                    items: [{ valor: 200, tipo: 'producto', cantidad: 1 }],
                    address: 'Order Addr'
                });

            expect(res.status).toBe(201);
            expect(res.body.ok).toBe(true);
            expect(res.body.order.address).toBe('Order Addr');
        });
    });

    describe('POST /api/orders/mine', () => {
        it('should create an order for the client', async () => {
            const res = await request(app)
                .post('/api/orders/mine')
                .set('Cookie', clientCookie)
                .send({
                    items: [{ valor: 150, tipo: 'producto', cantidad: 2 }],
                    address: 'Home Addr'
                });

            expect(res.status).toBe(201);
            expect(res.body.ok).toBe(true);
            expect(res.body.order.address).toBe('Home Addr');
            expect(res.body.order.user.email).toBe('client_order@test.com');
        });
    });

    describe('GET /api/orders/mine', () => {
        it('should list my orders', async () => {
            await OrderModel.create({
                user: clientId,
                startedAt: new Date(),
                items: [{ valor: 100 }],
                address: 'Mine'
            } as any);

            const res = await request(app)
                .get('/api/orders/mine')
                .set('Cookie', clientCookie);

            expect(res.status).toBe(200);
            expect(res.body.ok).toBe(true);
            expect(res.body.orders.length).toBe(1);
            expect(res.body.orders[0].raw.status).toBe('Pendiente');
        });
    });

    describe('POST /api/orders/:id/review', () => {
        it('should add a review to the order', async () => {
            const order = await OrderModel.create({
                user: clientId,
                items: [{ valor: 100 }]
            } as any);

            const res = await request(app)
                .post(`/api/orders/${order._id}/reviews`)
                .set('Cookie', clientCookie)
                .send({
                    rating: 5,
                    comment: 'Great service!'
                });

            expect(res.status).toBe(201);
            expect(res.body.ok).toBe(true);
            expect(res.body.review.rating).toBe(5);
        });

        it('should list order review', async () => {
            const order = await OrderModel.create({
                user: clientId,
                items: [{ valor: 100 }],
                reviews: [{ user: clientId, rating: 4, comment: 'Nice' }]
            } as any);

            const res = await request(app)
                .get(`/api/orders/${order._id}/reviews`)
                .set('Cookie', clientCookie);

            expect(res.status).toBe(200);
            expect(res.body.reviews.length).toBe(1);
            expect(res.body.reviews[0].rating).toBe(4);
        });
    });
});
