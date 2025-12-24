import { v4 as uuidv4 } from 'uuid';
import { AuthenticatedSocket, WSMessage, MessageType, UserRequestPayload, RedisMessage } from '../types';
import { connectionManager } from './connection-manager';
import { publishToBrain, onBrainMessage } from './redis.service';
import logger from '../utils/logger';

class MessageRouter {
  constructor() {
    // Listen for messages from Brain service
    onBrainMessage(this.handleBrainMessage.bind(this));
  }

  // Route incoming message from client
  async routeClientMessage(socket: AuthenticatedSocket, rawMessage: string): Promise<void> {
    let message: WSMessage;

    try {
      message = JSON.parse(rawMessage);
    } catch {
      this.sendError(socket, 'Invalid JSON message');
      return;
    }

    // Validate message structure
    if (!message.type) {
      this.sendError(socket, 'Message type is required');
      return;
    }

    // Enrich message with connection info
    message.userId = socket.userId;
    message.sessionId = socket.sessionId;
    message.timestamp = Date.now();
    message.messageId = message.messageId || uuidv4();

    logger.debug('Routing client message', {
      type: message.type,
      userId: message.userId,
      messageId: message.messageId,
    });

    switch (message.type) {
      case MessageType.USER_REQUEST:
        await this.handleUserRequest(socket, message);
        break;

      case MessageType.PING:
        this.handlePing(socket, message);
        break;

      default:
        this.sendError(socket, `Unknown message type: ${message.type}`);
    }
  }

  // Handle user request - forward to Brain
  private async handleUserRequest(socket: AuthenticatedSocket, message: WSMessage): Promise<void> {
    const payload = message.payload as UserRequestPayload;

    if (!payload?.content) {
      this.sendError(socket, 'Message content is required');
      return;
    }

    // Send typing indicator
    const typingMessage = connectionManager.createMessage(
      MessageType.ASSISTANT_TYPING,
      socket.userId,
      socket.sessionId,
      { typing: true },
      message.messageId
    );
    connectionManager.sendToSocket(socket, typingMessage);

    // Forward to Brain via Redis
    const brainMessage: RedisMessage = {
      type: MessageType.BRAIN_REQUEST,
      userId: socket.userId,
      sessionId: socket.sessionId,
      payload: {
        content: payload.content,
        conversationId: payload.conversationId,
        attachments: payload.attachments,
        metadata: payload.metadata,
      },
      timestamp: Date.now(),
      messageId: message.messageId,
      correlationId: message.messageId,
    };

    try {
      await publishToBrain(brainMessage);
      logger.info('User request forwarded to Brain', {
        userId: socket.userId,
        messageId: message.messageId,
      });
    } catch (error) {
      logger.error('Failed to forward request to Brain', {
        error: (error as Error).message,
        userId: socket.userId,
      });
      this.sendError(socket, 'Failed to process request. Please try again.');
    }
  }

  // Handle ping - respond with pong
  private handlePing(socket: AuthenticatedSocket, message: WSMessage): void {
    const pongMessage = connectionManager.createMessage(
      MessageType.PONG,
      socket.userId,
      socket.sessionId,
      { timestamp: Date.now() },
      message.messageId
    );
    connectionManager.sendToSocket(socket, pongMessage);
  }

  // Handle message from Brain service
  private handleBrainMessage(message: RedisMessage): void {
    logger.debug('Received message from Brain', {
      type: message.type,
      userId: message.userId,
      messageId: message.messageId,
    });

    const wsMessage: WSMessage = {
      type: message.type,
      userId: message.userId,
      sessionId: message.sessionId,
      payload: message.payload,
      timestamp: message.timestamp,
      messageId: message.messageId,
      correlationId: message.correlationId,
    };

    // Route based on message type
    switch (message.type) {
      case MessageType.ASSISTANT_RESPONSE:
      case MessageType.ASSISTANT_CHUNK:
      case MessageType.ASSISTANT_TYPING:
        // Send to specific session
        connectionManager.sendToSession(message.sessionId, wsMessage);
        break;

      case MessageType.TASK_PROGRESS:
      case MessageType.TASK_COMPLETE:
      case MessageType.TASK_ERROR:
        // Send to all user connections
        connectionManager.sendToUser(message.userId, wsMessage);
        break;

      default:
        logger.warn('Unknown message type from Brain', { type: message.type });
    }
  }

  // Send error message to client
  private sendError(socket: AuthenticatedSocket, errorMessage: string): void {
    const errorMsg = connectionManager.createMessage(
      MessageType.ERROR,
      socket.userId,
      socket.sessionId,
      { message: errorMessage }
    );
    connectionManager.sendToSocket(socket, errorMsg);
  }
}

export const messageRouter = new MessageRouter();
