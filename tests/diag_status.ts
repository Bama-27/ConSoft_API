import { UserModel } from '../src/models/user.model';
import mongoose from 'mongoose';
import supertest from 'supertest';
import { createApp } from '../src/app';
import { connectToDatabase } from '../src/config/db';

async function test() {
    await connectToDatabase();
    const app = createApp();
    const request = supertest(app);

    // Use a known inactive user from the DB
    const inactiveEmail = 'samuelmorafrancozl@gmail.com';
    const password = 'somepassword'; // won't matter if blocked before password check

    // Verify from DB
    const user = await UserModel.findOne({ email: inactiveEmail }).select('status email name');
    if (!user) {
        console.log('User not found in DB');
        await mongoose.connection.close();
        return;
    }
    console.log('DB user status:', user.status, '| !user.status:', !user.status);

    const loginRes = await request.post('/api/auth/login').send({ email: inactiveEmail, password: 'WrongPass1!' });
    console.log('Login Response Status:', loginRes.status);
    console.log('Login Response Body:', JSON.stringify(loginRes.body));

    if (loginRes.status === 403) {
        console.log('✅ Inactive user was correctly blocked.');
    } else {
        console.log('❌ Inactive user was NOT blocked (status was:', loginRes.status, ')');
    }

    await mongoose.connection.close();
}

test().catch(console.error);
