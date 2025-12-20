import { query } from '@anthropic-ai/claude-agent-sdk';
import { Response } from 'express';
import { config } from 'dotenv';
import logger from '../utils/logger';
import { agentSdkConfig } from '../config/agent-sdk';
import { openRouterConfig } from '../config/openrouter';

config();

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
  addDirs?: string[];

  // Agents/Subagents
  agents?: Record<string, {
    description: string;
    prompt: string;
    tools?: string[];
    model?: 'sonnet' | 'opus' | 'haiku';
  }>;
  agent?: string;

  // MCP (Model Context Protocol)
  mcpServers?: Record<string, {
    command: string;
    args?: string[];
    env?: Record<string, string>;
  }>;

  // Advanced
  verbose?: boolean;
  dangerouslySkipPermissions?: boolean;
}

export interface SdkResult {
  success: boolean;
  output: string;
  sessionId?: string;
  tokensInput?: number;
  tokensOutput?: number;
  costUsd?: number;
}

/**
 * Run Agent SDK with streaming output (SSE)
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

  let sessionId: string | undefined;
  let aborted = false;

  // Handle client disconnect
  res.on('close', () => {
    aborted = true;
    logger.info('Client disconnected from SDK stream');
  });

  try {
    logger.info('Running Agent SDK (streaming)', {
      workspacePath,
      model: options.model || openRouterConfig.defaultModel,
    });

    // Build effective system prompt
    const effectiveSystemPrompt = options.systemPrompt || options.appendSystemPrompt;

    const response = query({
      prompt,
      options: {
        allowedTools: options.allowedTools || agentSdkConfig.defaultAllowedTools,
        permissionMode: options.permissionMode || agentSdkConfig.defaultPermissionMode,
        model: options.model || openRouterConfig.defaultModel,
        systemPrompt: effectiveSystemPrompt,
        resume: options.resume,
        maxTurns: options.maxTurns,
      },
    });

    for await (const message of response) {
      if (aborted) break;

      // Extract session ID from init message
      if (message.type === 'system' && (message as { subtype?: string }).subtype === 'init') {
        sessionId = (message as { session_id?: string }).session_id;
        logger.info('SDK session started', { sessionId });
      }

      // Send message to client
      res.write(`data: ${JSON.stringify(message)}\n\n`);

      // Handle text content
      if (message.type === 'assistant' && (message as { message?: { content?: Array<{ text?: string }> } }).message?.content) {
        const content = (message as { message: { content: Array<{ text?: string; name?: string }> } }).message.content;
        for (const block of content) {
          if ('text' in block && block.text) {
            res.write(`data: ${JSON.stringify({
              type: 'text',
              content: block.text,
            })}\n\n`);
          } else if ('name' in block && block.name) {
            res.write(`data: ${JSON.stringify({
              type: 'tool_use',
              tool_name: block.name,
            })}\n\n`);
          }
        }
      }
    }

    res.write(`data: ${JSON.stringify({
      type: 'done',
      sessionId,
    })}\n\n`);
  } catch (error) {
    logger.error('Agent SDK streaming error', { error: (error as Error).message });

    res.write(`data: ${JSON.stringify({
      type: 'error',
      content: (error as Error).message,
    })}\n\n`);
  } finally {
    res.end();
  }
};

/**
 * Run Agent SDK and collect all results (JSON)
 */
export const runSdkSync = async (
  prompt: string,
  workspacePath: string,
  options: SdkOptions = {}
): Promise<SdkResult> => {
  let sessionId: string | undefined;
  let outputParts: string[] = [];
  let tokensInput = 0;
  let tokensOutput = 0;

  try {
    logger.info('Running Agent SDK (sync)', {
      workspacePath,
      model: options.model || openRouterConfig.defaultModel,
    });

    // Build effective system prompt
    const effectiveSystemPrompt = options.systemPrompt || options.appendSystemPrompt;

    const response = query({
      prompt,
      options: {
        allowedTools: options.allowedTools || agentSdkConfig.defaultAllowedTools,
        permissionMode: options.permissionMode || agentSdkConfig.defaultPermissionMode,
        model: options.model || openRouterConfig.defaultModel,
        systemPrompt: effectiveSystemPrompt,
        resume: options.resume,
        maxTurns: options.maxTurns,
      },
    });

    for await (const message of response) {
      // Extract session ID
      if (message.type === 'system' && (message as { subtype?: string }).subtype === 'init') {
        sessionId = (message as { session_id?: string }).session_id;
      }

      // Collect text output
      if (message.type === 'assistant') {
        const content = (message as { message?: { content?: Array<{ text?: string }> } }).message?.content;
        if (content) {
          for (const block of content) {
            if ('text' in block && block.text) {
              outputParts.push(block.text);
            }
          }
        }

        // Collect token usage if available
        const usage = (message as { usage?: { input_tokens?: number; output_tokens?: number } }).usage;
        if (usage) {
          tokensInput += usage.input_tokens || 0;
          tokensOutput += usage.output_tokens || 0;
        }
      }

      // Check for result
      if (message.type === 'result') {
        const result = (message as { result?: string }).result;
        if (result) {
          outputParts.push(result);
        }
      }
    }

    // Calculate cost
    const pricing = openRouterConfig.modelCapabilities[
      (options.model || openRouterConfig.defaultModel) as keyof typeof openRouterConfig.modelCapabilities
    ]?.pricing || { input: 3.0, output: 15.0 };
    const costUsd = (tokensInput / 1_000_000) * pricing.input + (tokensOutput / 1_000_000) * pricing.output;

    logger.info('Agent SDK completed', {
      sessionId,
      tokensInput,
      tokensOutput,
      costUsd,
    });

    return {
      success: true,
      output: outputParts.join('\n'),
      sessionId,
      tokensInput,
      tokensOutput,
      costUsd,
    };
  } catch (error) {
    logger.error('Agent SDK sync error', { error: (error as Error).message });

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

export default {
  runSdkStreaming,
  runSdkSync,
  resumeSession,
};
