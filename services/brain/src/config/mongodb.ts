import mongoose from 'mongoose';
import { config } from 'dotenv';

config();

// MongoDB Configuration
export const mongoConfig = {
  uri: process.env.MONGODB_URI || 'mongodb://localhost:27017/openanalyst',
  options: {
    maxPoolSize: 10,
    minPoolSize: 2,
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 45000,
    retryWrites: true,
    w: 'majority' as const,
  },
};

// Connection state tracking
let isConnected = false;

// Connect to MongoDB
export const connectMongoDB = async (): Promise<typeof mongoose> => {
  if (isConnected) {
    console.log('MongoDB already connected');
    return mongoose;
  }

  try {
    const connection = await mongoose.connect(mongoConfig.uri, mongoConfig.options);
    isConnected = true;
    console.log(`MongoDB connected: ${connection.connection.host}`);

    // Handle connection events
    mongoose.connection.on('error', (err) => {
      console.error('MongoDB connection error:', err);
      isConnected = false;
    });

    mongoose.connection.on('disconnected', () => {
      console.warn('MongoDB disconnected');
      isConnected = false;
    });

    mongoose.connection.on('reconnected', () => {
      console.log('MongoDB reconnected');
      isConnected = true;
    });

    return connection;
  } catch (error) {
    console.error('MongoDB connection failed:', error);
    isConnected = false;
    throw error;
  }
};

// Disconnect from MongoDB
export const disconnectMongoDB = async (): Promise<void> => {
  if (!isConnected) {
    return;
  }

  try {
    await mongoose.disconnect();
    isConnected = false;
    console.log('MongoDB disconnected');
  } catch (error) {
    console.error('MongoDB disconnection error:', error);
    throw error;
  }
};

// Check connection status
export const isMongoConnected = (): boolean => {
  return isConnected && mongoose.connection.readyState === 1;
};

// Get connection instance
export const getMongoConnection = (): mongoose.Connection => {
  return mongoose.connection;
};

export default {
  connect: connectMongoDB,
  disconnect: disconnectMongoDB,
  isConnected: isMongoConnected,
  getConnection: getMongoConnection,
};
