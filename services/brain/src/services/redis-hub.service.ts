// Redis Hub Service
// Listens for messages from WebSocket Hub and responds via Redis pub/sub

import { createClient, RedisClientType } from 'redis';
import { orchestrationService } from './orchestration.service';
import { runSdkSync } from './agent-sdk.service';
import { ensureWorkspace } from './workspace.service';
import logger from '../utils/logger';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

// Redis channels - must match WebSocket Hub
const CHANNELS = {
  WS_TO_BRAIN: 'openanalyst:ws:to-brain',
  BRAIN_TO_WS: 'openanalyst:ws:from-brain',
};

// Message types
enum MessageType {
  BRAIN_REQUEST = 'BRAIN_REQUEST',
  ASSISTANT_RESPONSE = 'ASSISTANT_RESPONSE',
  ASSISTANT_CHUNK = 'ASSISTANT_CHUNK',
  ASSISTANT_TYPING = 'ASSISTANT_TYPING',
  TASK_PROGRESS = 'TASK_PROGRESS',
  TASK_COMPLETE = 'TASK_COMPLETE',
  TASK_ERROR = 'TASK_ERROR',
}

interface RedisMessage {
  type: MessageType;
  userId: string;
  sessionId: string;
  payload: Record<string, unknown>;
  timestamp: number;
  messageId?: string;
  correlationId?: string;
}

// Publisher client
let publisher: RedisClientType | null = null;

// Subscriber client (separate connection required for pub/sub)
let subscriber: RedisClientType | null = null;

/**
 * Initialize Redis connections and start listening
 */
export async function initRedisHub(): Promise<void> {
  try {
    publisher = createClient({ url: REDIS_URL });
    subscriber = createClient({ url: REDIS_URL });

    publisher.on('error', (err: Error) => logger.error('Redis publisher error', { error: err.message }));
    subscriber.on('error', (err: Error) => logger.error('Redis subscriber error', { error: err.message }));

    await publisher.connect();
    logger.info('Redis Hub publisher connected');

    await subscriber.connect();
    logger.info('Redis Hub subscriber connected');

    // Subscribe to messages from WebSocket Hub
    await subscriber.subscribe(CHANNELS.WS_TO_BRAIN, async (message: string) => {
      try {
        const parsed: RedisMessage = JSON.parse(message);
        await handleHubMessage(parsed);
      } catch (error) {
        logger.error('Failed to parse/handle Redis message', {
          error: (error as Error).message,
        });
      }
    });

    logger.info(`Subscribed to channel: ${CHANNELS.WS_TO_BRAIN}`);
    logger.info('Redis Hub service initialized - listening for WebSocket Hub messages');
  } catch (error) {
    logger.error('Failed to initialize Redis Hub', { error: (error as Error).message });
    throw error;
  }
}

/**
 * Handle message from WebSocket Hub
 */
async function handleHubMessage(message: RedisMessage): Promise<void> {
  logger.info('Received message from WebSocket Hub', {
    type: message.type,
    userId: message.userId,
    messageId: message.messageId,
  });

  switch (message.type) {
    case MessageType.BRAIN_REQUEST:
      await handleBrainRequest(message);
      break;

    default:
      logger.warn('Unknown message type from Hub', { type: message.type });
  }
}

/**
 * Handle brain request - route through orchestration service
 */
