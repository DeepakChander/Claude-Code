import mongoose from 'mongoose';
import { config } from 'dotenv';
import { Conversation, Message } from '../src/models';
import { Project } from '../src/models/project.model';
import logger from '../src/utils/logger';

config();

const clearDatabase = async () => {
    try {
        const mongoUri = process.env.MONGODB_URI;
        if (!mongoUri) {
            throw new Error('MONGODB_URI not defined in environment');
        }

        await mongoose.connect(mongoUri);
        logger.info('Connected to MongoDB for cleanup');

        // Clear Collections
        const conversations = await Conversation.deleteMany({});
        logger.info(`Deleted ${conversations.deletedCount} conversations`);

        const messages = await Message.deleteMany({});
        logger.info(`Deleted ${messages.deletedCount} messages`);

        const projects = await Project.deleteMany({});
        logger.info(`Deleted ${projects.deletedCount} projects`);

        logger.info('Database cleanup complete successfully');
        process.exit(0);
    } catch (error) {
        logger.error('Database cleanup failed', { error });
        process.exit(1);
    }
};

clearDatabase();
