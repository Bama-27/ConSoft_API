import request from 'supertest';
import { createApp } from '../src/app';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { hash } from 'bcrypt';
import { RoleModel } from '../src/models/role.model';
import { PermissionModel } from '../src/models/permission.model';
import { UserModel } from '../src/models/user.model';
import { OrderModel } from '../src/models/order.model';

describe('Payment Controller Integration Tests', () => {
    const app = createApp();
    let mongo: MongoMemoryServer;
    let adminCookie: any;
    let clientId: mongoose.Types.ObjectId;

    beforeAll(async () => {
        mongo = await MongoMemoryServer.create();
        await mongoose.connect(mongo.getUri());

        const viewPerm = await PermissionModel.create({ module: 'payments', action: 'view' } as any);
        const createPerm = await PermissionModel.create({ module: 'payments', action: 'create' } as any);
        const updatePerm = await PermissionModel.create({ module: 'payments', action: 'update' } as any);
        const deletePerm = await PermissionModel.create({ module: 'payments', action: 'delete' } as any);
        const role = await RoleModel.create({ 
            name: 'Admin', 
            description: 'Admin', 
            permissions: [viewPerm._id, createPerm._id, updatePerm._id, deletePerm._id] 
        });
        
        const password = 'AdminPassword123!';
        await UserModel.create({
            name: 'AdminUser',
            email: 'admin_pay@test.com',
            password: await hash(password, 10),
            role: role._id,
        });

        const clientRole = await RoleModel.create({ name: 'Client' });
        const client = await UserModel.create({
            name: 'ClientUser',
            email: 'client_pay@test.com',
            password: await hash(password, 10),
            role: clientRole._id,
        });
        clientId = client._id;

        const loginRes = await request(app)
            .post('/api/auth/login')
            .send({ email: 'admin_pay@test.com', password });
        adminCookie = loginRes.headers['set-cookie'];
    });

    afterAll(async () => {
        await mongoose.connection.dropDatabase();
        await mongoose.connection.close();
        await mongo.stop();
    });

    beforeEach(async () => {
        await OrderModel.deleteMany({});
    });

    describe('GET /api/payments', () => {
        it('should list payments', async () => {
            await OrderModel.create({
                user: clientId,
                items: [{ valor: 100 }],
                payments: [{ amount: 50, status: 'aprobado', method: 'cash', paidAt: new Date() }]
            } as any);

            const res = await request(app)
                .get('/api/payments')
                .set('Cookie', adminCookie);

            expect(res.status).toBe(200);
            expect(res.body.ok).toBe(true);
            expect(res.body.payments.length).toBe(1);
            expect(res.body.payments[0].payment.amount).toBe(50);
        });
    });

    describe('POST /api/payments', () => {
        it('should add a payment to an order', async () => {
            const order = await OrderModel.create({
                user: clientId,
                items: [{ valor: 100 }]
            } as any);

            const res = await request(app)
                .post('/api/payments')
                .set('Cookie', adminCookie)
                .send({
                    orderId: order._id.toString(),
                    amount: 30,
                    paidAt: new Date(),
                    method: 'cash',
                    status: 'aprobado'
                });

            expect(res.status).toBe(201);
            expect(res.body.amount).toBe(30);

            const check = await OrderModel.findById(order._id);
            expect(check!.payments.length).toBe(1);
        });
    });

    describe('GET /api/payments/:id', () => {
        it('should retrieve payment totals for an order', async () => {
            const order = await OrderModel.create({
                user: clientId,
                items: [{ valor: 100 }],
                payments: [{ amount: 50, status: 'aprobado', method: 'cash', paidAt: new Date() }]
            } as any);

            const res = await request(app)
                .get(`/api/payments/${order._id}`)
                .set('Cookie', adminCookie);

            expect(res.status).toBe(200);
            expect(res.body.paid).toBe(50);
            expect(res.body.restante).toBe(50);
        });
    });

    describe('PUT /api/payments/:id', () => {
        it('should update a specific payment inside an order', async () => {
            const order = await OrderModel.create({
                user: clientId,
                items: [{ valor: 100 }],
                payments: [{ amount: 50, status: 'aprobado', method: 'cash', paidAt: new Date() }]
            } as any);
            const paymentId = order.payments[0]._id;

            const res = await request(app)
                .put(`/api/payments/${order._id}`)
                .set('Cookie', adminCookie)
                .send({
                    paymentId,
                    amount: 80
                });

            expect(res.status).toBe(200);
            expect(res.body.amount).toBe(80);
        });
    });

    describe('DELETE /api/payments/:id', () => {
        it('should delete a specific payment from an order', async () => {
            const order = await OrderModel.create({
                user: clientId,
                items: [{ valor: 100 }],
                payments: [{ amount: 50, status: 'aprobado', method: 'cash', paidAt: new Date() }]
            } as any);
            const paymentId = order.payments[0]._id;

            const res = await request(app)
                .delete(`/api/payments/${order._id}`)
                .set('Cookie', adminCookie)
                .send({ paymentId });

            expect(res.status).toBe(204);

            const check = await OrderModel.findById(order._id);
            expect(check!.payments.length).toBe(0);
        });
    });
});
