import { config } from 'dotenv';

config();

// OpenRouter Configuration
export const openRouterConfig = {
  baseUrl: process.env.ANTHROPIC_BASE_URL || 'https://openrouter.ai/api',
  authToken: process.env.ANTHROPIC_AUTH_TOKEN || '',
  defaultModel: process.env.ANTHROPIC_MODEL || 'deepseek/deepseek-r1',

  // Available models via OpenRouter
  models: {
    // DeepSeek models with reasoning
    'deepseek-r1': 'deepseek/deepseek-r1',
    'deepseek-v3.2': 'deepseek/deepseek-v3.2',
    'deepseek-v3': 'deepseek/deepseek-chat-v3-0324',
    // Claude models
    opus: 'anthropic/claude-opus-4.1',
    sonnet: 'anthropic/claude-sonnet-4.5',
    haiku: 'anthropic/claude-haiku-4.5',
  } as const,

  // Model capabilities
  modelCapabilities: {
    // DeepSeek R1 - Default model with reasoning (best for thinking/reasoning)
    'deepseek/deepseek-r1': {
      contextWindow: 164000,
      maxOutput: 8192,
      supportsTools: true,
      supportsVision: false,
      supportsReasoning: true,
      pricing: { input: 0.30, output: 1.20 }, // per million tokens
    },
    // DeepSeek V3.2 - Also supports reasoning
    'deepseek/deepseek-v3.2': {
      contextWindow: 164000,
      maxOutput: 8192,
      supportsTools: true,
      supportsVision: false,
      supportsReasoning: true,
      pricing: { input: 0.24, output: 0.38 },
    },
    // DeepSeek V3 - NO reasoning support (faster, cheaper)
    'deepseek/deepseek-chat-v3-0324': {
      contextWindow: 164000,
      maxOutput: 8192,
      supportsTools: true,
      supportsVision: false,
      supportsReasoning: false,  // Does NOT support reasoning!
      pricing: { input: 0.20, output: 0.88 },
    },
    'anthropic/claude-opus-4.1': {
      contextWindow: 200000,
      maxOutput: 32000,
      supportsTools: true,
      supportsVision: true,
      supportsReasoning: false,
      pricing: { input: 15.0, output: 75.0 }, // per million tokens
    },
    'anthropic/claude-sonnet-4.5': {
      contextWindow: 200000,
      maxOutput: 64000,
      supportsTools: true,
      supportsVision: true,
      supportsReasoning: false,
      pricing: { input: 3.0, output: 15.0 },
    },
    'anthropic/claude-haiku-4.5': {
      contextWindow: 200000,
      maxOutput: 8192,
      supportsTools: true,
      supportsVision: true,
      supportsReasoning: false,
      pricing: { input: 0.25, output: 1.25 },
    },
  } as const,

  // Request configuration
  requestConfig: {
    timeout: 300000, // 5 minutes
    maxRetries: 3,
    retryDelay: 1000,
  },
};

// Get model pricing
export const getModelPricing = (model: string) => {
  const capabilities = openRouterConfig.modelCapabilities[model as keyof typeof openRouterConfig.modelCapabilities];
  return capabilities?.pricing || { input: 3.0, output: 15.0 };
};

// Get model capabilities
export const getModelCapabilities = (model: string) => {
  return openRouterConfig.modelCapabilities[model as keyof typeof openRouterConfig.modelCapabilities] || {
    contextWindow: 200000,
    maxOutput: 8192,
    supportsTools: true,
    supportsVision: true,
  };
};

// Validate model
export const isValidModel = (model: string): boolean => {
  return model in openRouterConfig.modelCapabilities;
};

// Check if model supports reasoning/thinking
export const supportsReasoning = (model: string): boolean => {
  const capabilities = openRouterConfig.modelCapabilities[model as keyof typeof openRouterConfig.modelCapabilities];
  return capabilities?.supportsReasoning || false;
};

export default openRouterConfig;
