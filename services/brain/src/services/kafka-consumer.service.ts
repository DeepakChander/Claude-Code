import { Consumer, EachMessagePayload } from 'kafkajs';
import {
  getKafkaClient,
  kafkaConfig,
  KafkaRequestMessage,
  createSuccessResponseMessage,
  createErrorResponseMessage,
  isKafkaConfigured,
} from '../config/kafka';
import { executeClaudePrompt } from './agent-cli.service';
import pendingResponseRepository from '../repositories/pending-response.repository';
import conversationRepository from '../repositories/conversation.repository';
import messageRepository from '../repositories/message.repository';
import kafkaProducer from './kafka-producer.service';
import logger from '../utils/logger';

let consumer: Consumer | null = null;
let isRunning = false;

/**
 * Initialize and start the Kafka consumer
 */
export const start = async (): Promise<void> => {
  if (!isKafkaConfigured()) {
    logger.warn('Kafka is not configured. Consumer will not start.');
    return;
  }

  if (isRunning && consumer) {
    logger.info('Kafka consumer already running');
    return;
  }

  try {
    const kafka = getKafkaClient();
    consumer = kafka.consumer({
      groupId: kafkaConfig.consumer.groupId,
      sessionTimeout: kafkaConfig.consumer.sessionTimeout,
      heartbeatInterval: kafkaConfig.consumer.heartbeatInterval,
    });

    await consumer.connect();
    logger.info('Kafka consumer connected');

    // Subscribe to request topic
    await consumer.subscribe({
      topic: kafkaConfig.topics.requests,
      fromBeginning: false,
    });

    // Start consuming
    await consumer.run({
      eachMessage: handleMessage,
    });

    isRunning = true;
    logger.info('Kafka consumer started', { topic: kafkaConfig.topics.requests });

    // Handle disconnection
    consumer.on('consumer.disconnect', () => {
      isRunning = false;
      logger.warn('Kafka consumer disconnected');
    });

    // Handle crash
    consumer.on('consumer.crash', ({ payload }) => {
      isRunning = false;
      logger.error('Kafka consumer crashed', { error: payload.error });
    });
  } catch (error) {
    logger.error('Failed to start Kafka consumer', { error });
    throw error;
  }
};

/**
 * Stop the Kafka consumer
 */
export const stop = async (): Promise<void> => {
  if (consumer && isRunning) {
    try {
      await consumer.stop();
      await consumer.disconnect();
      isRunning = false;
      consumer = null;
      logger.info('Kafka consumer stopped');
    } catch (error) {
      logger.error('Failed to stop Kafka consumer', { error });
      throw error;
    }
  }
};

/**
 * Handle incoming message
 */
const handleMessage = async ({ topic, partition, message }: EachMessagePayload): Promise<void> => {
  const startTime = Date.now();

  if (!message.value) {
    logger.warn('Received empty message', { topic, partition });
    return;
  }

  let request: KafkaRequestMessage;
  try {
    request = JSON.parse(message.value.toString());
  } catch (error) {
    logger.error('Failed to parse message', { topic, partition, error });
    return;
  }

  const { correlationId, userId, conversationId, prompt } = request;
  logger.info('Processing request', { correlationId, userId, conversationId });

  try {
    // Mark as processing in database
    await pendingResponseRepository.markAsProcessing(correlationId);

    // Execute Claude prompt
    const result = await executeClaudePrompt(prompt, {
      model: request.model,
      workingDirectory: request.workspacePath,
      resume: request.sessionId,
      continue: request.continueConversation,
    });

    // Extract response content and metadata
    const responseContent = typeof result === 'string' ? result : (result as { content?: string }).content || '';
    const sessionId = typeof result === 'object' ? (result as { sessionId?: string }).sessionId : undefined;
    const tokensInput = typeof result === 'object' ? (result as { tokensInput?: number }).tokensInput || 0 : 0;
    const tokensOutput = typeof result === 'object' ? (result as { tokensOutput?: number }).tokensOutput || 0 : 0;

    // Update session ID in conversation if changed
    if (sessionId) {
      await conversationRepository.updateSessionId(conversationId, sessionId);
    }

    // Store assistant message
    await messageRepository.createAssistantMessage(conversationId, responseContent, {
      tokensInput,
      tokensOutput,
      model: request.model,
      correlationId,
    });

    // Update conversation token usage
    await conversationRepository.updateTokenUsage(
      conversationId,
      tokensInput,
      tokensOutput,
      calculateCost(tokensInput, tokensOutput, request.model)
    );

    // Mark as completed
    await pendingResponseRepository.markAsCompleted(correlationId, {
      content: responseContent,
      tokensInput,
      tokensOutput,
      sessionId,
    });

    // Send response to response topic
    const responseMessage = createSuccessResponseMessage(
      correlationId,
      userId,
      conversationId,
      {
        content: responseContent,
        tokensInput,
        tokensOutput,
        sessionId,
      }
    );

    await kafkaProducer.send(kafkaConfig.topics.responses, responseMessage, correlationId);

    const duration = Date.now() - startTime;
    logger.info('Request processed successfully', { correlationId, duration });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to process request', { correlationId, error: errorMessage });

    // Mark as failed
    await pendingResponseRepository.markAsFailed(correlationId, errorMessage);

    // Send error response
    const errorResponse = createErrorResponseMessage(
      correlationId,
      userId,
      conversationId,
      errorMessage
    );

    try {
      await kafkaProducer.send(kafkaConfig.topics.responses, errorResponse, correlationId);
    } catch (sendError) {
      logger.error('Failed to send error response', { correlationId, sendError });
    }
  }
};

/**
 * Calculate cost based on model and tokens
 */
const calculateCost = (tokensInput: number, tokensOutput: number, model: string): number => {
  // Pricing per million tokens (approximate for OpenRouter)
  const pricing: Record<string, { input: number; output: number }> = {
    'anthropic/claude-opus-4.1': { input: 15.0, output: 75.0 },
    'anthropic/claude-sonnet-4.5': { input: 3.0, output: 15.0 },
    'anthropic/claude-sonnet-4': { input: 3.0, output: 15.0 },
    'anthropic/claude-haiku-4.5': { input: 0.25, output: 1.25 },
  };

  const modelPricing = pricing[model] || pricing['anthropic/claude-sonnet-4'];
  const inputCost = (tokensInput / 1_000_000) * modelPricing.input;
  const outputCost = (tokensOutput / 1_000_000) * modelPricing.output;

  return inputCost + outputCost;
};

/**
 * Check if consumer is running
 */
export const isConsumerRunning = (): boolean => {
  return isRunning && consumer !== null;
};

/**
 * Get consumer instance (for advanced usage)
 */
export const getConsumer = (): Consumer | null => {
  return consumer;
};

export default {
  start,
  stop,
  isRunning: isConsumerRunning,
  getConsumer,
};
