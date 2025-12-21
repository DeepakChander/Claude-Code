import Anthropic from '@anthropic-ai/sdk';
import { Response } from 'express';
import { config } from 'dotenv';
import logger from '../utils/logger';
import { openRouterConfig, getModelPricing } from '../config/openrouter';

config();

// Initialize Anthropic client with OpenRouter
const client = new Anthropic({
  baseURL: openRouterConfig.baseUrl,
  apiKey: openRouterConfig.authToken,
});

export interface SdkOptions {
  // Core options
  allowedTools?: string[];
  disallowedTools?: string[];
  permissionMode?: 'default' | 'acceptEdits' | 'bypassPermissions' | 'plan';
  model?: string;
  fallbackModel?: string;

  // Prompt customization
  systemPrompt?: string;
  appendSystemPrompt?: string;

  // Session management
  resume?: string;
  sessionId?: string;
  forkSession?: boolean;

  // Execution control
  maxTurns?: number;
  maxTokens?: number;

  // Advanced
  verbose?: boolean;
}

export interface SdkResult {
  success: boolean;
  output: string;
  sessionId?: string;
  tokensInput?: number;
  tokensOutput?: number;
  costUsd?: number;
}

// Store conversation history for sessions
const conversationHistory: Map<string, Anthropic.MessageParam[]> = new Map();

/**
 * Generate a unique session ID
 */
const generateSessionId = (): string => {
  return `session-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
};

/**
 * Run with streaming output (SSE)
 */
export const runSdkStreaming = async (
  prompt: string,
  workspacePath: string,
  res: Response,
  options: SdkOptions = {}
): Promise<void> => {
  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');

  let aborted = false;
  const sessionId = options.resume || generateSessionId();
  let tokensInput = 0;
  let tokensOutput = 0;

  // Handle client disconnect
  res.on('close', () => {
    aborted = true;
    logger.info('Client disconnected from stream');
  });

  try {
    const model = options.model || openRouterConfig.defaultModel;
    const maxTokens = options.maxTokens || 8192;

    logger.info('Running Claude API (streaming)', {
      workspacePath,
      model,
      sessionId,
    });

    // Get or create conversation history
    let messages: Anthropic.MessageParam[] = [];
    if (options.resume && conversationHistory.has(options.resume)) {
      messages = [...conversationHistory.get(options.resume)!];
    }

    // Add new user message
    messages.push({ role: 'user', content: prompt });

    // Send init message
    res.write(`data: ${JSON.stringify({
      type: 'system',
      subtype: 'init',
      session_id: sessionId,
    })}\n\n`);

    // Build system prompt
    const systemPrompt = options.systemPrompt || options.appendSystemPrompt ||
      `You are Claude, an AI assistant. You are helpful, harmless, and honest. Current working directory: ${workspacePath}`;

    // Create streaming message
    const stream = client.messages.stream({
      model,
      max_tokens: maxTokens,
      system: systemPrompt,
      messages,
    });

    let fullResponse = '';

    // Handle stream events
    stream.on('text', (text) => {
      if (aborted) return;
      fullResponse += text;
      res.write(`data: ${JSON.stringify({
        type: 'text',
        content: text,
      })}\n\n`);
    });

    stream.on('message', (message) => {
      tokensInput = message.usage.input_tokens;
      tokensOutput = message.usage.output_tokens;
    });

    stream.on('error', (error) => {
      logger.error('Stream error', { error: error.message });
      if (!aborted) {
        res.write(`data: ${JSON.stringify({
          type: 'error',
          content: error.message,
        })}\n\n`);
      }
    });

    // Wait for stream to complete
    await stream.finalMessage();

    // Update conversation history
    messages.push({ role: 'assistant', content: fullResponse });
    conversationHistory.set(sessionId, messages);

    // Calculate cost
    const pricing = getModelPricing(model);
    const costUsd = (tokensInput / 1_000_000) * pricing.input +
                    (tokensOutput / 1_000_000) * pricing.output;

    // Send completion message
    res.write(`data: ${JSON.stringify({
      type: 'usage',
      tokensInput,
      tokensOutput,
      costUsd,
    })}\n\n`);

    res.write(`data: ${JSON.stringify({
      type: 'done',
      sessionId,
      model,
      tokensInput,
      tokensOutput,
      costUsd,
    })}\n\n`);

    logger.info('Claude API streaming completed', {
      sessionId,
      model,
      tokensInput,
      tokensOutput,
      costUsd,
    });

  } catch (error) {
    logger.error('Claude API streaming error', { error: (error as Error).message });

    if (!aborted) {
      res.write(`data: ${JSON.stringify({
        type: 'error',
        content: (error as Error).message,
      })}\n\n`);
    }
  } finally {
    res.end();
  }
};

/**
 * Run and collect all results (JSON)
 */
export const runSdkSync = async (
  prompt: string,
  workspacePath: string,
  options: SdkOptions = {}
): Promise<SdkResult> => {
  const sessionId = options.resume || generateSessionId();

  try {
    const model = options.model || openRouterConfig.defaultModel;
    const maxTokens = options.maxTokens || 8192;

    logger.info('Running Claude API (sync)', {
      workspacePath,
      model,
      sessionId,
    });

    // Get or create conversation history
    let messages: Anthropic.MessageParam[] = [];
    if (options.resume && conversationHistory.has(options.resume)) {
      messages = [...conversationHistory.get(options.resume)!];
    }

    // Add new user message
    messages.push({ role: 'user', content: prompt });

    // Build system prompt
    const systemPrompt = options.systemPrompt || options.appendSystemPrompt ||
      `You are Claude, an AI assistant. You are helpful, harmless, and honest. Current working directory: ${workspacePath}`;

    // Create message
    const response = await client.messages.create({
      model,
      max_tokens: maxTokens,
      system: systemPrompt,
      messages,
    });

    // Extract text from response
    const output = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('\n');

    // Update conversation history
    messages.push({ role: 'assistant', content: output });
    conversationHistory.set(sessionId, messages);

    // Calculate cost
    const tokensInput = response.usage.input_tokens;
    const tokensOutput = response.usage.output_tokens;
    const pricing = getModelPricing(model);
    const costUsd = (tokensInput / 1_000_000) * pricing.input +
                    (tokensOutput / 1_000_000) * pricing.output;

    logger.info('Claude API sync completed', {
      sessionId,
      model,
      tokensInput,
      tokensOutput,
      costUsd,
    });

    return {
      success: true,
      output,
      sessionId,
      tokensInput,
      tokensOutput,
      costUsd,
    };

  } catch (error) {
    logger.error('Claude API sync error', { error: (error as Error).message });

    return {
      success: false,
      output: (error as Error).message,
    };
  }
};

/**
 * Resume an existing session
 */
export const resumeSession = async (
  prompt: string,
  workspacePath: string,
  sessionId: string,
  res: Response,
  options: SdkOptions = {}
): Promise<void> => {
  return runSdkStreaming(prompt, workspacePath, res, {
    ...options,
    resume: sessionId,
  });
};

/**
 * Clear session history
 */
export const clearSession = (sessionId: string): boolean => {
  return conversationHistory.delete(sessionId);
};

/**
 * Get session history
 */
export const getSessionHistory = (sessionId: string): Anthropic.MessageParam[] | undefined => {
  return conversationHistory.get(sessionId);
};

export default {
  runSdkStreaming,
  runSdkSync,
  resumeSession,
  clearSession,
  getSessionHistory,
};
