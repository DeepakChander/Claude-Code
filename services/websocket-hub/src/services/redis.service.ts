import Redis from 'ioredis';
import logger from '../utils/logger';
import { RedisMessage } from '../types';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

// Publisher client
const publisher = new Redis(REDIS_URL, {
  retryDelayOnFailover: 100,
  maxRetriesPerRequest: 3,
  lazyConnect: true,
});

// Subscriber client (separate connection required for pub/sub)
const subscriber = new Redis(REDIS_URL, {
  retryDelayOnFailover: 100,
  maxRetriesPerRequest: 3,
  lazyConnect: true,
});

// Channels
const CHANNELS = {
  WS_TO_BRAIN: 'openanalyst:ws:to-brain',
  BRAIN_TO_WS: 'openanalyst:ws:from-brain',
  USER_CONTEXT: (userId: string) => `openanalyst:context:${userId}`,
};

type MessageHandler = (message: RedisMessage) => void;
const messageHandlers: MessageHandler[] = [];

// Initialize Redis connections
export async function initRedis(): Promise<void> {
  try {
    await publisher.connect();
    logger.info('Redis publisher connected');

    await subscriber.connect();
    logger.info('Redis subscriber connected');

    // Subscribe to brain responses
    await subscriber.subscribe(CHANNELS.BRAIN_TO_WS);
    logger.info(`Subscribed to channel: ${CHANNELS.BRAIN_TO_WS}`);

    // Handle incoming messages from Brain
    subscriber.on('message', (channel, message) => {
      if (channel === CHANNELS.BRAIN_TO_WS) {
        try {
          const parsed: RedisMessage = JSON.parse(message);
          messageHandlers.forEach(handler => handler(parsed));
        } catch (error) {
          logger.error('Failed to parse Redis message', { error: (error as Error).message });
        }
      }
    });
  } catch (error) {
    logger.error('Failed to connect to Redis', { error: (error as Error).message });
    throw error;
  }
}

// Publish message to Brain service
export async function publishToBrain(message: RedisMessage): Promise<void> {
  try {
    await publisher.publish(CHANNELS.WS_TO_BRAIN, JSON.stringify(message));
    logger.debug('Message published to Brain', { messageId: message.messageId });
  } catch (error) {
    logger.error('Failed to publish to Brain', { error: (error as Error).message });
    throw error;
  }
}

// Register handler for messages from Brain
export function onBrainMessage(handler: MessageHandler): void {
  messageHandlers.push(handler);
}

// Store user context
export async function setUserContext(userId: string, context: Record<string, unknown>): Promise<void> {
  await publisher.set(
    CHANNELS.USER_CONTEXT(userId),
    JSON.stringify(context),
    'EX',
    3600 // 1 hour TTL
  );
}

// Get user context
export async function getUserContext(userId: string): Promise<Record<string, unknown> | null> {
  const data = await publisher.get(CHANNELS.USER_CONTEXT(userId));
  return data ? JSON.parse(data) : null;
}

// Graceful shutdown
export async function closeRedis(): Promise<void> {
  await subscriber.quit();
  await publisher.quit();
  logger.info('Redis connections closed');
}

export { publisher, subscriber, CHANNELS };
