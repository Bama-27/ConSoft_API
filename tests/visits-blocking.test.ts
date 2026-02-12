import request from 'supertest';
import { createApp } from '../src/app';
import { setupInMemoryMongo, teardownInMemoryMongo } from './setup-db';
import { hash } from 'bcrypt';
import { RoleModel } from '../src/models/role.model';
import { PermissionModel } from '../src/models/permission.model';
import { UserModel } from '../src/models/user.model';
import { VisitModel } from '../src/models/visit.model';

// Nota: este test valida la regla de bloqueo automático de 2 horas
// (una visita ocupa un bloque de 3 horas desde su hora de inicio).

describe('Visits - time slot blocking', () => {
	const app = createApp();

	beforeAll(async () => {
		await setupInMemoryMongo();
	});

	afterAll(async () => {
		await teardownInMemoryMongo();
	});

	it('prevents booking within the next 2 hours after an existing visit', async () => {
		// Crear rol y usuario para login
		const role = await RoleModel.create({ name: 'Usuario', description: 'User', permissions: [] });
		const password = 'Secret123!';
		await UserModel.create({
			name: 'Client',
			email: 'client@test.com',
			password: await hash(password, 10),
			role: role._id,
		});

		// Crear una visita existente a las 10:00
		await VisitModel.create({
			user: (await UserModel.findOne({ email: 'client@test.com' }).select('_id'))!._id,
			visitDate: new Date('2026-02-10T10:00:00.000Z'),
			address: 'Calle 1',
			status: 'pendiente',
			services: [],
		} as any);

		const login = await request(app)
			.post('/api/auth/login')
			.send({ email: 'client@test.com', password });
		expect(login.status).toBe(200);
		const cookies = login.headers['set-cookie'];
		expect(cookies).toBeDefined();

		// Intento 1: 11:00 (dentro del bloqueo) => 409
		const r1 = await request(app)
			.post('/api/visits/mine')
			.set('Cookie', cookies)
			.send({ visitDate: '2026-02-10T11:00:00.000Z', address: 'Calle 2', status: 'pendiente', services: [] });
		expect(r1.status).toBe(409);

		// Intento 2: 12:00 (aún dentro del bloqueo) => 409
		const r2 = await request(app)
			.post('/api/visits/mine')
			.set('Cookie', cookies)
			.send({ visitDate: '2026-02-10T12:00:00.000Z', address: 'Calle 2', status: 'pendiente', services: [] });
		expect(r2.status).toBe(409);

		// Intento 3: 13:00 (fuera del bloqueo) => 201
		const r3 = await request(app)
			.post('/api/visits/mine')
			.set('Cookie', cookies)
			.send({ visitDate: '2026-02-10T13:00:00.000Z', address: 'Calle 2', status: 'pendiente', services: [] });
		expect(r3.status).toBe(201);
	});
});
