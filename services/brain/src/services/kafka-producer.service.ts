import { Producer, ProducerRecord } from 'kafkajs';
import {
  getKafkaClient,
  kafkaConfig,
  createRequestMessage,
  isKafkaConfigured,
} from '../config/kafka';
import logger from '../utils/logger';

let producer: Producer | null = null;
let isConnected = false;

/**
 * Initialize and connect the Kafka producer
 */
export const connect = async (): Promise<void> => {
  if (!isKafkaConfigured()) {
    logger.warn('Kafka is not configured. Producer will not start.');
    return;
  }

  if (isConnected && producer) {
    logger.info('Kafka producer already connected');
    return;
  }

  try {
    const kafka = getKafkaClient();
    producer = kafka.producer({
      allowAutoTopicCreation: false,
      transactionTimeout: 30000,
    });

    await producer.connect();
    isConnected = true;
    logger.info('Kafka producer connected successfully');

    // Handle disconnection
    producer.on('producer.disconnect', () => {
      isConnected = false;
      logger.warn('Kafka producer disconnected');
    });
  } catch (error) {
    logger.error('Failed to connect Kafka producer', { error });
    throw error;
  }
};

/**
 * Disconnect the Kafka producer
 */
export const disconnect = async (): Promise<void> => {
  if (producer && isConnected) {
    try {
      await producer.disconnect();
      isConnected = false;
      producer = null;
      logger.info('Kafka producer disconnected');
    } catch (error) {
      logger.error('Failed to disconnect Kafka producer', { error });
      throw error;
    }
  }
};

/**
 * Send a message to a topic
 */
export const send = async (
  topic: string,
  message: object,
  key?: string
): Promise<void> => {
  if (!producer || !isConnected) {
    throw new Error('Kafka producer is not connected');
  }

  const record: ProducerRecord = {
    topic,
    messages: [
      {
        key: key || undefined,
        value: JSON.stringify(message),
        timestamp: Date.now().toString(),
      },
    ],
  };

  try {
    await producer.send(record);
    logger.debug('Message sent to Kafka', { topic, key });
  } catch (error) {
    logger.error('Failed to send message to Kafka', { topic, error });
    throw error;
  }
};

/**
 * Send an agent request to the request topic
 */
export const sendAgentRequest = async (
  correlationId: string,
  userId: string,
  conversationId: string,
  prompt: string,
  options: {
    sessionId?: string;
    model?: string;
    workspacePath?: string;
    continueConversation?: boolean;
  } = {}
): Promise<void> => {
  const message = createRequestMessage(
    correlationId,
    userId,
    conversationId,
    prompt,
    options
  );

  await send(kafkaConfig.topics.requests, message, correlationId);
  logger.info('Agent request sent to Kafka', { correlationId, userId, conversationId });
};

/**
 * Send batch of messages to a topic
 */
export const sendBatch = async (
  topic: string,
  messages: Array<{ message: object; key?: string }>
): Promise<void> => {
  if (!producer || !isConnected) {
    throw new Error('Kafka producer is not connected');
  }

  const record: ProducerRecord = {
    topic,
    messages: messages.map((m) => ({
      key: m.key || undefined,
      value: JSON.stringify(m.message),
      timestamp: Date.now().toString(),
    })),
  };

  try {
    await producer.send(record);
    logger.debug('Batch messages sent to Kafka', { topic, count: messages.length });
  } catch (error) {
    logger.error('Failed to send batch messages to Kafka', { topic, error });
    throw error;
  }
};

/**
 * Check if producer is connected
 */
export const isProducerConnected = (): boolean => {
  return isConnected && producer !== null;
};

/**
 * Get producer instance (for advanced usage)
 */
export const getProducer = (): Producer | null => {
  return producer;
};

export default {
  connect,
  disconnect,
  send,
  sendAgentRequest,
  sendBatch,
  isConnected: isProducerConnected,
  getProducer,
};
