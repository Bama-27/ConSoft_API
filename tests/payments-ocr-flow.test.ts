import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { OrderModel } from '../src/models/order.model';
import { PaymentController } from '../src/controllers/payment.controller';

jest.mock('../src/utils/ocr', () => ({
	extractTextFromImage: jest.fn(async () => 'TOTAL: $150.00'),
	parseAmountFromText: jest.fn(() => 150),
}));

describe('Payments OCR flow', () => {
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

	function mockRes() {
		const res: any = {};
		res.statusCode = 200;
		res.body = undefined;
		res.status = (code: number) => {
			res.statusCode = code;
			return res;
		};
		res.json = (body: any) => {
			res.body = body;
			return res;
		};
		res.send = (body: any) => {
			res.body = body;
			return res;
		};
		return res;
	}

	it('preview endpoint should NOT create a payment automatically', async () => {
		const order = await OrderModel.create({
			user: new mongoose.Types.ObjectId(),
			status: 'en_proceso',
			startedAt: new Date(),
			items: [{ tipo: 'servicio', id_servicio: new mongoose.Types.ObjectId(), cantidad: 1, valor: 300 }],
			payments: [],
			attachments: [],
		} as any);

		const req: any = {
			params: { id: String(order._id) },
			body: {},
			file: { path: 'fake/receipt.png' },
		};
		const res = mockRes();

		await PaymentController.createFromReceiptOcr(req, res);
		expect(res.statusCode).toBe(200);
		expect(res.body.ok).toBe(true);
		expect(res.body.detectedAmount).toBe(150);
		expect(res.body.current.total).toBe(300);
		expect(res.body.projected.restanteAfter).toBe(150);

		const reloaded = await OrderModel.findById(order._id);
		expect(reloaded?.payments?.length).toBe(0);
	});

	it('submit endpoint should create a pending payment request', async () => {
		const order = await OrderModel.create({
			user: new mongoose.Types.ObjectId(),
			status: 'en_proceso',
			startedAt: new Date(),
			items: [{ tipo: 'servicio', id_servicio: new mongoose.Types.ObjectId(), cantidad: 1, valor: 300 }],
			payments: [],
			attachments: [],
		} as any);

		const req: any = {
			params: { id: String(order._id) },
			body: {
				amount: 150,
				method: 'comprobante',
				receiptUrl: 'fake/receipt.png',
				ocrText: 'TOTAL: $150.00',
			},
		};
		const res = mockRes();

		await PaymentController.submitReceiptOcr(req, res);
		expect(res.statusCode).toBe(201);
		expect(res.body.ok).toBe(true);
		expect(res.body.payment.status).toBe('pendiente');
		expect(res.body.payment.amount).toBe(150);

		const reloaded = await OrderModel.findById(order._id);
		expect(reloaded?.payments?.length).toBe(1);
		expect(String((reloaded as any).payments[0].status)).toBe('pendiente');
	});
});
