import { Consumer, EachMessagePayload } from 'kafkajs';
import { Response } from 'express';
import { EventEmitter } from 'events';
import {
  getKafkaClient,
  kafkaConfig,
  KafkaResponseMessage,
  isKafkaConfigured,
} from '../config/kafka';
import pendingResponseRepository from '../repositories/pending-response.repository';
import logger from '../utils/logger';

// Event emitter for SSE clients
const responseEmitter = new EventEmitter();
responseEmitter.setMaxListeners(1000); // Support many concurrent users

// Map to track SSE connections by user and correlation
const sseConnections = new Map<string, Set<Response>>();
const correlationConnections = new Map<string, Response>();

let consumer: Consumer | null = null;
let isRunning = false;

/**
 * Start response handler consumer
 */
export const start = async (): Promise<void> => {
  if (!isKafkaConfigured()) {
    logger.warn('Kafka is not configured. Response handler will not start.');
    return;
  }

  if (isRunning && consumer) {
    logger.info('Response handler already running');
    return;
  }

  try {
    const kafka = getKafkaClient();
    consumer = kafka.consumer({
      groupId: `${kafkaConfig.consumer.groupId}-responses`,
      sessionTimeout: kafkaConfig.consumer.sessionTimeout,
      heartbeatInterval: kafkaConfig.consumer.heartbeatInterval,
    });

    await consumer.connect();
    logger.info('Response handler connected');

    await consumer.subscribe({
      topic: kafkaConfig.topics.responses,
      fromBeginning: false,
    });

    await consumer.run({
      eachMessage: handleResponseMessage,
    });

    isRunning = true;
    logger.info('Response handler started', { topic: kafkaConfig.topics.responses });
  } catch (error) {
    logger.error('Failed to start response handler', { error });
    throw error;
  }
};

/**
 * Stop response handler
 */
export const stop = async (): Promise<void> => {
  if (consumer && isRunning) {
    try {
      await consumer.stop();
      await consumer.disconnect();
      isRunning = false;
      consumer = null;
      logger.info('Response handler stopped');
    } catch (error) {
      logger.error('Failed to stop response handler', { error });
      throw error;
    }
  }
};

/**
 * Handle response message from Kafka
 */
const handleResponseMessage = async ({ message }: EachMessagePayload): Promise<void> => {
  if (!message.value) {
    return;
  }

  let response: KafkaResponseMessage;
  try {
    response = JSON.parse(message.value.toString());
  } catch (error) {
    logger.error('Failed to parse response message', { error });
    return;
  }

  const { correlationId, userId, status } = response;
  logger.debug('Received response', { correlationId, userId, status });

  // Try to deliver via SSE to specific correlation
  const correlationConn = correlationConnections.get(correlationId);
  if (correlationConn && !correlationConn.writableEnded) {
    try {
      sendSSEEvent(correlationConn, 'response', response);
      correlationConnections.delete(correlationId);

      // Mark as delivered
      await pendingResponseRepository.markAsDelivered(correlationId);
      logger.info('Response delivered via SSE', { correlationId });
      return;
    } catch (error) {
      logger.warn('Failed to deliver via correlation SSE', { correlationId, error });
    }
  }

  // Try to deliver to user's SSE connections
  const userConnections = sseConnections.get(userId);
  if (userConnections && userConnections.size > 0) {
    let delivered = false;
    for (const conn of userConnections) {
      if (!conn.writableEnded) {
        try {
          sendSSEEvent(conn, 'response', response);
          delivered = true;
        } catch (error) {
          userConnections.delete(conn);
        }
      } else {
        userConnections.delete(conn);
      }
    }

    if (delivered) {
      await pendingResponseRepository.markAsDelivered(correlationId);
      logger.info('Response delivered via user SSE', { correlationId, userId });
      return;
    }
  }

  // Emit event for any listeners
  responseEmitter.emit(`response:${correlationId}`, response);
  responseEmitter.emit(`user:${userId}`, response);

  logger.debug('Response stored for later retrieval', { correlationId, userId });
};

/**
 * Send SSE event to client
 */
const sendSSEEvent = (res: Response, event: string, data: object): void => {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
};

/**
 * Register SSE connection for a user
 */
export const registerUserSSE = (userId: string, res: Response): void => {
  if (!sseConnections.has(userId)) {
    sseConnections.set(userId, new Set());
  }
  sseConnections.get(userId)!.add(res);

  // Setup SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  // Send initial connection event
  sendSSEEvent(res, 'connected', { userId, timestamp: new Date().toISOString() });

  // Handle disconnect
  res.on('close', () => {
    const connections = sseConnections.get(userId);
    if (connections) {
      connections.delete(res);
      if (connections.size === 0) {
        sseConnections.delete(userId);
      }
    }
    logger.debug('User SSE disconnected', { userId });
  });

  logger.debug('User SSE registered', { userId });
};

/**
 * Register SSE connection for a specific correlation ID
 */
export const registerCorrelationSSE = (correlationId: string, res: Response): void => {
  correlationConnections.set(correlationId, res);

  // Setup SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  // Send initial event
  sendSSEEvent(res, 'connected', { correlationId, timestamp: new Date().toISOString() });

  // Handle disconnect
  res.on('close', () => {
    correlationConnections.delete(correlationId);
    logger.debug('Correlation SSE disconnected', { correlationId });
  });

  logger.debug('Correlation SSE registered', { correlationId });
};

/**
 * Wait for a specific response (polling fallback)
 */
export const waitForResponse = (
  correlationId: string,
  timeout: number = 60000
): Promise<KafkaResponseMessage | null> => {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      responseEmitter.removeAllListeners(`response:${correlationId}`);
      resolve(null);
    }, timeout);

    responseEmitter.once(`response:${correlationId}`, (response: KafkaResponseMessage) => {
      clearTimeout(timer);
      resolve(response);
    });
  });
};

/**
 * Get active SSE connection count
 */
export const getConnectionCounts = (): { users: number; correlations: number; total: number } => {
  let total = correlationConnections.size;
  for (const connections of sseConnections.values()) {
    total += connections.size;
  }

  return {
    users: sseConnections.size,
    correlations: correlationConnections.size,
    total,
  };
};

/**
 * Check if handler is running
 */
export const isHandlerRunning = (): boolean => {
  return isRunning;
};

export default {
  start,
  stop,
  registerUserSSE,
  registerCorrelationSSE,
  waitForResponse,
  getConnectionCounts,
  isRunning: isHandlerRunning,
};
