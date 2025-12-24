import { Kafka, logLevel, SASLOptions } from 'kafkajs';
import { config } from 'dotenv';

config();

// Kafka/Confluent Cloud Configuration
export const kafkaConfig = {
  // Confluent Cloud connection settings
  brokers: (process.env.KAFKA_BOOTSTRAP_SERVERS || 'localhost:9092').split(','),
  clientId: process.env.KAFKA_CLIENT_ID || 'openanalyst-api',

  // SASL/SSL authentication for Confluent Cloud
  sasl: {
    mechanism: 'plain' as const,
    username: process.env.KAFKA_API_KEY || '',
    password: process.env.KAFKA_API_SECRET || '',
  } as SASLOptions,

  ssl: process.env.KAFKA_USE_SSL !== 'false',

  // Topics
  topics: {
    requests: process.env.KAFKA_REQUEST_TOPIC || 'agent-requests',
    responses: process.env.KAFKA_RESPONSE_TOPIC || 'agent-responses',
  },

  // Consumer configuration
  consumer: {
    groupId: process.env.KAFKA_CONSUMER_GROUP || 'openanalyst-workers',
    sessionTimeout: 30000,
    heartbeatInterval: 3000,
    maxPollIntervalMs: 300000, // 5 minutes for long Claude processing
  },

  // Producer configuration
  producer: {
    acks: -1, // Wait for all replicas
    timeout: 30000,
    compression: 0, // No compression (Type.None)
  },

  // Retry configuration
  retry: {
    initialRetryTime: 100,
    retries: 8,
    maxRetryTime: 30000,
    factor: 2,
    multiplier: 1.5,
  },
};

// Create Kafka client
const createKafkaClient = (): Kafka => {
  const kafkaOptions: ConstructorParameters<typeof Kafka>[0] = {
    clientId: kafkaConfig.clientId,
    brokers: kafkaConfig.brokers,
    retry: kafkaConfig.retry,
    logLevel: logLevel.INFO,
  };

  // Add SSL and SASL if using Confluent Cloud
  if (kafkaConfig.ssl) {
    kafkaOptions.ssl = true;
    kafkaOptions.sasl = kafkaConfig.sasl;
  }

  return new Kafka(kafkaOptions);
};

// Singleton Kafka client
let kafkaClient: Kafka | null = null;

export const getKafkaClient = (): Kafka => {
  if (!kafkaClient) {
    kafkaClient = createKafkaClient();
  }
  return kafkaClient;
};

// Message schema types
export interface KafkaRequestMessage {
  correlationId: string;
  userId: string;
  conversationId: string;
  sessionId?: string;
  prompt: string;
  model: string;
  workspacePath?: string;
  continueConversation?: boolean;
  timestamp: string;
}

export interface KafkaResponseMessage {
  correlationId: string;
  userId: string;
  conversationId: string;
  sessionId?: string;
  response: {
    content: string;
    tokensInput: number;
    tokensOutput: number;
    toolCalls?: object[];
  };
  status: 'success' | 'error';
  error?: string;
  timestamp: string;
}

// Helper to create request message
export const createRequestMessage = (
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
): KafkaRequestMessage => ({
  correlationId,
  userId,
  conversationId,
  prompt,
  model: options.model || 'anthropic/claude-sonnet-4',
  sessionId: options.sessionId,
  workspacePath: options.workspacePath,
  continueConversation: options.continueConversation,
  timestamp: new Date().toISOString(),
});

// Helper to create success response message
export const createSuccessResponseMessage = (
  correlationId: string,
  userId: string,
  conversationId: string,
  response: {
    content: string;
    tokensInput: number;
    tokensOutput: number;
    sessionId?: string;
    toolCalls?: object[];
  }
): KafkaResponseMessage => ({
  correlationId,
  userId,
  conversationId,
  sessionId: response.sessionId,
  response: {
    content: response.content,
    tokensInput: response.tokensInput,
    tokensOutput: response.tokensOutput,
    toolCalls: response.toolCalls,
  },
  status: 'success',
  timestamp: new Date().toISOString(),
});

// Helper to create error response message
export const createErrorResponseMessage = (
  correlationId: string,
  userId: string,
  conversationId: string,
  error: string
): KafkaResponseMessage => ({
  correlationId,
  userId,
  conversationId,
  response: {
    content: '',
    tokensInput: 0,
    tokensOutput: 0,
  },
  status: 'error',
  error,
  timestamp: new Date().toISOString(),
});

// Check if Kafka is configured
export const isKafkaConfigured = (): boolean => {
  // For local Kafka (no SSL), only bootstrap servers needed
  // For Confluent Cloud (SSL enabled), API key and secret also needed
  const hasBootstrapServers = !!process.env.KAFKA_BOOTSTRAP_SERVERS;
  const isLocal = process.env.KAFKA_USE_SSL === 'false';

  if (isLocal) {
    return hasBootstrapServers;
  }

  // Cloud-based Kafka requires authentication
  return !!(
    hasBootstrapServers &&
    process.env.KAFKA_API_KEY &&
    process.env.KAFKA_API_SECRET
  );
};

export default {
  config: kafkaConfig,
  getClient: getKafkaClient,
  isConfigured: isKafkaConfigured,
  createRequestMessage,
  createSuccessResponseMessage,
  createErrorResponseMessage,
};
