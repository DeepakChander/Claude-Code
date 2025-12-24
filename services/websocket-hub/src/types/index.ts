import { WebSocket } from 'ws';

// Message types for WebSocket communication
export enum MessageType {
  // Client -> Server
  USER_REQUEST = 'USER_REQUEST',
  PING = 'PING',

  // Server -> Client
  ASSISTANT_TYPING = 'ASSISTANT_TYPING',
  ASSISTANT_RESPONSE = 'ASSISTANT_RESPONSE',
  ASSISTANT_CHUNK = 'ASSISTANT_CHUNK',
  TASK_PROGRESS = 'TASK_PROGRESS',
  TASK_COMPLETE = 'TASK_COMPLETE',
  TASK_ERROR = 'TASK_ERROR',
  PONG = 'PONG',
  ERROR = 'ERROR',
  CONNECTED = 'CONNECTED',

  // Internal
  BRAIN_REQUEST = 'BRAIN_REQUEST',
  BRAIN_RESPONSE = 'BRAIN_RESPONSE',
}

export interface WSMessage {
  type: MessageType;
  userId: string;
  sessionId: string;
  payload: unknown;
  timestamp: number;
  messageId: string;
  correlationId?: string;
}

export interface UserRequestPayload {
  content: string;
  conversationId?: string;
  attachments?: string[];
  metadata?: Record<string, unknown>;
}

export interface AssistantResponsePayload {
  messageId: string;
  content: string;
  done: boolean;
  metadata?: {
    skill?: string;
    duration?: number;
    windmillJob?: string;
    tokens?: number;
  };
}

export interface TaskProgressPayload {
  taskId: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  progress?: number;
  message?: string;
  result?: unknown;
}

export interface AuthenticatedSocket extends WebSocket {
  userId: string;
  sessionId: string;
  isAlive: boolean;
  connectedAt: number;
}

export interface JWTPayload {
  userId: string;
  email?: string;
  exp?: number;
  iat?: number;
}

export interface RedisMessage {
  type: MessageType;
  userId: string;
  sessionId: string;
  payload: unknown;
  timestamp: number;
  messageId: string;
  correlationId?: string;
}
