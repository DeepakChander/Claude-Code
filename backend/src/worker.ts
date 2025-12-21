/**
 * Kafka Worker Entry Point
 *
 * This is a standalone worker process that consumes messages from Kafka
 * and processes them using the Claude CLI.
 */

import 'dotenv/config';
import mongoose from 'mongoose';
import kafkaConsumer from './services/kafka-consumer.service';
import kafkaProducer from './services/kafka-producer.service';
import logger from './utils/logger';

const MONGODB_URI = process.env.MONGODB_URI || '';

async function connectMongoDB(): Promise<void> {
  if (!MONGODB_URI) {
    throw new Error('MONGODB_URI environment variable is required');
  }

  try {
    await mongoose.connect(MONGODB_URI);
    logger.info('MongoDB connected for worker');
  } catch (error) {
    logger.error('MongoDB connection failed', { error });
    throw error;
  }
}

async function startWorker(): Promise<void> {
  logger.info('Starting Kafka worker...');

  try {
    // Connect to MongoDB first
    await connectMongoDB();

    // Initialize Kafka producer (for sending responses)
    await kafkaProducer.connect();

    // Start consuming messages
    await kafkaConsumer.start();

    logger.info('Kafka worker started successfully');
  } catch (error) {
    logger.error('Failed to start Kafka worker', { error });
    process.exit(1);
  }
}

async function shutdown(): Promise<void> {
  logger.info('Shutting down Kafka worker...');

  try {
    await kafkaConsumer.stop();
    await kafkaProducer.disconnect();
    await mongoose.disconnect();
    logger.info('Kafka worker stopped gracefully');
    process.exit(0);
  } catch (error) {
    logger.error('Error during shutdown', { error });
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// Handle unhandled rejections
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection', { reason, promise });
});

// Start the worker
startWorker();
