import request from 'supertest';
import { createApp } from '../src/app';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { hash } from 'bcrypt';
import { RoleModel } from '../src/models/role.model';
import { PermissionModel } from '../src/models/permission.model';
import { UserModel } from '../src/models/user.model';
import { OrderModel } from '../src/models/order.model';

describe('Sales Controller Integration Tests', () => {
    const app = createApp();
    let mongo: MongoMemoryServer;
    let adminCookie: any;
    let clientId: mongoose.Types.ObjectId;

    beforeAll(async () => {
        mongo = await MongoMemoryServer.create();
        await mongoose.connect(mongo.getUri());

        const viewPerm = await PermissionModel.create({ module: 'sales', action: 'view' } as any);
        const role = await RoleModel.create({ 
            name: 'Admin', 
            description: 'Admin', 
            permissions: [viewPerm._id] 
        });
        
        const password = 'AdminPassword123!';
        await UserModel.create({
            name: 'AdminUser',
            email: 'admin_sales@test.com',
            password: await hash(password, 10),
            role: role._id,
        });

        const clientRole = await RoleModel.create({ name: 'Client' });
        const client = await UserModel.create({
            name: 'ClientUser',
            email: 'client@test.com',
            password: await hash(password, 10),
            role: clientRole._id,
        });
        clientId = client._id;

        const loginRes = await request(app)
            .post('/api/auth/login')
            .send({ email: 'admin_sales@test.com', password });
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

    describe('GET /api/sales', () => {
        it('should list completely paid orders as sales', async () => {
            // Note: Sale Controller considers sales as orders where paid >= total amount
            // Let's create an order with paid >= total
            await OrderModel.create({
                user: clientId,
                items: [{ valor: 100 }], // totalAmount will be 100
                payments: [{ amount: 100, status: 'aprobado', method: 'cash', paidAt: new Date() }] // totalPaid will be 100
            } as any);

            // An incomplete order
            await OrderModel.create({
                user: clientId,
                items: [{ valor: 200 }],
                payments: [{ amount: 50, status: 'aprobado', method: 'cash', paidAt: new Date() }]
            } as any);

            const res = await request(app)
                .get('/api/sales')
                .set('Cookie', adminCookie);

            expect(res.status).toBe(200);
            expect(res.body.ok).toBe(true);
            // Should only return 1 sale (the fully paid one)
            expect(res.body.sales.length).toBe(1);
            expect(res.body.sales[0].total).toBe(100);
            expect(res.body.sales[0].paid).toBe(100);
        });

        it('should return 401 unauthenticated without cookie', async () => {
            const res = await request(app).get('/api/sales');
            expect(res.status).toBe(401);
        });
    });
});
