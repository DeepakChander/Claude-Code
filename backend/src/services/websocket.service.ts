import { WebSocket, WebSocketServer } from 'ws';
import { Server } from 'http';
import logger from '../utils/logger';

/**
 * Task Progress Event Types
 */
export interface TaskProgressEvent {
  type: 'todo_created' | 'task_started' | 'task_completed' | 'task_failed' | 'all_complete';
  sessionId: string;
  timestamp: string;
  data: {
    todos?: TodoItem[];
    currentTask?: TodoItem;
    completedTasks?: number;
    totalTasks?: number;
    message?: string;
    error?: string;
  };
}

export interface TodoItem {
  id: string;
  content: string;
  activeForm: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  order: number;
}

interface WebSocketClient {
  ws: WebSocket;
  userId: string;
  sessionId?: string;
  connectedAt: Date;
}

/**
 * WebSocket Service for real-time task progress broadcasting
 * Supports both local CLI connections and future frontend WebSocket URL
 */
class WebSocketService {
  private wss: WebSocketServer | null = null;
  private clients: Map<string, WebSocketClient> = new Map();

  // TODO: Frontend WebSocket URL - to be provided by user later
  // private frontendWsUrl: string | null = null;
  // private frontendConnection: WebSocket | null = null;

  /**
   * Initialize WebSocket server on the HTTP server
   */
  initialize(server: Server): void {
    this.wss = new WebSocketServer({ server, path: '/ws' });

    this.wss.on('connection', (ws, req) => {
      const clientId = this.generateClientId();
      const client: WebSocketClient = {
        ws,
        userId: 'unknown',
        connectedAt: new Date(),
      };

      this.clients.set(clientId, client);

      logger.info('WebSocket client connected', {
        clientId,
        totalClients: this.clients.size,
        ip: req.socket.remoteAddress,
      });

      // Send welcome message
      ws.send(JSON.stringify({
        type: 'connected',
        clientId,
        timestamp: new Date().toISOString(),
        message: 'Connected to OpenAnalyst WebSocket server',
      }));

      ws.on('close', (code, reason) => {
        this.clients.delete(clientId);
        logger.info('WebSocket client disconnected', {
          clientId,
          code,
          reason: reason.toString(),
          totalClients: this.clients.size,
        });
      });

      ws.on('error', (error) => {
        logger.error('WebSocket client error', {
          clientId,
          error: error.message,
        });
      });

      ws.on('message', (data) => this.handleMessage(clientId, data));
    });

    this.wss.on('error', (error) => {
      logger.error('WebSocket server error', { error: error.message });
    });

    logger.info('WebSocket server initialized on /ws path');
  }

  /**
   * Broadcast event to all connected clients
   */
  broadcast(event: TaskProgressEvent): void {
    const message = JSON.stringify(event);

    this.clients.forEach((client, clientId) => {
      if (client.ws.readyState === WebSocket.OPEN) {
        try {
          client.ws.send(message);
        } catch (error) {
          logger.error('Failed to send WebSocket message', {
            clientId,
            error: (error as Error).message,
          });
        }
      }
    });

    // TODO: Send to frontend WebSocket URL when provided
    // if (this.frontendConnection?.readyState === WebSocket.OPEN) {
    //   try {
    //     this.frontendConnection.send(message);
    //   } catch (error) {
    //     logger.error('Failed to send to frontend WebSocket', {
    //       error: (error as Error).message,
    //     });
    //   }
    // }

    logger.debug('Broadcast event to clients', {
      type: event.type,
      sessionId: event.sessionId,
      clientCount: this.clients.size,
    });
  }

  /**
   * Broadcast event to specific session subscribers only
   */
  broadcastToSession(sessionId: string, event: TaskProgressEvent): void {
    const message = JSON.stringify(event);
    let sentCount = 0;

    this.clients.forEach((client, clientId) => {
      // Send to clients subscribed to this session or clients without session filter
      if ((client.sessionId === sessionId || !client.sessionId) &&
          client.ws.readyState === WebSocket.OPEN) {
        try {
          client.ws.send(message);
          sentCount++;
        } catch (error) {
          logger.error('Failed to send WebSocket message to session', {
            clientId,
            sessionId,
            error: (error as Error).message,
          });
        }
      }
    });

    logger.debug('Broadcast to session', {
      sessionId,
      type: event.type,
      sentCount,
    });
  }

