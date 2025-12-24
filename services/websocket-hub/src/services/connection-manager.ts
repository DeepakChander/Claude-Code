import { v4 as uuidv4 } from 'uuid';
import { AuthenticatedSocket, WSMessage, MessageType } from '../types';
import logger from '../utils/logger';

class ConnectionManager {
  private connections: Map<string, Set<AuthenticatedSocket>> = new Map();
  private sessionToUser: Map<string, string> = new Map();

  // Add a new connection
  addConnection(socket: AuthenticatedSocket): void {
    const { userId, sessionId } = socket;

    if (!this.connections.has(userId)) {
      this.connections.set(userId, new Set());
    }

    this.connections.get(userId)!.add(socket);
    this.sessionToUser.set(sessionId, userId);

    logger.info('Connection added', {
      userId,
      sessionId,
      totalConnections: this.getConnectionCount(userId),
    });
  }

  // Remove a connection
  removeConnection(socket: AuthenticatedSocket): void {
    const { userId, sessionId } = socket;

    const userConnections = this.connections.get(userId);
    if (userConnections) {
      userConnections.delete(socket);

      if (userConnections.size === 0) {
        this.connections.delete(userId);
      }
    }

    this.sessionToUser.delete(sessionId);

    logger.info('Connection removed', {
      userId,
      sessionId,
      remainingConnections: this.getConnectionCount(userId),
    });
  }

  // Get all connections for a user
  getConnections(userId: string): Set<AuthenticatedSocket> {
    return this.connections.get(userId) || new Set();
  }

  // Get connection by session ID
  getConnectionBySession(sessionId: string): AuthenticatedSocket | undefined {
    const userId = this.sessionToUser.get(sessionId);
    if (!userId) return undefined;

    const userConnections = this.connections.get(userId);
    if (!userConnections) return undefined;

    for (const socket of userConnections) {
      if (socket.sessionId === sessionId) {
        return socket;
      }
    }

    return undefined;
  }

  // Get connection count for a user
  getConnectionCount(userId: string): number {
    return this.connections.get(userId)?.size || 0;
  }

  // Get total connection count
  getTotalConnectionCount(): number {
    let total = 0;
    for (const connections of this.connections.values()) {
      total += connections.size;
    }
    return total;
  }

  // Send message to a specific user (all their connections)
  sendToUser(userId: string, message: WSMessage): void {
    const connections = this.getConnections(userId);

    for (const socket of connections) {
      this.sendToSocket(socket, message);
    }
  }

  // Send message to a specific session
  sendToSession(sessionId: string, message: WSMessage): void {
    const socket = this.getConnectionBySession(sessionId);
    if (socket) {
      this.sendToSocket(socket, message);
    }
  }

  // Send message to a socket
  sendToSocket(socket: AuthenticatedSocket, message: WSMessage): void {
    if (socket.readyState === socket.OPEN) {
      socket.send(JSON.stringify(message));
    }
  }

  // Broadcast to all connections
  broadcast(message: WSMessage, excludeUserId?: string): void {
    for (const [userId, connections] of this.connections) {
      if (userId !== excludeUserId) {
        for (const socket of connections) {
          this.sendToSocket(socket, message);
        }
      }
    }
  }

  // Create a new message
  createMessage(
    type: MessageType,
    userId: string,
    sessionId: string,
    payload: unknown,
    correlationId?: string
  ): WSMessage {
    return {
      type,
      userId,
      sessionId,
      payload,
      timestamp: Date.now(),
      messageId: uuidv4(),
      correlationId,
    };
  }

  // Cleanup dead connections
  cleanupDeadConnections(): void {
    for (const [userId, connections] of this.connections) {
      for (const socket of connections) {
        if (!socket.isAlive) {
          logger.warn('Terminating dead connection', { userId, sessionId: socket.sessionId });
          socket.terminate();
          this.removeConnection(socket);
        } else {
          socket.isAlive = false;
          socket.ping();
        }
      }
    }
  }

  // Get stats
  getStats(): { totalConnections: number; uniqueUsers: number } {
    return {
      totalConnections: this.getTotalConnectionCount(),
      uniqueUsers: this.connections.size,
    };
  }
}

export const connectionManager = new ConnectionManager();