async function handleBrainRequest(message: RedisMessage): Promise<void> {
  const { userId, sessionId, payload, messageId, correlationId } = message;
  const content = payload.content as string;

  // Send typing indicator
  await publishToHub({
    type: MessageType.ASSISTANT_TYPING,
    userId,
    sessionId,
    payload: { typing: true },
    timestamp: Date.now(),
    messageId: `typing-${messageId}`,
    correlationId,
  });

  try {
    // Route through orchestration service
    const { result, agnoResponse, evalResult } = await orchestrationService.orchestrate({
      userId,
      sessionId,
      prompt: content,
      conversationId: payload.conversationId as string | undefined,
      context: payload.metadata as Record<string, unknown> | undefined,
    });

    logger.info('Orchestration complete for Hub request', {
      routedTo: result.routedTo,
      skill: result.skill,
      userId,
    });

    // Build response
    let responseContent: string;
    let success = true;

    if (result.routedTo === 'agno' && agnoResponse) {
      if (agnoResponse.status === 'completed') {
        responseContent = typeof agnoResponse.result === 'string'
          ? agnoResponse.result
          : JSON.stringify(agnoResponse.result);
      } else {
        success = false;
        responseContent = agnoResponse.error || 'Task failed';
      }
    } else {
      // Call Claude AI for non-Agno routes (CORE skill, theoretical questions, etc.)
      try {
        const projectId = (payload.projectId as string) || 'default';
        const workspacePath = await ensureWorkspace(userId, projectId);

        logger.info('Calling Claude AI for non-Agno request', {
          userId,
          skill: result.skill,
          projectId,
        });

        const sdkResult = await runSdkSync(content, workspacePath, {
          model: 'claude-sonnet-4-20250514',
          systemPrompt: result.skill ? `You are an AI assistant specialized in ${result.skill}. Provide helpful, accurate, and detailed responses.` : undefined,
          maxTurns: 10,
        });

        responseContent = sdkResult.output;

        logger.info('Claude AI response received', {
          userId,
          responseLength: responseContent.length,
        });
      } catch (aiError) {
        logger.error('Failed to get AI response', {
          error: (aiError as Error).message,
          userId,
        });
        success = false;
        responseContent = `Failed to process request: ${(aiError as Error).message}`;
      }
    }

    // Send response
    await publishToHub({
      type: MessageType.ASSISTANT_RESPONSE,
      userId,
      sessionId,
      payload: {
        content: responseContent,
        done: true,
        skill: result.skill,
        routedTo: result.routedTo,
        eval: evalResult ? {
          retryCount: evalResult.retryCount,
          researchApplied: evalResult.researchApplied,
          needsClarification: evalResult.needsClarification,
        } : undefined,
      },
      timestamp: Date.now(),
      messageId: `response-${messageId}`,
      correlationId,
    });

    // Send task complete
    await publishToHub({
      type: MessageType.TASK_COMPLETE,
      userId,
      sessionId,
      payload: {
        success,
        taskId: agnoResponse?.task_id,
        executionTime: agnoResponse?.execution_time_ms,
      },
      timestamp: Date.now(),
      messageId: `complete-${messageId}`,
      correlationId,
    });

  } catch (error) {
    logger.error('Failed to process Hub request', {
      error: (error as Error).message,
      userId,
    });

    // Send error response
    await publishToHub({
      type: MessageType.TASK_ERROR,
      userId,
      sessionId,
      payload: {
        error: (error as Error).message,
      },
      timestamp: Date.now(),
      messageId: `error-${messageId}`,
      correlationId,
    });
  }
}

/**
 * Publish message back to WebSocket Hub
 */
async function publishToHub(message: RedisMessage): Promise<void> {
  if (!publisher) {
    logger.error('Redis publisher not initialized');
    return;
  }

  try {
    await publisher.publish(CHANNELS.BRAIN_TO_WS, JSON.stringify(message));
    logger.debug('Message published to Hub', {
      type: message.type,
      messageId: message.messageId,
    });
  } catch (error) {
    logger.error('Failed to publish to Hub', { error: (error as Error).message });
    throw error;
  }
}

/**
 * Send task progress update to Hub
 */
export async function sendTaskProgress(
  userId: string,
  sessionId: string,
  progress: {
    taskId: string;
    status: string;
    step?: number;
    totalSteps?: number;
    message?: string;
  }
): Promise<void> {
  await publishToHub({
    type: MessageType.TASK_PROGRESS,
    userId,
    sessionId,
    payload: progress,
    timestamp: Date.now(),
    messageId: `progress-${progress.taskId}`,
  });
}

/**
 * Graceful shutdown
 */
export async function closeRedisHub(): Promise<void> {
  if (subscriber) {
    await subscriber.quit();
  }
  if (publisher) {
    await publisher.quit();
  }
  logger.info('Redis Hub connections closed');
}

export { publisher, subscriber, CHANNELS };
