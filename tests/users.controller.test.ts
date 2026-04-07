import request from 'supertest';
import { createApp } from '../src/app';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { hash } from 'bcrypt';
import { RoleModel } from '../src/models/role.model';
import { PermissionModel } from '../src/models/permission.model';
import { UserModel } from '../src/models/user.model';

describe('User Controller Integration Tests', () => {
    const app = createApp();
    let mongo: MongoMemoryServer;
    let adminCookie: any;
    let userCookie: any;
    let userAlphaId: mongoose.Types.ObjectId;

    beforeAll(async () => {
        mongo = await MongoMemoryServer.create();
        await mongoose.connect(mongo.getUri());

        const viewPerm = await PermissionModel.create({ module: 'users', action: 'view' } as any);
        const updatePerm = await PermissionModel.create({ module: 'users', action: 'update' } as any);
        
        const adminRole = await RoleModel.create({ 
            name: 'Admin', 
            description: 'Admin', 
            permissions: [viewPerm._id, updatePerm._id] 
        });
        const clientRole = await RoleModel.findByIdAndUpdate(
            new mongoose.Types.ObjectId('693784c6753b94da92239f4f'), // The hardcoded ID in user controller register
            { name: 'Client' },
            { upsert: true, new: true }
        );
        
        const password = 'AdminPassword123!';
        await UserModel.create({
            name: 'AdminUser',
            email: 'admin_usr@test.com',
            password: await hash(password, 10),
            role: adminRole._id,
        });

        const userAlpha = await UserModel.create({
            name: 'User Alpha',
            email: 'alpha_usr@test.com',
            password: await hash(password, 10),
            role: clientRole._id,
        });
        userAlphaId = userAlpha._id;

        const loginAdmin = await request(app)
            .post('/api/auth/login')
            .send({ email: 'admin_usr@test.com', password });
        adminCookie = loginAdmin.headers['set-cookie'];

        const loginUser = await request(app)
            .post('/api/auth/login')
            .send({ email: 'alpha_usr@test.com', password });
        userCookie = loginUser.headers['set-cookie'];
    });

    afterAll(async () => {
        await mongoose.connection.dropDatabase();
        await mongoose.connection.close();
        await mongo.stop();
    });

    describe('GET /api/users/me', () => {
        it('should get current user profile', async () => {
            const res = await request(app)
                .get('/api/users/me')
                .set('Cookie', userCookie);

            expect(res.status).toBe(200);
            expect(res.body.ok).toBe(true);
            expect(res.body.user.name).toBe('User Alpha');
        });
    });

    describe('PUT /api/users/me', () => {
        it('should update current user profile', async () => {
            const res = await request(app)
                .put('/api/users/me')
                .set('Cookie', userCookie)
                .send({ phone: '123456789' });

            expect(res.status).toBe(200);
            expect(res.body.ok).toBe(true);
            expect(res.body.user.phone).toBe('123456789');
        });
    });

    describe('GET /api/users', () => {
        it('should list all users for admin', async () => {
            const res = await request(app)
                .get('/api/users')
                .set('Cookie', adminCookie);

            expect(res.status).toBe(200);
            expect(res.body.ok).toBe(true);
            expect(res.body.users.length).toBeGreaterThanOrEqual(2);
        });
    });

    describe('POST /api/users (Register from public)', () => {
        it('should register a new user publicly', async () => {
            const res = await request(app)
                .post('/api/users')
                .send({ name: 'Newbie', email: 'newbie@test.com', password: 'NewPassword123!' });

            expect(res.status).toBe(200);
            expect(res.body.message).toBe('User registered successfully');
        });
    });

    describe('PUT /api/users/:id', () => {
        it('should update user by admin', async () => {
            const res = await request(app)
                .put(`/api/users/${userAlphaId}`)
                .set('Cookie', adminCookie)
                .send({ name: 'User Alpha Modified' });

            expect(res.status).toBe(200);
            expect(res.body.name).toBe('User Alpha Modified');
        });
    });
});
