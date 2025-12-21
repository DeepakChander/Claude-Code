import Anthropic from '@anthropic-ai/sdk';
import { Response } from 'express';
import { config } from 'dotenv';
import logger from '../utils/logger';
import { openRouterConfig, getModelPricing } from '../config/openrouter';
import { toolDefinitions, executeTool } from './tools.service';

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
 * Run with streaming output (SSE) and tool use support
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
  let totalTokensInput = 0;
  let totalTokensOutput = 0;

  // Handle client disconnect
  res.on('close', () => {
    aborted = true;
    logger.info('Client disconnected from stream');
  });

  try {
    const model = options.model || openRouterConfig.defaultModel;
    const maxTokens = options.maxTokens || 8192;
    const maxTurns = options.maxTurns || 20; // Prevent infinite loops

    logger.info('Running Claude API (streaming with tools)', {
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
      `You are Claude, an AI coding assistant. You have access to tools to read, write, and edit files, and run bash commands.
Current working directory: ${workspacePath}

When the user asks you to create, modify, or interact with files, use the available tools.
Always use the Write tool to create new files.
Always use the Edit tool to modify existing files.
Always use the Read tool to view file contents.
Always use the Bash tool to run shell commands.`;

    // Agentic loop - keep going until Claude stops using tools
    let turn = 0;
    while (turn < maxTurns && !aborted) {
      turn++;

      logger.info(`Agentic loop turn ${turn}`, { sessionId });

      // Create message (non-streaming to handle tool use properly)
      const response = await client.messages.create({
        model,
        max_tokens: maxTokens,
        system: systemPrompt,
        messages,
        tools: toolDefinitions as Anthropic.Tool[],
      });

      // Track token usage
      totalTokensInput += response.usage.input_tokens;
      totalTokensOutput += response.usage.output_tokens;

      // Process response content blocks
      const toolUseBlocks: Anthropic.ToolUseBlock[] = [];

      for (const block of response.content) {
        if (aborted) break;

        if (block.type === 'text' && block.text) {
          // Stream text content
          res.write(`data: ${JSON.stringify({
            type: 'text',
            content: block.text,
          })}\n\n`);
        } else if (block.type === 'tool_use') {
          toolUseBlocks.push(block);

          // Notify client about tool use
          res.write(`data: ${JSON.stringify({
            type: 'tool_use',
            tool: block.name,
            input: block.input,
            tool_use_id: block.id,
          })}\n\n`);
        }
      }

      // Check if we should continue (tool use) or stop
      if (response.stop_reason !== 'tool_use' || toolUseBlocks.length === 0) {
        // No more tools - we're done
        logger.info('Agentic loop completed', { turn, stopReason: response.stop_reason });

        // Add final assistant response to history
        const textContent = response.content
          .filter((b): b is Anthropic.TextBlock => b.type === 'text')
          .map((b) => b.text)
          .join('\n');

        if (textContent) {
          messages.push({ role: 'assistant', content: textContent });
        }

        break;
      }

      // Add assistant response (with tool use) to messages
      messages.push({ role: 'assistant', content: response.content });

      // Execute tools and collect results
      const toolResults: Anthropic.ToolResultBlockParam[] = [];

      for (const toolBlock of toolUseBlocks) {
        if (aborted) break;

        logger.info('Executing tool', { tool: toolBlock.name, input: toolBlock.input });

        const result = await executeTool(
          toolBlock.name,
          toolBlock.input as Record<string, unknown>,
          workspacePath
        );

        // Send tool result to client
        res.write(`data: ${JSON.stringify({
          type: 'tool_result',
          tool: toolBlock.name,
          success: result.success,
          output: result.output.length > 1000 ? result.output.substring(0, 1000) + '...(truncated)' : result.output,
          error: result.error,
          tool_use_id: toolBlock.id,
        })}\n\n`);

        toolResults.push({
          type: 'tool_result',
          tool_use_id: toolBlock.id,
          content: result.success ? result.output : `Error: ${result.error}`,
          is_error: !result.success,
        });
      }

      // Add tool results to messages
      messages.push({ role: 'user', content: toolResults });
    }

    // Update conversation history
    conversationHistory.set(sessionId, messages);

    // Calculate cost
    const pricing = getModelPricing(model);
    const costUsd = (totalTokensInput / 1_000_000) * pricing.input +
                    (totalTokensOutput / 1_000_000) * pricing.output;

    // Send completion message
    res.write(`data: ${JSON.stringify({
      type: 'usage',
      tokensInput: totalTokensInput,
      tokensOutput: totalTokensOutput,
      costUsd,
      turns: turn,
    })}\n\n`);

    res.write(`data: ${JSON.stringify({
      type: 'done',
      sessionId,
      model,
      tokensInput: totalTokensInput,
      tokensOutput: totalTokensOutput,
      costUsd,
      turns: turn,
    })}\n\n`);

    logger.info('Claude API streaming with tools completed', {
      sessionId,
      model,
      tokensInput: totalTokensInput,
      tokensOutput: totalTokensOutput,
      costUsd,
      turns: turn,
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
 * Run and collect all results (JSON) with tool use support
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
    const maxTurns = options.maxTurns || 20;

    logger.info('Running Claude API (sync with tools)', {
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
      `You are Claude, an AI coding assistant. You have access to tools to read, write, and edit files, and run bash commands.
Current working directory: ${workspacePath}

When the user asks you to create, modify, or interact with files, use the available tools.
Always use the Write tool to create new files.
Always use the Edit tool to modify existing files.
Always use the Read tool to view file contents.
Always use the Bash tool to run shell commands.`;

    let totalTokensInput = 0;
    let totalTokensOutput = 0;
    let finalOutput = '';
    let turn = 0;

    // Agentic loop
    while (turn < maxTurns) {
      turn++;

      logger.info(`Agentic loop turn ${turn} (sync)`, { sessionId });

      // Create message
      const response = await client.messages.create({
        model,
        max_tokens: maxTokens,
        system: systemPrompt,
        messages,
        tools: toolDefinitions as Anthropic.Tool[],
      });

      totalTokensInput += response.usage.input_tokens;
      totalTokensOutput += response.usage.output_tokens;

      // Collect text and tool use blocks
      const toolUseBlocks: Anthropic.ToolUseBlock[] = [];

      for (const block of response.content) {
        if (block.type === 'text' && block.text) {
          finalOutput += block.text;
        } else if (block.type === 'tool_use') {
          toolUseBlocks.push(block);
        }
      }

      // Check if done
      if (response.stop_reason !== 'tool_use' || toolUseBlocks.length === 0) {
        logger.info('Agentic loop completed (sync)', { turn, stopReason: response.stop_reason });
        break;
      }

      // Add assistant response to history
      messages.push({ role: 'assistant', content: response.content });

      // Execute tools
      const toolResults: Anthropic.ToolResultBlockParam[] = [];

      for (const toolBlock of toolUseBlocks) {
        logger.info('Executing tool (sync)', { tool: toolBlock.name, input: toolBlock.input });

        const result = await executeTool(
          toolBlock.name,
          toolBlock.input as Record<string, unknown>,
          workspacePath
        );

        toolResults.push({
          type: 'tool_result',
          tool_use_id: toolBlock.id,
          content: result.success ? result.output : `Error: ${result.error}`,
          is_error: !result.success,
        });
      }

      // Add tool results to messages
      messages.push({ role: 'user', content: toolResults });
    }

    // Update conversation history
    if (finalOutput) {
      messages.push({ role: 'assistant', content: finalOutput });
    }
    conversationHistory.set(sessionId, messages);

    // Calculate cost
    const pricing = getModelPricing(model);
    const costUsd = (totalTokensInput / 1_000_000) * pricing.input +
                    (totalTokensOutput / 1_000_000) * pricing.output;

    logger.info('Claude API sync with tools completed', {
      sessionId,
      model,
      tokensInput: totalTokensInput,
      tokensOutput: totalTokensOutput,
      costUsd,
      turns: turn,
    });

    return {
      success: true,
      output: finalOutput,
      sessionId,
      tokensInput: totalTokensInput,
      tokensOutput: totalTokensOutput,
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
