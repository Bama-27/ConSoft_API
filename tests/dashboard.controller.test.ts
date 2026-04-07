import request from 'supertest';
import { createApp } from '../src/app';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { hash } from 'bcrypt';
import { RoleModel } from '../src/models/role.model';
import { PermissionModel } from '../src/models/permission.model';
import { UserModel } from '../src/models/user.model';
import { OrderModel } from '../src/models/order.model';

describe('Dashboard Controller Integration Tests', () => {
    const app = createApp();
    let mongo: MongoMemoryServer;
    let adminCookie: any;
    let clientId: mongoose.Types.ObjectId;

    beforeAll(async () => {
        mongo = await MongoMemoryServer.create();
        await mongoose.connect(mongo.getUri());

        const viewPerm = await PermissionModel.create({ module: 'dashboard', action: 'view' } as any);
        const role = await RoleModel.create({ 
            name: 'Admin', 
            description: 'Admin', 
            permissions: [viewPerm._id] 
        });
        
        const password = 'AdminPassword123!';
        await UserModel.create({
            name: 'AdminUser',
            email: 'admin_dash@test.com',
            password: await hash(password, 10),
            role: role._id,
        });

        const clientRole = await RoleModel.create({ name: 'Client' });
        const client = await UserModel.create({
            name: 'ClientUser',
            email: 'client_dash@test.com',
            password: await hash(password, 10),
            role: clientRole._id,
        });
        clientId = client._id;

        const loginRes = await request(app)
            .post('/api/auth/login')
            .send({ email: 'admin_dash@test.com', password });
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

    describe('GET /api/dashboard', () => {
        it('should get dashboard data summary', async () => {
            await OrderModel.create({
                user: clientId,
                startedAt: new Date(),
                items: [{ tipo: 'producto', id_producto: new mongoose.Types.ObjectId(), valor: 100, cantidad: 1 }],
                payments: [{ amount: 100, status: 'aprobado', method: 'cash', paidAt: new Date() }]
            } as any);

            const res = await request(app)
                .get('/api/dashboard')
                .set('Cookie', adminCookie);

            expect(res.status).toBe(200);
            expect(res.body.ok).toBe(true);
            expect(res.body.summary).toBeDefined();
            expect(res.body.summary.totalRevenue).toBe(100);
            expect(res.body.summary.totalSales).toBe(1);
        });

        it('should calculate data based on date ranges', async () => {
            const yesterday = new Date();
            yesterday.setDate(yesterday.getDate() - 1);

            await OrderModel.create({
                user: clientId,
                startedAt: yesterday,
                items: [{ tipo: 'servicio', id_servicio: new mongoose.Types.ObjectId(), valor: 50, cantidad: 1 }],
                payments: [{ amount: 50, status: 'aprobado', method: 'card', paidAt: yesterday }]
            } as any);

            const res = await request(app)
                .get('/api/dashboard?period=month')
                .set('Cookie', adminCookie);

            expect(res.status).toBe(200);
            expect(res.body.ok).toBe(true);
        });
    });
});
