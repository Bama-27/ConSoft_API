import request from 'supertest';
import { createApp } from '../src/app';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { hash } from 'bcrypt';
import { UserModel } from '../src/models/user.model';
import { QuotationModel } from '../src/models/quotation.model';
import { ChatMessageModel } from '../src/models/chatMessage.model';
import { DmMessageModel, buildParticipantsPair } from '../src/models/dmMessage.model';

describe('Chat Controller Integration Tests', () => {
    const app = createApp();
    let mongo: MongoMemoryServer;
    let userAlphaCookie: any;
    let userBetaCookie: any;
    let alphaId: mongoose.Types.ObjectId;
    let betaId: mongoose.Types.ObjectId;

    beforeAll(async () => {
        mongo = await MongoMemoryServer.create();
        await mongoose.connect(mongo.getUri());

        const pw = 'TestPassword123!';
        const hashedPw = await hash(pw, 10);

        const dummyRole = await mongoose.model('Role').create({ name: 'User', description: 'User role' });

        const userAlpha = await UserModel.create({
            name: 'User Alpha',
            email: 'alpha@test.com',
            password: hashedPw,
            role: dummyRole._id,
        });
        alphaId = userAlpha._id;

        const userBeta = await UserModel.create({
            name: 'User Beta',
            email: 'beta@test.com',
            password: hashedPw,
            role: dummyRole._id,
        });
        betaId = userBeta._id;

        const login1 = await request(app).post('/api/auth/login').send({ email: 'alpha@test.com', password: pw });
        userAlphaCookie = login1.headers['set-cookie'];

        const login2 = await request(app).post('/api/auth/login').send({ email: 'beta@test.com', password: pw });
        userBetaCookie = login2.headers['set-cookie'];
    });

    afterAll(async () => {
        await mongoose.connection.dropDatabase();
        await mongoose.connection.close();
        await mongo.stop();
    });

    describe('GET /api/quotations/:quotationId/messages', () => {
        it('should return 401 if not authenticated', async () => {
            const res = await request(app).get(`/api/quotations/12345/messages`);
            expect(res.status).toBe(401); // Actually, the route might just fail verification later or return empty, let's see. Wait, in api.ts it's protected by verifyToken maybe? No, let's see if 401 or 404.
        });

        it('should get chat messages of a quotation for the owner', async () => {
            const quotation = await QuotationModel.create({ user: alphaId, status: 'Solicitada', totalEstimate: 100, items: [] });
            await ChatMessageModel.create({
                quotation: quotation._id,
                sender: alphaId,
                message: 'Hello Quotation',
            });

            const res = await request(app)
                .get(`/api/quotations/${quotation._id}/messages`)
                .set('Cookie', userAlphaCookie);

            expect(res.status).toBe(200);
            expect(res.body.ok).toBe(true);
            expect(res.body.messages.length).toBe(1);
            expect(res.body.messages[0].message).toBe('Hello Quotation');
        });

        it('should return 404 for non-existent quotation', async () => {
            const res = await request(app)
                .get(`/api/quotations/${new mongoose.Types.ObjectId()}/messages`)
                .set('Cookie', userAlphaCookie);
                
            expect(res.status).toBe(404);
        });
    });

    describe('GET /api/chat/dm/:userId', () => {
        it('should return direct messages between authenticated user and another user', async () => {
            await DmMessageModel.create({
                participants: buildParticipantsPair(alphaId.toString(), betaId.toString()),
                sender: alphaId,
                message: 'Hello Beta',
            });
            await DmMessageModel.create({
                participants: buildParticipantsPair(alphaId.toString(), betaId.toString()),
                sender: betaId,
                message: 'Hello Alpha',
            });

            const res = await request(app)
                .get(`/api/chat/dm/${betaId}`)
                .set('Cookie', userAlphaCookie);

            expect(res.status).toBe(200);
            expect(res.body.ok).toBe(true);
            expect(res.body.messages.length).toBe(2);
        });

        it('should return 401 if unauthenticated', async () => {
             const res = await request(app).get(`/api/chat/dm/${betaId}`);
             expect(res.status).toBe(401);
        });
    });
});
