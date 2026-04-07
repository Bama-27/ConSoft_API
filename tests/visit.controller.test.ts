import request from 'supertest';
import { createApp } from '../src/app';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { hash } from 'bcrypt';
import { RoleModel } from '../src/models/role.model';
import { PermissionModel } from '../src/models/permission.model';
import { UserModel } from '../src/models/user.model';
import { VisitModel } from '../src/models/visit.model';

describe('Visit Controller Integration Tests', () => {
    const app = createApp();
    let mongo: MongoMemoryServer;
    let adminCookie: any;
    let clientCookie: any;
    let clientId: mongoose.Types.ObjectId;

    beforeAll(async () => {
        mongo = await MongoMemoryServer.create();
        await mongoose.connect(mongo.getUri());

        const viewPerm = await PermissionModel.create({ module: 'visits', action: 'view' } as any);
        const createPerm = await PermissionModel.create({ module: 'visits', action: 'create' } as any);
        const role = await RoleModel.create({ 
            name: 'Admin', 
            description: 'Admin', 
            permissions: [viewPerm._id, createPerm._id] 
        });
        
        const password = 'AdminPassword123!';
        await UserModel.create({
            name: 'AdminUser',
            email: 'admin_visit@test.com',
            password: await hash(password, 10),
            role: role._id,
        });

        const clientRole = await RoleModel.create({ name: 'Client' });
        const client = await UserModel.create({
            name: 'ClientVisit',
            email: 'client_visit@test.com',
            password: await hash(password, 10),
            role: clientRole._id,
        });
        clientId = client._id;

        const loginAdmin = await request(app)
            .post('/api/auth/login')
            .send({ email: 'admin_visit@test.com', password });
        adminCookie = loginAdmin.headers['set-cookie'];

        const loginClient = await request(app)
            .post('/api/auth/login')
            .send({ email: 'client_visit@test.com', password });
        clientCookie = loginClient.headers['set-cookie'];
    });

    afterAll(async () => {
        await mongoose.connection.dropDatabase();
        await mongoose.connection.close();
        await mongo.stop();
    });

    beforeEach(async () => {
        await VisitModel.deleteMany({});
    });

    describe('GET /api/visits', () => {
        it('should list visits for admin', async () => {
            const nextWeek = new Date();
            nextWeek.setDate(nextWeek.getDate() + 7);
            
            await VisitModel.create({
                user: clientId,
                visitDate: nextWeek,
                address: 'Main St 123',
                status: 'pendiente'
            });

            const res = await request(app)
                .get('/api/visits')
                .set('Cookie', adminCookie);

            expect(res.status).toBe(200);
            expect(res.body.ok).toBe(true);
            expect(res.body.visits.length).toBe(1);
        });
    });

    describe('POST /api/visits/mine', () => {
        it('should create a visit for the authenticated client', async () => {
            const visitDate = new Date();
            visitDate.setDate(visitDate.getDate() + 14);

            const res = await request(app)
                .post('/api/visits/mine')
                .set('Cookie', clientCookie)
                .send({
                    visitDate: visitDate.toISOString(),
                    address: 'Client St 456'
                });

            expect(res.status).toBe(201);
            expect(res.body.ok).toBe(true);
            expect(res.body.visit.address).toBe('Client St 456');
        });

        it('should fail if visit overlaps', async () => {
            const visitDate = new Date();
            visitDate.setDate(visitDate.getDate() + 21);

            await VisitModel.create({
                user: clientId,
                visitDate: visitDate,
                address: 'Main St',
                status: 'pendiente'
            });

            // Try to schedule at the same time
            const res = await request(app)
                .post('/api/visits/mine')
                .set('Cookie', clientCookie)
                .send({
                    visitDate: visitDate.toISOString(),
                    address: 'Other St'
                });

            expect(res.status).toBe(409);
        });
    });

    describe('GET /api/visits/mine', () => {
        it('should list my visits', async () => {
            const date = new Date();
            date.setDate(date.getDate() + 10);

            await VisitModel.create({
                user: clientId,
                visitDate: date,
                address: 'Test Addr',
                status: 'pendiente'
            });

            const res = await request(app)
                .get('/api/visits/mine')
                .set('Cookie', clientCookie);

            expect(res.status).toBe(200);
            expect(res.body.ok).toBe(true);
            expect(res.body.visits.length).toBe(1);
        });
    });

    describe('GET /api/visits/available-slots', () => {
        it('should check available slots', async () => {
            const res = await request(app)
                .get('/api/visits/available-slots?date=2030-01-01');

            expect(res.status).toBe(200);
            expect(res.body.availableSlots).toBeDefined();
            expect(Array.isArray(res.body.availableSlots)).toBe(true);
        });
    });
});