  /**
   * Send message to a specific client
   */
  sendToClient(clientId: string, event: TaskProgressEvent): void {
    const client = this.clients.get(clientId);
    if (client && client.ws.readyState === WebSocket.OPEN) {
      try {
        client.ws.send(JSON.stringify(event));
      } catch (error) {
        logger.error('Failed to send WebSocket message to client', {
          clientId,
          error: (error as Error).message,
        });
      }
    }
  }

  /**
   * Get connected client count
   */
  getClientCount(): number {
    return this.clients.size;
  }

  /**
   * Get clients subscribed to a session
   */
  getSessionClients(sessionId: string): string[] {
    const sessionClients: string[] = [];
    this.clients.forEach((client, clientId) => {
      if (client.sessionId === sessionId) {
        sessionClients.push(clientId);
      }
    });
    return sessionClients;
  }

  /**
   * Close all connections and shutdown server
   */
  shutdown(): void {
    this.clients.forEach((client, clientId) => {
      try {
        client.ws.close(1001, 'Server shutting down');
      } catch (error) {
        logger.error('Error closing client connection', {
          clientId,
          error: (error as Error).message,
        });
      }
    });

    this.clients.clear();

    if (this.wss) {
      this.wss.close();
      this.wss = null;
    }

    logger.info('WebSocket server shutdown complete');
  }

  /**
   * Generate unique client ID
   */
  private generateClientId(): string {
    return `ws-client-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }

  /**
   * Handle incoming messages from clients
   */
  private handleMessage(clientId: string, data: Buffer | ArrayBuffer | Buffer[]): void {
    try {
      const message = JSON.parse(data.toString());
      const client = this.clients.get(clientId);

      if (!client) return;

      switch (message.type) {
        case 'subscribe':
          // Subscribe client to a specific session
          if (message.sessionId) {
            client.sessionId = message.sessionId;
            logger.info('Client subscribed to session', {
              clientId,
              sessionId: message.sessionId,
            });

            // Send confirmation
            client.ws.send(JSON.stringify({
              type: 'subscribed',
              sessionId: message.sessionId,
              timestamp: new Date().toISOString(),
            }));
          }
          break;

        case 'unsubscribe':
          // Unsubscribe from session
          client.sessionId = undefined;
          logger.info('Client unsubscribed from session', { clientId });
          break;

        case 'identify':
          // Identify user
          if (message.userId) {
            client.userId = message.userId;
            logger.info('Client identified', {
              clientId,
              userId: message.userId,
            });
          }
          break;

        case 'ping':
          // Respond to ping
          client.ws.send(JSON.stringify({
            type: 'pong',
            timestamp: new Date().toISOString(),
          }));
          break;

        default:
          logger.debug('Unknown WebSocket message type', {
            clientId,
            type: message.type,
          });
      }
    } catch (error) {
      // Ignore invalid JSON messages
      logger.debug('Failed to parse WebSocket message', {
        clientId,
        error: (error as Error).message,
      });
    }
  }

  // TODO: Connect to frontend WebSocket URL when provided
  // connectToFrontend(wsUrl: string): void {
  //   this.frontendWsUrl = wsUrl;
  //   this.frontendConnection = new WebSocket(wsUrl);
  //
  //   this.frontendConnection.on('open', () => {
  //     logger.info('Connected to frontend WebSocket', { wsUrl });
  //   });
  //
  //   this.frontendConnection.on('close', () => {
  //     logger.info('Disconnected from frontend WebSocket', { wsUrl });
  //     // Attempt to reconnect after delay
  //     setTimeout(() => this.connectToFrontend(wsUrl), 5000);
  //   });
  //
  //   this.frontendConnection.on('error', (error) => {
  //     logger.error('Frontend WebSocket error', { error: error.message });
  //   });
  // }
}

// Export singleton instance
export const wsService = new WebSocketService();
export default wsService;
