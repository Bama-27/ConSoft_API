import request from 'supertest';
import express from 'express';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { createCrudController } from '../src/controllers/crud.controller';

// Define a simple test model
const TestSchema = new mongoose.Schema({
    name: String,
    description: String,
});
const TestModel = mongoose.model('TestCrud', TestSchema);

const controller = createCrudController(TestModel);

// Build minimal app
const app = express();
app.use(express.json());
app.get('/api/test', controller.list);
app.get('/api/test/:id', controller.get);
app.post('/api/test', controller.create);
app.put('/api/test/:id', controller.update);
app.delete('/api/test/:id', controller.remove);

describe('CRUD Controller Integration Tests', () => {
    let mongo: MongoMemoryServer;

    beforeAll(async () => {
        mongo = await MongoMemoryServer.create();
        await mongoose.connect(mongo.getUri());
    });

    afterAll(async () => {
        await mongoose.connection.dropDatabase();
        await mongoose.connection.close();
        await mongo.stop();
    });

    beforeEach(async () => {
        await TestModel.deleteMany({});
    });

    it('should create an item', async () => {
        const res = await request(app)
            .post('/api/test')
            .send({ name: 'TestName', description: 'TestDesc' });

        expect(res.status).toBe(201);
        expect(res.body.ok).toBe(true);
        expect(res.body.data.name).toBe('TestName');
    });

    it('should list items', async () => {
        await TestModel.create({ name: 'One' });
        await TestModel.create({ name: 'Two' });

        const res = await request(app).get('/api/test');
        expect(res.status).toBe(200);
        expect(res.body.data.length).toBe(2);
        expect(res.body.pagination.total).toBe(2);
    });

    it('should get an item by id', async () => {
        const item = await TestModel.create({ name: 'Target' });
        const res = await request(app).get(`/api/test/${item._id}`);
        expect(res.status).toBe(200);
        expect(res.body.data.name).toBe('Target');
    });

    it('should handle get item not found', async () => {
        const res = await request(app).get(`/api/test/${new mongoose.Types.ObjectId()}`);
        expect(res.status).toBe(404);
    });

    it('should update an item', async () => {
        const item = await TestModel.create({ name: 'Before' });
        const res = await request(app)
            .put(`/api/test/${item._id}`)
            .send({ name: 'After' });

        expect(res.status).toBe(200);
        expect(res.body.data.name).toBe('After');
    });

    it('should handle update item not found', async () => {
        const res = await request(app)
            .put(`/api/test/${new mongoose.Types.ObjectId()}`)
            .send({ name: 'After' });
        expect(res.status).toBe(404);
    });

    it('should delete an item', async () => {
        const item = await TestModel.create({ name: 'ToDelete' });
        const res = await request(app).delete(`/api/test/${item._id}`);
        expect(res.status).toBe(204);

        const check = await TestModel.findById(item._id);
        expect(check).toBeNull();
    });

    it('should handle delete item not found', async () => {
        const res = await request(app).delete(`/api/test/${new mongoose.Types.ObjectId()}`);
        expect(res.status).toBe(404);
    });
});
