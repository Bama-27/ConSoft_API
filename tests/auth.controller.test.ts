import request from 'supertest';
import { createApp } from '../src/app';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { hash } from 'bcrypt';
import { RoleModel } from '../src/models/role.model';
import { UserModel } from '../src/models/user.model';
import { RefreshTokenModel } from '../src/models/refreshToken.model';
import { env } from '../src/config/env';
import crypto from 'crypto';

describe('Auth Controller Integration Tests', () => {
    const app = createApp();
    let mongo: MongoMemoryServer;

    beforeAll(async () => {
        mongo = await MongoMemoryServer.create();
        await mongoose.connect(mongo.getUri());

        const clientRole = await RoleModel.create({ name: 'Usuario' });
        env.defaultUserRoleId = clientRole._id.toString();
        
        const password = 'UserPassword123!';
        await UserModel.create({
            name: 'TestUser',
            email: 'testauth@test.com',
            password: await hash(password, 10),
            role: clientRole._id,
        });
    });

    afterAll(async () => {
        await mongoose.connection.dropDatabase();
        await mongoose.connection.close();
        await mongo.stop();
    });

    describe('POST /api/auth/login', () => {
        it('should login successfully with correct credentials', async () => {
            const res = await request(app)
                .post('/api/auth/login')
                .send({ email: 'testauth@test.com', password: 'UserPassword123!' });

            expect(res.status).toBe(200);
            expect(res.body.message).toBe('Login successful');
            expect(res.headers['set-cookie']).toBeDefined();
        });

        it('should fail to login with incorrect password', async () => {
            const res = await request(app)
                .post('/api/auth/login')
                .send({ email: 'testauth@test.com', password: 'WrongPassword1!' });

            expect(res.status).toBe(400);
            expect(res.body.message).toBe('Incorrect password, please try again');
        });
    });

    describe('POST /api/auth/register', () => {
        it('should register a new user', async () => {
            const res = await request(app)
                .post('/api/auth/register')
                .send({ name: 'New User', email: 'newauth@test.com', password: 'NewPassword123!' });

            expect(res.status).toBe(201);
            expect(res.body.ok).toBe(true);
        });

        it('should not allow duplicate email registration', async () => {
            const res = await request(app)
                .post('/api/auth/register')
                .send({ name: 'Dup User', email: 'testauth@test.com', password: 'DupPassword123!' });

            expect(res.status).toBe(400);
            expect(res.body.message).toBe('This email is already in use');
        });
    });

    describe('POST /api/auth/logout', () => {
        it('should clear cookies on logout', async () => {
            const res = await request(app).post('/api/auth/logout');
            expect(res.status).toBe(200);
            expect(res.body.message).toBe('Logout successful');
            const cookies = res.headers['set-cookie'];
            if (Array.isArray(cookies)) {
                expect(cookies.some((c: string) => c.includes('token=;'))).toBeTruthy();
            } else if (typeof cookies === 'string') {
                expect(cookies.includes('token=;')).toBeTruthy();
            }
        });
    });
});
