

import bcrypt from 'bcrypt';
import * as dotenv from 'dotenv';
import { User, IUser } from '../src/models/user.model';
import { connectMongoDB } from '../src/config/mongodb'; // Adjust path if needed

dotenv.config();

const USERS_DATA = [
    {
        authKey: 'successfulAuth',
        user: {
            userId: "6768c5a2f3e45b0012ac89d1", // from user.id
            email: "ayush@openanalyst.com",
            username: "Ayush Shrivastava", // from user.fullName
            password: "openanalyst123", // Default password
            isActive: true
        }
    },
    {
        authKey: 'newUserAuth',
        user: {
            userId: "6768c6b3f4e45c0013ad90e1",
            email: "newuser@example.com",
            username: "John Doe",
            password: "openanalyst123",
            isActive: true
        }
    },
    {
        authKey: 'businessAccountAuth',
        user: {
            userId: "6768c7c4f5e45d0014ae91f1",
            email: "admin@acmecorp.com",
            username: "Jane Smith",
            password: "openanalyst123",
            isActive: true
        }
    },
    {
        authKey: 'expiredToken',
        user: {
            userId: "6768c8a5f6e45e0015bf92g1",
            email: "expired@user.com",
            username: "Expired User",
            password: "openanalyst123",
            isActive: true
        }
    },
    {
        authKey: 'minimalUserAuth', // Note: JSON key was minimalUserAuth
        user: {
            userId: "6768c9b6f7e45f0016c093h1",
            email: "minimal@user.com",
            username: "Minimal User",
            password: "openanalyst123",
            isActive: true
        }
    }
];

const seedUsers = async () => {
    try {
        console.log('🌱 Starting User Seeding...');

        // Connect DB
        await connectMongoDB();

        const saltRounds = 10;
        const defaultPasswordHash = await bcrypt.hash("openanalyst123", saltRounds);

        for (const item of USERS_DATA) {
            const userData = item.user;

            // Generate hash (realistically we'd use individual salts but this is seed data)
            const passwordHash = defaultPasswordHash;

            const updateData: Partial<IUser> = {
                userId: userData.userId,
                username: userData.username,
                email: userData.email,
                passwordHash: passwordHash,
                isActive: userData.isActive
            };

            await User.findOneAndUpdate(
                { email: userData.email }, // Filter by email
                updateData,
                { upsert: true, new: true, setDefaultsOnInsert: true }
            );

            console.log(`✅ Seeded/Updated User: ${userData.email} (${item.authKey})`);
        }

        console.log('🏁 Seeding Complete!');
        process.exit(0);

    } catch (error) {
        console.error('❌ Seeding Failed:', error);
        process.exit(1);
    }
};

seedUsers();
