import request from 'supertest';
import { createApp } from '../src/app';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { hash } from 'bcrypt';
import { RoleModel } from '../src/models/role.model';
import { PermissionModel } from '../src/models/permission.model';
import { UserModel } from '../src/models/user.model';
import { ServiceModel } from '../src/models/service.model';

describe('Service Controller Integration Tests', () => {
    const app = createApp();
    let mongo: MongoMemoryServer;
    let adminCookie: any;

    beforeAll(async () => {
        mongo = await MongoMemoryServer.create();
        await mongoose.connect(mongo.getUri());

        const createPerm = await PermissionModel.create({ module: 'services', action: 'create' } as any);
        const updatePerm = await PermissionModel.create({ module: 'services', action: 'update' } as any);
        const deletePerm = await PermissionModel.create({ module: 'services', action: 'delete' } as any);
        
        const role = await RoleModel.create({ 
            name: 'Admin', 
            description: 'Admin', 
            permissions: [createPerm._id, updatePerm._id, deletePerm._id] 
        });
        
        const password = 'AdminPassword123!';
        await UserModel.create({
            name: 'AdminUser',
            email: 'admin_srv@test.com',
            password: await hash(password, 10),
            role: role._id,
        });

        const loginRes = await request(app)
            .post('/api/auth/login')
            .send({ email: 'admin_srv@test.com', password });
        adminCookie = loginRes.headers['set-cookie'];
    });

    afterAll(async () => {
        await mongoose.connection.dropDatabase();
        await mongoose.connection.close();
        await mongo.stop();
    });

    beforeEach(async () => {
        await ServiceModel.deleteMany({});
    });

    describe('POST /api/services', () => {
        it('should create a new service', async () => {
            const res = await request(app)
                .post('/api/services')
                .set('Cookie', adminCookie)
                .field('name', 'Installation')
                .field('description', 'Home installation');

            expect(res.status).toBe(201);
            expect(res.body.name).toBe('Installation');
        });

        it('should return 400 if name is missing', async () => {
            const res = await request(app)
                .post('/api/services')
                .set('Cookie', adminCookie)
                .send({ description: 'No name' });

            expect(res.status).toBe(400);
        });
    });

    describe('GET /api/services', () => {
        it('should list services publicly', async () => {
            await ServiceModel.create({ name: 'Delivery' });
            await ServiceModel.create({ name: 'Consulting' });

            const res = await request(app).get('/api/services');

            expect(res.status).toBe(200);
            expect(res.body.ok).toBe(true);
            expect(res.body.data.length).toBe(2);
        });
    });

    describe('GET /api/services/:id', () => {
        it('should get a specific service', async () => {
            const service = await ServiceModel.create({ name: 'Maintenance' });

            const res = await request(app).get(`/api/services/${service._id}`);
            expect(res.status).toBe(200);
            expect(res.body.ok).toBe(true);
            expect(res.body.data.name).toBe('Maintenance');
        });
    });

    describe('PUT /api/services/:id', () => {
        it('should update an existing service', async () => {
            const service = await ServiceModel.create({ name: 'OldName' });

            const res = await request(app)
                .put(`/api/services/${service._id}`)
                .set('Cookie', adminCookie)
                .send({ name: 'NewName' });

            expect(res.status).toBe(200);
            expect(res.body.ok).toBe(true);
            expect(res.body.data.name).toBe('NewName');
        });
    });

    describe('DELETE /api/services/:id', () => {
        it('should delete a service', async () => {
            const service = await ServiceModel.create({ name: 'ToDelete' });

            const res = await request(app)
                .delete(`/api/services/${service._id}`)
                .set('Cookie', adminCookie);

            expect(res.status).toBe(204);
        });
    });
});
