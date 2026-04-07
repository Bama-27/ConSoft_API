import request from 'supertest';
import { createApp } from '../src/app';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { hash } from 'bcrypt';
import { RoleModel } from '../src/models/role.model';
import { PermissionModel } from '../src/models/permission.model';
import { UserModel } from '../src/models/user.model';

describe('Role Controller Integration Tests', () => {
    const app = createApp();
    let mongo: MongoMemoryServer;
    let adminCookie: any;

    beforeAll(async () => {
        mongo = await MongoMemoryServer.create();
        await mongoose.connect(mongo.getUri());

        const createPerm = await PermissionModel.create({ module: 'roles', action: 'create' } as any);
        const updatePerm = await PermissionModel.create({ module: 'roles', action: 'update' } as any);
        const deletePerm = await PermissionModel.create({ module: 'roles', action: 'delete' } as any);
        const viewPerm = await PermissionModel.create({ module: 'roles', action: 'view' } as any);

        const role = await RoleModel.create({ 
            name: 'SuperAdmin', 
            description: 'Can do everything', 
            permissions: [createPerm._id, updatePerm._id, deletePerm._id, viewPerm._id] 
        });
        
        const password = 'SuperPassword123!';
        await UserModel.create({
            name: 'SuperUser',
            email: 'admin_role@test.com',
            password: await hash(password, 10),
            role: role._id,
        });

        const loginRes = await request(app)
            .post('/api/auth/login')
            .send({ email: 'admin_role@test.com', password });
        adminCookie = loginRes.headers['set-cookie'];
    });

    afterAll(async () => {
        await mongoose.connection.dropDatabase();
        await mongoose.connection.close();
        await mongo.stop();
    });

    describe('POST /api/roles', () => {
        it('should create a new role', async () => {
            const res = await request(app)
                .post('/api/roles')
                .set('Cookie', adminCookie)
                .send({ name: 'Manager', description: 'Just a manager' });

            expect(res.status).toBe(201);
            expect(res.body.name).toBe('Manager');
        });

        it('should return 401 if not authenticated', async () => {
            const res = await request(app)
                .post('/api/roles')
                .send({ name: 'Guest' });

            expect(res.status).toBe(401);
        });

        it('should return 400 if name is missing', async () => {
            const res = await request(app)
                .post('/api/roles')
                .set('Cookie', adminCookie)
                .send({ description: 'No name' });

            expect(res.status).toBe(400);
        });
    });

    describe('GET /api/roles', () => {
        it('should list roles', async () => {
            await RoleModel.create({ name: 'Role1' });
            await RoleModel.create({ name: 'Role2' });

            const res = await request(app)
                .get('/api/roles')
                .set('Cookie', adminCookie);

            expect(res.status).toBe(200);
            expect(res.body.ok).toBe(true);
            expect(res.body.roles).toBeDefined();
            // Should contain SuperAdmin, Manager, Role1, Role2
            expect(res.body.roles.length).toBeGreaterThanOrEqual(2);
        });
    });

    describe('GET /api/roles/:id', () => {
        it('should get a single role by id', async () => {
            const role = await RoleModel.create({ name: 'RoleToGet' });

            const res = await request(app)
                .get(`/api/roles/${role._id}`)
                .set('Cookie', adminCookie);

            expect(res.status).toBe(200);
            expect(res.body.ok).toBe(true);
            expect(res.body.data.name).toBe('RoleToGet');
        });
    });

    describe('PUT /api/roles/:id', () => {
        it('should update an existing role', async () => {
            const role = await RoleModel.create({ name: 'OldRoleName' });

            const res = await request(app)
                .put(`/api/roles/${role._id}`)
                .set('Cookie', adminCookie)
                .send({ name: 'NewRoleName' });

            expect(res.status).toBe(200);
            expect(res.body.ok).toBe(true);
            expect(res.body.data.name).toBe('NewRoleName');
        });
    });

    describe('DELETE /api/roles/:id', () => {
        it('should delete a role if no users are associated', async () => {
            const role = await RoleModel.create({ name: 'RoleToDelete' });

            const deleteRes = await request(app)
                .delete(`/api/roles/${role._id}`)
                .set('Cookie', adminCookie);

            expect(deleteRes.status).toBe(204);
        });

        it('should not delete a role if users are associated', async () => {
            const roleForUser = await RoleModel.create({ name: 'RoleWithUser' });
            await UserModel.create({
                name: 'TestUser',
                email: 'test_user_role@test.com',
                password: 'password123',
                role: roleForUser._id,
            });

            const deleteRes = await request(app)
                .delete(`/api/roles/${roleForUser._id}`)
                .set('Cookie', adminCookie);

            expect(deleteRes.status).toBe(400);
            expect(deleteRes.body.message).toMatch(/tiene usuarios asociados/);
        });
    });
});
