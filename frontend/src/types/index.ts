// Frontend Types

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  metadata?: {
    skill?: string;
    duration?: number;
    tokens?: number;
  };
}

export interface Conversation {
  id: string;
  title: string;
  messages: Message[];
  createdAt: number;
  updatedAt: number;
}

export interface User {
  id: string;
  email: string;
  preferences?: UserPreferences;
}

export interface UserPreferences {
  theme?: 'light' | 'dark' | 'system';
  defaultPlatform?: string;
  timezone?: string;
}

export interface WSMessage {
  type: string;
  userId: string;
  sessionId: string;
  payload: unknown;
  timestamp: number;
  messageId: string;
  correlationId?: string;
}

export interface TaskProgress {
  taskId: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  progress?: number;
  message?: string;
}
