import { config } from 'dotenv';

config();

// OpenRouter Configuration
export const openRouterConfig = {
  baseUrl: process.env.ANTHROPIC_BASE_URL || 'https://openrouter.ai/api',
  authToken: process.env.ANTHROPIC_AUTH_TOKEN || '',
  defaultModel: process.env.ANTHROPIC_MODEL || 'anthropic/claude-sonnet-4.5',

  // Available Claude models via OpenRouter
  models: {
    opus: 'anthropic/claude-opus-4.1',
    sonnet: 'anthropic/claude-sonnet-4.5',
    haiku: 'anthropic/claude-haiku-4.5',
  } as const,

  // Model capabilities
  modelCapabilities: {
    'anthropic/claude-opus-4.1': {
      contextWindow: 200000,
      maxOutput: 32000,
      supportsTools: true,
      supportsVision: true,
      pricing: { input: 15.0, output: 75.0 }, // per million tokens
    },
    'anthropic/claude-sonnet-4.5': {
      contextWindow: 200000,
      maxOutput: 64000,
      supportsTools: true,
      supportsVision: true,
      pricing: { input: 3.0, output: 15.0 },
    },
    'anthropic/claude-haiku-4.5': {
      contextWindow: 200000,
      maxOutput: 8192,
      supportsTools: true,
      supportsVision: true,
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

export default openRouterConfig;
