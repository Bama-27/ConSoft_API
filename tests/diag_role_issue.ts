import { UserModel } from '../src/models/user.model';
import { RoleModel } from '../src/models/role.model';
import mongoose from 'mongoose';
import { env } from '../src/config/env';
import supertest from 'supertest';
import { createApp } from '../src/app';
import { connectToDatabase } from '../src/config/db';

async function test() {
    await connectToDatabase();
    const app = createApp();
    const request = supertest(app);

    const email = 'test_role@example.com';
    const password = 'Password123!';

    // 1. Clear existing roles and users
    await UserModel.deleteMany({ email });
    // We don't delete all roles to avoid breaking other things, but let's see if the default one exists
    const defaultRoleId = env.defaultUserRoleId;
    const defaultRoleExists = await RoleModel.findById(defaultRoleId);
    console.log('Default role from env exists:', !!defaultRoleExists);

    console.log('--- Testing Registration Role Assignment ---');
    const regRes = await request.post('/api/auth/register').send({ 
        name: 'Test Role',
        email,
        password 
    });

    console.log('Status Register:', regRes.status);
    console.log('Body Register:', regRes.body);

    if (regRes.status === 201) {
        const user = await UserModel.findOne({ email }).populate('role');
        if (user && user.role) {
            console.log('✅ Success: Role assigned to user:', (user.role as any).name || user.role);
        } else {
            console.log('❌ Failure: Role NOT assigned to user.');
        }
    } else {
        console.log('❌ Failure: Registration failed.');
    }

    // Clean up
    await UserModel.deleteMany({ email });
    await mongoose.connection.close();
}

test().catch(console.error);
