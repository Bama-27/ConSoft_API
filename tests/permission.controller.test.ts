import request from 'supertest';
import { createApp } from '../src/app';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { hash } from 'bcrypt';
import { RoleModel } from '../src/models/role.model';
import { PermissionModel } from '../src/models/permission.model';
import { UserModel } from '../src/models/user.model';

describe('Permission Controller Integration Tests', () => {
    const app = createApp();
    let mongo: MongoMemoryServer;
    let adminCookie: any;

    beforeAll(async () => {
        mongo = await MongoMemoryServer.create();
        await mongoose.connect(mongo.getUri());

        const createPerm = await PermissionModel.create({ module: 'permissions', action: 'create' } as any);
        const updatePerm = await PermissionModel.create({ module: 'permissions', action: 'update' } as any);
        const deletePerm = await PermissionModel.create({ module: 'permissions', action: 'delete' } as any);
        const viewPerm = await PermissionModel.create({ module: 'permissions', action: 'view' } as any);

        const role = await RoleModel.create({ 
            name: 'Admin', 
            description: 'Admin', 
            permissions: [createPerm._id, updatePerm._id, deletePerm._id, viewPerm._id] 
        });
        
        const password = 'AdminPassword123!';
        await UserModel.create({
            name: 'AdminUser',
            email: 'admin_perm@test.com',
            password: await hash(password, 10),
            role: role._id,
        });

        const loginRes = await request(app)
            .post('/api/auth/login')
            .send({ email: 'admin_perm@test.com', password });
        adminCookie = loginRes.headers['set-cookie'];
    });

    afterAll(async () => {
        await mongoose.connection.dropDatabase();
        await mongoose.connection.close();
        await mongo.stop();
    });

    describe('POST /api/permissions', () => {
        it('should create a new permission', async () => {
            const res = await request(app)
                .post('/api/permissions')
                .set('Cookie', adminCookie)
                .send({ module: 'test_module', action: 'test_action' });

            expect(res.status).toBe(201);
            expect(res.body.module).toBe('test_module');
            expect(res.body.action).toBe('test_action');
        });

        it('should return 401 if not authenticated', async () => {
            const res = await request(app)
                .post('/api/permissions')
                .send({ module: 'test_module', action: 'test_action' });

            expect(res.status).toBe(401);
        });

        it('should return 400 if required fields are missing', async () => {
            const res = await request(app)
                .post('/api/permissions')
                .set('Cookie', adminCookie)
                .send({ action: 'test_action' });

            expect(res.status).toBe(400);
            expect(res.body.message).toBe('module is required');
        });
    });

    describe('GET /api/permissions', () => {
        it('should list permissions aggregated by module', async () => {
            await PermissionModel.create({ module: 'module_a', action: 'read' });
            await PermissionModel.create({ module: 'module_a', action: 'write' });

            const res = await request(app)
                .get('/api/permissions')
                .set('Cookie', adminCookie);

            expect(res.status).toBe(200);
            expect(res.body.ok).toBe(true);
            expect(res.body.permisos).toBeDefined();
            expect(Array.isArray(res.body.permisos)).toBe(true);
        });
    });

    describe('GET /api/permissions/:id', () => {
        it('should get a single permission by id', async () => {
            const perm = await PermissionModel.create({ module: 'food', action: 'eat' });

            const res = await request(app)
                .get(`/api/permissions/${perm._id}`)
                .set('Cookie', adminCookie);

            expect(res.status).toBe(200);
            expect(res.body.ok).toBe(true);
            expect(res.body.data.module).toBe('food');
        });
    });

    describe('PUT /api/permissions/:id', () => {
        it('should update an existing permission', async () => {
            const perm = await PermissionModel.create({ module: 'old_module', action: 'old_action' });

            const res = await request(app)
                .put(`/api/permissions/${perm._id}`)
                .set('Cookie', adminCookie)
                .send({ module: 'new_module' });

            expect(res.status).toBe(200);
            expect(res.body.ok).toBe(true);
            expect(res.body.data.module).toBe('new_module');
        });
    });

    describe('DELETE /api/permissions/:id', () => {
        it('should delete a permission', async () => {
            const perm = await PermissionModel.create({ module: 'to_delete', action: 'delete_action' });

            const deleteRes = await request(app)
                .delete(`/api/permissions/${perm._id}`)
                .set('Cookie', adminCookie);

            expect(deleteRes.status).toBe(204);

            const getRes = await request(app)
                .get(`/api/permissions/${perm._id}`)
                .set('Cookie', adminCookie);
            expect(getRes.status).toBe(404);
        });
    });
});
