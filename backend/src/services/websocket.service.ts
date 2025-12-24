import { WebSocket, WebSocketServer } from 'ws';
import { Server } from 'http';
import logger from '../utils/logger';
import jwt from 'jsonwebtoken';
import { AuthUser } from '../middleware/auth.middleware';
import { config } from 'dotenv';
config();

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
    this.wss = new WebSocketServer({
      server,
      path: '/ws',
      perMessageDeflate: false, // Disable compression to avoid overhead
    });

    // Log WebSocket upgrade attempts for debugging
    server.on('upgrade', (request, _socket, _head) => {
      const url = request.url || '/';
      console.log(`[WS UPGRADE] Upgrade request for path: ${url}`);
    });

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
   * Send terminal command to IDE for execution
   * Used when AI requests a Bash command via WebSocket
   */
  sendTerminalCommand(
    sessionId: string,
    clientId: string,
    commandId: string,
    command: string,
    workingDir: string
  ): void {
    const client = this.clients.get(clientId);

    if (!client || client.ws.readyState !== 1) { // 1 = WebSocket.OPEN
      logger.warn('Cannot send terminal command - client not connected', { clientId, sessionId });
      return;
    }

    // Store pending command
    this.pendingTerminalCommands.set(commandId, {
      commandId,
      command,
      workingDir,
      sessionId,
      clientId,
      timestamp: new Date()
    });

    // Send to IDE
    client.ws.send(JSON.stringify({
      type: 'terminal_command',
      sessionId,
      timestamp: new Date().toISOString(),
      data: {
        commandId,
        command,
        workingDir,
        requiresApproval: true
      }
    }));

    logger.info('Terminal command sent to IDE', { commandId, command, sessionId });
  }

  /**
   * Get pending terminal command by ID
   */
  getPendingTerminalCommand(commandId: string) {
    return this.pendingTerminalCommands.get(commandId);
  }

  /**
   * Generate unique client ID
   */
  private generateClientId(): string {
    return `ws-client-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }

  // Pending approvals storage
  private pendingApprovals: Map<string, {
    toolCallId: string;
    toolName: string;
    toolInput: Record<string, unknown>;
    sessionId: string;
    clientId: string;
    timestamp: Date;
  }> = new Map();

  // Pending terminal commands for IDE execution
  private pendingTerminalCommands: Map<string, {
    commandId: string;
    command: string;
    workingDir: string;
    sessionId: string;
    clientId: string;
    timestamp: Date;
  }> = new Map();

  /**
   * Handle incoming messages from clients
   */
  private async handleMessage(clientId: string, data: Buffer | ArrayBuffer | Buffer[]): Promise<void> {
    try {
      const message = JSON.parse(data.toString());
      const client = this.clients.get(clientId);

      if (!client) return;

      switch (message.type) {
        case 'authenticate':
          // Authenticate client with JWT token
          if (message.payload?.token) {
            try {
              const secret = process.env.JWT_SECRET;
              if (!secret) {
                logger.error('JWT_SECRET is not defined');
                client.ws.send(JSON.stringify({
                  type: 'error',
                  data: { message: 'Server configuration error' }
                }));
                return;
              }
              const decoded = jwt.verify(message.payload.token, secret) as AuthUser;

              client.userId = decoded.userId;
              logger.info('Client authenticated', { clientId, userId: client.userId });

              client.ws.send(JSON.stringify({
                type: 'authenticated',
                timestamp: new Date().toISOString(),
                data: { success: true }
              }));
            } catch (error) {
              logger.warn('WebSocket authentication failed', { clientId, error: (error as Error).message });
              client.ws.send(JSON.stringify({
                type: 'error',
                data: { message: 'Authentication failed: Invalid token' }
              }));
              return;
            }
          }
          break;

        case 'chat':
          // Handle chat message - stream AI response
          const { prompt, sessionId, projectId } = message.payload || {};

          if (!prompt || !sessionId) {
            client.ws.send(JSON.stringify({
              type: 'error',
              timestamp: new Date().toISOString(),
              data: { message: 'Missing prompt or sessionId' }
            }));
            return;
          }

          // Subscribe client to this session
          client.sessionId = sessionId;

          logger.info('Chat message received', { clientId, sessionId, promptLength: prompt.length });

          // Send thinking indicator
          client.ws.send(JSON.stringify({
            type: 'thinking',
            sessionId,
            timestamp: new Date().toISOString(),
            data: { content: 'Analyzing your request...' }
          }));

          // Call AI and stream response
          try {
            await this.streamAIResponse(client, sessionId, projectId || 'default', prompt);
          } catch (error) {
            client.ws.send(JSON.stringify({
              type: 'error',
              sessionId,
              timestamp: new Date().toISOString(),
              data: { message: (error as Error).message }
            }));
          }
          break;

        case 'approve':
          // User approved a tool execution
          const approveToolCallId = message.payload?.toolCallId;
          const pending = this.pendingApprovals.get(approveToolCallId);

          if (!pending) {
            client.ws.send(JSON.stringify({
              type: 'error',
              timestamp: new Date().toISOString(),
              data: { message: 'No pending approval found for this toolCallId' }
            }));
            return;
          }

          logger.info('Tool approved', { toolCallId: approveToolCallId, toolName: pending.toolName });

          // Send approval confirmation
          client.ws.send(JSON.stringify({
            type: 'tool_approved',
            sessionId: pending.sessionId,
            timestamp: new Date().toISOString(),
            data: {
              toolCallId: approveToolCallId,
              toolName: pending.toolName,
              status: 'executing'
            }
          }));

          // Execute the tool (will be done by agent-sdk service)
          // For now, send a result placeholder
          client.ws.send(JSON.stringify({
            type: 'tool_result',
            sessionId: pending.sessionId,
            timestamp: new Date().toISOString(),
            data: {
              toolCallId: approveToolCallId,
              toolName: pending.toolName,
              success: true,
              output: `Tool ${pending.toolName} executed successfully`
            }
          }));

          this.pendingApprovals.delete(approveToolCallId);
          break;

        case 'reject':
          // User rejected a tool execution
          const rejectToolCallId = message.payload?.toolCallId;
          const reason = message.payload?.reason || 'User rejected';
          const rejectedPending = this.pendingApprovals.get(rejectToolCallId);

          if (rejectedPending) {
            logger.info('Tool rejected', { toolCallId: rejectToolCallId, reason });

            client.ws.send(JSON.stringify({
              type: 'tool_result',
              sessionId: rejectedPending.sessionId,
              timestamp: new Date().toISOString(),
              data: {
                toolCallId: rejectToolCallId,
                toolName: rejectedPending.toolName,
                success: false,
                output: '',
                error: reason
              }
            }));

            this.pendingApprovals.delete(rejectToolCallId);
          }
          break;

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

        // Terminal relay events for IDE integration
        case 'terminal_accept': {
          // IDE accepted a terminal command
          const termAcceptId = message.payload?.commandId;
          const termPending = this.pendingTerminalCommands.get(termAcceptId);

          if (termPending) {
            logger.info('Terminal command accepted by IDE', {
              commandId: termAcceptId,
              command: termPending.command
            });

            // Send acknowledgment
            client.ws.send(JSON.stringify({
              type: 'terminal_accepted',
              sessionId: termPending.sessionId,
              timestamp: new Date().toISOString(),
              data: { commandId: termAcceptId, status: 'executing' }
            }));
          }
          break;
        }

        case 'terminal_reject': {
          // IDE rejected a terminal command
          const termRejectId = message.payload?.commandId;
          const rejectReason = message.payload?.reason || 'User rejected command';
          const termRejected = this.pendingTerminalCommands.get(termRejectId);

          if (termRejected) {
            logger.info('Terminal command rejected by IDE', {
              commandId: termRejectId,
              reason: rejectReason
            });

            // Broadcast rejection to session
            this.broadcastToSession(termRejected.sessionId, {
              type: 'task_failed',
              sessionId: termRejected.sessionId,
              timestamp: new Date().toISOString(),
              data: {
                message: `Command rejected: ${rejectReason}`,
                error: rejectReason
              }
            } as TaskProgressEvent);

            this.pendingTerminalCommands.delete(termRejectId);
          }
          break;
        }

        case 'terminal_output': {
          // Real-time terminal output from IDE
          const { commandId: outCmdId, output, stream } = message.payload || {};
          const termOutput = this.pendingTerminalCommands.get(outCmdId);

          if (termOutput) {
            // Broadcast output to all session subscribers
            this.broadcastToSession(termOutput.sessionId, {
              type: 'task_started',
              sessionId: termOutput.sessionId,
              timestamp: new Date().toISOString(),
              data: {
                message: output,
                currentTask: {
                  id: outCmdId,
                  content: `Running: ${termOutput.command}`,
                  activeForm: output,
                  status: 'in_progress',
                  order: 0
                }
              }
            } as TaskProgressEvent);
          }

          logger.debug('Terminal output received', { commandId: outCmdId, stream, outputLength: output?.length });
          break;
        }

        case 'terminal_complete': {
          // Terminal command completed in IDE
          const { commandId: completeCmdId, exitCode, output: finalOutput } = message.payload || {};
          const termComplete = this.pendingTerminalCommands.get(completeCmdId);

          if (termComplete) {
            const success = exitCode === 0;

            logger.info('Terminal command completed', {
              commandId: completeCmdId,
              exitCode,
              success,
              command: termComplete.command
            });

            // Send completion event
            client.ws.send(JSON.stringify({
              type: 'terminal_result',
              sessionId: termComplete.sessionId,
              timestamp: new Date().toISOString(),
              data: {
                commandId: completeCmdId,
                command: termComplete.command,
                exitCode,
                success,
                output: finalOutput || ''
              }
            }));

            // Broadcast task completion
            this.broadcastToSession(termComplete.sessionId, {
              type: success ? 'task_completed' : 'task_failed',
              sessionId: termComplete.sessionId,
              timestamp: new Date().toISOString(),
              data: {
                currentTask: {
                  id: completeCmdId,
                  content: termComplete.command,
                  activeForm: `Exit code: ${exitCode}`,
                  status: success ? 'completed' : 'failed',
                  order: 0
                },
                message: success
                  ? `Command completed successfully (exit code: ${exitCode})`
                  : `Command failed (exit code: ${exitCode})`
              }
            } as TaskProgressEvent);

            this.pendingTerminalCommands.delete(completeCmdId);
          }
          break;
        }

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

  /**
   * Stream AI response to client via WebSocket
   */
  private async streamAIResponse(
    client: WebSocketClient,
    sessionId: string,
    projectId: string,
    prompt: string
  ): Promise<void> {
    // Import agent service dynamically to avoid circular dependency
    const { runChatStreamingForWebSocket } = await import('./agent-sdk.service');

    await runChatStreamingForWebSocket(
      prompt,
      sessionId,
      projectId,
      client.ws,
      client.userId,
      (toolCallId: string, toolName: string, toolInput: Record<string, unknown>) => {
        // Store pending approval
        const clientId = Array.from(this.clients.entries())
          .find(([, c]) => c.ws === client.ws)?.[0] || 'unknown';

        this.pendingApprovals.set(toolCallId, {
          toolCallId,
          toolName,
          toolInput,
          sessionId,
          clientId,
          timestamp: new Date()
        });
      }
    );
  }

  /**
   * Get pending approval by ID
   */
  getPendingApproval(toolCallId: string) {
    return this.pendingApprovals.get(toolCallId);
  }

  /**
   * Clear expired pending approvals (older than 5 minutes)
   */
  clearExpiredApprovals(): void {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);

    this.pendingApprovals.forEach((approval, toolCallId) => {
      if (approval.timestamp < fiveMinutesAgo) {
        this.pendingApprovals.delete(toolCallId);
        logger.info('Expired pending approval cleared', { toolCallId });
      }
    });
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
