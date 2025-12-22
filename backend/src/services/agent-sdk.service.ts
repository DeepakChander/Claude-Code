import Anthropic from '@anthropic-ai/sdk';
import { Response } from 'express';
import { config } from 'dotenv';
import logger from '../utils/logger';
import { openRouterConfig, getModelPricing, supportsReasoning } from '../config/openrouter';
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

  // Client-side conversation history (for resuming sessions)
  previousMessages?: Array<{ role: 'user' | 'assistant'; content: string }>;

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
 * Validate conversation history to ensure tool_result blocks have matching tool_use blocks
 * This fixes the error: "unexpected tool_use_id found in tool_result blocks"
 */
const validateConversationHistory = (messages: Anthropic.MessageParam[]): Anthropic.MessageParam[] => {
  const validated: Anthropic.MessageParam[] = [];

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];

    // Check if this is a user message with potential tool_result blocks
    if (msg.role === 'user' && Array.isArray(msg.content)) {
      const contentBlocks = msg.content as Anthropic.ContentBlockParam[];
      const toolResults = contentBlocks.filter(
        (b): b is Anthropic.ToolResultBlockParam =>
          typeof b === 'object' && 'type' in b && b.type === 'tool_result'
      );

      if (toolResults.length > 0) {
        // Get the previous assistant message to find matching tool_use blocks
        const prevMsg = validated[validated.length - 1];

        if (prevMsg?.role === 'assistant' && Array.isArray(prevMsg.content)) {
          const assistantContent = prevMsg.content as Anthropic.ContentBlock[];
          const toolUseIds = new Set(
            assistantContent
              .filter((b): b is Anthropic.ToolUseBlock =>
                typeof b === 'object' && 'type' in b && b.type === 'tool_use'
              )
              .map(b => b.id)
          );

          // Only include tool_results with valid matching tool_use
          const validContent = contentBlocks.filter(b => {
            if (typeof b === 'object' && 'type' in b && b.type === 'tool_result') {
              const toolResult = b as Anthropic.ToolResultBlockParam;
              return toolUseIds.has(toolResult.tool_use_id);
            }
            return true; // Keep non-tool_result blocks
          });

          if (validContent.length > 0) {
            validated.push({ ...msg, content: validContent });
          }
          // Skip message if all tool_results were invalid
          continue;
        }

        // No valid previous assistant message with tool_use - skip orphaned tool_results
        logger.warn('Skipping orphaned tool_result blocks (no matching tool_use)', {
          toolResultIds: toolResults.map(t => t.tool_use_id),
        });

        // Keep any non-tool_result content
        const nonToolContent = contentBlocks.filter(b =>
          !(typeof b === 'object' && 'type' in b && b.type === 'tool_result')
        );
        if (nonToolContent.length > 0) {
          validated.push({ ...msg, content: nonToolContent });
        }
        continue;
      }
    }

    validated.push(msg);
  }

  return validated;
};

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

    // Validate conversation history to prevent tool_use_id mismatch errors
    messages = validateConversationHistory(messages);

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

    // Validate conversation history to prevent tool_use_id mismatch errors
    messages = validateConversationHistory(messages);

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

/**
 * Chat mode - TRUE STREAMING with Server-Sent Events
 * Streams tokens as they're generated for real-time display
 * Supports DeepSeek reasoning via OpenRouter
 */
export const runChatStreaming = async (
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
    logger.info('Client disconnected from chat stream');
  });

  try {
    const model = options.model || openRouterConfig.defaultModel;
    const maxTokens = options.maxTokens || 8192;
    const useReasoning = supportsReasoning(model);

    logger.info('Running streaming chat API', {
      workspacePath,
      model,
      sessionId,
      useReasoning,
    });

    // Get or create conversation history
    let messages: Anthropic.MessageParam[] = [];

    // First try server-side session history
    if (options.resume && conversationHistory.has(options.resume)) {
      messages = [...conversationHistory.get(options.resume)!];
    }
    // Otherwise use client-provided history (for restoring from local storage)
    else if (options.previousMessages && options.previousMessages.length > 0) {
      messages = options.previousMessages.map(m => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      }));
      logger.info('Restored conversation from client history', {
        messageCount: messages.length,
        sessionId,
      });
    }

    // Validate conversation history to prevent tool_use_id mismatch errors
    messages = validateConversationHistory(messages);

    // Add new user message
    messages.push({ role: 'user', content: prompt });

    // Send init message immediately
    res.write(`data: ${JSON.stringify({
      type: 'system',
      subtype: 'init',
      session_id: sessionId,
      mode: 'streaming',
      model,
      useReasoning,
    })}\n\n`);

    // Build system prompt with TodoWrite instructions
    const systemPrompt = options.systemPrompt || options.appendSystemPrompt ||
      `You are Claude, an AI coding assistant. You have access to tools to read, write, and edit files, and run bash commands.
Current working directory: ${workspacePath}

## CRITICAL: Task Planning with TodoWrite

For ANY task that requires 2 or more steps, you MUST use the TodoWrite tool FIRST before doing anything else.

**TodoWrite Usage:**
1. BEFORE starting work, create a complete task list using TodoWrite
2. Each todo item needs: content (what to do), activeForm (present continuous form), status (start as 'pending')
3. Update the todo list as you work: mark current task as 'in_progress', completed tasks as 'completed'
4. Call TodoWrite again whenever a task status changes

**Example - "Create an Express server with user authentication":**
First, call TodoWrite to create a task list:
TodoWrite({
  todos: [
    { content: "Create package.json with dependencies", activeForm: "Creating package.json", status: "pending" },
    { content: "Create server.js with Express setup", activeForm: "Creating server.js", status: "pending" },
    { content: "Add authentication middleware", activeForm: "Adding authentication middleware", status: "pending" },
    { content: "Create user routes", activeForm: "Creating user routes", status: "pending" },
    { content: "Test the endpoints", activeForm: "Testing endpoints", status: "pending" }
  ]
})

Then mark first task as in_progress before working on it.

## File Operations
- Always use the Write tool to create new files.
- Always use the Edit tool to modify existing files.
- Always use the Read tool to view file contents.
- Always use the Bash tool to run shell commands.`;

    // Build OpenRouter-compatible request body
    const requestBody: Record<string, unknown> = {
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        ...messages.map(m => ({
          role: m.role,
          content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
        })),
      ],
      max_tokens: maxTokens,
      stream: true,
      // Tool definitions in OpenAI function-calling format
      tools: toolDefinitions.map(t => ({
        type: 'function',
        function: {
          name: t.name,
          description: t.description,
          parameters: t.input_schema,
        },
      })),
    };

    // For DeepSeek R1 models, add reasoning configuration
    // OpenRouter uses "include_reasoning" parameter for DeepSeek
    if (useReasoning) {
      requestBody['include_reasoning'] = true;
      logger.info('Reasoning/thinking enabled for model', { model });
    }

    logger.info('Sending streaming request to OpenRouter', {
      url: `${openRouterConfig.baseUrl}/v1/chat/completions`,
      model,
      messageCount: messages.length,
    });

    // Use fetch for true streaming (OpenRouter compatible)
    const streamResponse = await fetch(`${openRouterConfig.baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${openRouterConfig.authToken}`,
        'HTTP-Referer': 'https://openanalyst.ai',
        'X-Title': 'OpenAnalyst',
      },
      body: JSON.stringify(requestBody),
    });

    if (!streamResponse.ok) {
      const errorText = await streamResponse.text();
      logger.error('Streaming API error from OpenRouter', {
        status: streamResponse.status,
        statusText: streamResponse.statusText,
        error: errorText,
      });
      throw new Error(`OpenRouter API error: ${streamResponse.status} - ${errorText}`);
    }

    const reader = streamResponse.body?.getReader();
    if (!reader) {
      throw new Error('No response body from OpenRouter');
    }

    const decoder = new TextDecoder();
    let buffer = '';
    let fullContent = '';
    let reasoningContent = '';
    const toolCalls: Array<{ id: string; name: string; arguments: string }> = [];
    let currentToolCall: { id: string; name: string; arguments: string } | null = null;
    let chunkCount = 0;

    // Notify client that stream is starting
    res.write(`data: ${JSON.stringify({
      type: 'stream_start',
      message: 'Receiving response...',
    })}\n\n`);

    // Process stream
    while (!aborted) {
      const { done, value } = await reader.read();
      if (done) {
        logger.info('Stream reader completed', { chunkCount });
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (aborted) break;

        const trimmedLine = line.trim();
        if (!trimmedLine) continue;
        if (!trimmedLine.startsWith('data: ')) continue;

        const data = trimmedLine.slice(6).trim();
        if (data === '[DONE]') {
          logger.info('Received [DONE] signal');
          continue;
        }

        try {
          const parsed = JSON.parse(data);
          chunkCount++;

          const choice = parsed.choices?.[0];
          if (!choice) continue;

          const delta = choice.delta;

          // Handle reasoning/thinking content from DeepSeek
          // OpenRouter returns reasoning in delta.reasoning or delta.reasoning_content
          const thinking = delta?.reasoning || delta?.reasoning_content || parsed.reasoning;
          if (thinking) {
            reasoningContent += thinking;
            res.write(`data: ${JSON.stringify({
              type: 'thinking',
              content: thinking,
            })}\n\n`);
          }

          // Handle text content
          if (delta?.content) {
            fullContent += delta.content;
            res.write(`data: ${JSON.stringify({
              type: 'text',
              content: delta.content,
            })}\n\n`);
          }

          // Handle tool calls (OpenAI function calling format)
          if (delta?.tool_calls) {
            for (const tc of delta.tool_calls) {
              if (tc.index !== undefined) {
                // New tool call or continuing one
                if (tc.id) {
                  // New tool call starting
                  if (currentToolCall) {
                    toolCalls.push(currentToolCall);
                  }
                  currentToolCall = {
                    id: tc.id,
                    name: tc.function?.name || '',
                    arguments: tc.function?.arguments || '',
                  };

                  // Notify client tool call is starting
                  res.write(`data: ${JSON.stringify({
                    type: 'tool_start',
                    tool: currentToolCall.name,
                    tool_use_id: currentToolCall.id,
                  })}\n\n`);
                } else if (currentToolCall) {
                  // Continuing arguments
                  if (tc.function?.name) {
                    currentToolCall.name = tc.function.name;
                  }
                  if (tc.function?.arguments) {
                    currentToolCall.arguments += tc.function.arguments;
                  }
                }
              }
            }
          }

          // Track usage (may come in final chunk)
          if (parsed.usage) {
            totalTokensInput = parsed.usage.prompt_tokens || 0;
            totalTokensOutput = parsed.usage.completion_tokens || 0;
          }

          // Check finish reason
          if (choice.finish_reason) {
            logger.info('Stream finish reason received', {
              reason: choice.finish_reason,
              chunkCount,
              contentLength: fullContent.length,
              reasoningLength: reasoningContent.length,
            });
          }
        } catch (parseError) {
          // Skip non-JSON lines, log only if it looks like it should be JSON
          if (data.startsWith('{')) {
            logger.warn('Failed to parse SSE data', { data: data.substring(0, 100) });
          }
        }
      }
    }

    // Push last tool call if exists
    if (currentToolCall) {
      toolCalls.push(currentToolCall);
    }

    // Send tool calls to client for execution
    for (const tc of toolCalls) {
      let parsedInput = {};
      try {
        parsedInput = JSON.parse(tc.arguments || '{}');
      } catch {
        logger.warn('Failed to parse tool arguments', { tool: tc.name, args: tc.arguments });
        parsedInput = {};
      }

      res.write(`data: ${JSON.stringify({
        type: 'tool_use',
        tool: tc.name,
        input: parsedInput,
        tool_use_id: tc.id,
        execute_locally: true,
      })}\n\n`);
    }

    // Store conversation - include both text content AND tool_use blocks
    // This is critical for proper tool_use/tool_result matching
    // The Anthropic SDK expects specific block types - we must construct them correctly
    if (fullContent || toolCalls.length > 0) {
      const assistantContent: Anthropic.ContentBlockParam[] = [];

      // Add text content if present
      if (fullContent) {
        assistantContent.push({
          type: 'text' as const,
          text: fullContent,
        });
      }

      // Add tool_use blocks if present - these are required for matching tool_results
      // The SDK expects ToolUseBlockParam with specific structure
      for (const tc of toolCalls) {
        let parsedInput: Record<string, unknown> = {};
        try {
          parsedInput = JSON.parse(tc.arguments || '{}');
        } catch {
          parsedInput = {};
        }

        // Construct ToolUseBlockParam properly
        assistantContent.push({
          type: 'tool_use' as const,
          id: tc.id,
          name: tc.name,
          input: parsedInput,
        } as Anthropic.ToolUseBlockParam);
      }

      // Store with proper typing - MessageParam accepts content as ContentBlockParam[]
      messages.push({
        role: 'assistant' as const,
        content: assistantContent,
      });

      logger.info('Stored assistant message with tool_use blocks', {
        sessionId,
        textLength: fullContent.length,
        toolUseCount: toolCalls.length,
        toolUseIds: toolCalls.map(t => t.id),
      });
    }
    conversationHistory.set(sessionId, messages);

    // Calculate cost
    const pricing = getModelPricing(model);
    const costUsd = (totalTokensInput / 1_000_000) * pricing.input +
                    (totalTokensOutput / 1_000_000) * pricing.output;

    // Send usage info
    res.write(`data: ${JSON.stringify({
      type: 'usage',
      tokensInput: totalTokensInput,
      tokensOutput: totalTokensOutput,
      costUsd,
      hasReasoning: reasoningContent.length > 0,
    })}\n\n`);

    // Send completion message with full summary
    res.write(`data: ${JSON.stringify({
      type: 'turn_complete',
      sessionId,
      model,
      stopReason: toolCalls.length > 0 ? 'tool_use' : 'end_turn',
      needsToolExecution: toolCalls.length > 0,
      pendingTools: toolCalls.map(t => ({ id: t.id, name: t.name })),
      tokensInput: totalTokensInput,
      tokensOutput: totalTokensOutput,
      costUsd,
      contentLength: fullContent.length,
      reasoningLength: reasoningContent.length,
    })}\n\n`);

    // Send final done signal
    res.write(`data: ${JSON.stringify({
      type: 'done',
      sessionId,
    })}\n\n`);

    logger.info('Streaming completed successfully', {
      sessionId,
      model,
      contentLength: fullContent.length,
      reasoningLength: reasoningContent.length,
      toolCalls: toolCalls.length,
      chunkCount,
      tokensInput: totalTokensInput,
      tokensOutput: totalTokensOutput,
    });

  } catch (error) {
    logger.error('Streaming error', {
      error: (error as Error).message,
      stack: (error as Error).stack,
    });

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
 * Submit tool results from client and continue the conversation
 * Uses OpenAI-style format via fetch for consistency with runChatStreaming
 */
export const submitToolResults = async (
  sessionId: string,
  toolResults: Array<{ tool_use_id: string; output: string; is_error: boolean }>,
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

  res.on('close', () => {
    aborted = true;
    logger.info('Client disconnected from tool results stream');
  });

  try {
    // Get conversation history
    let messages = conversationHistory.get(sessionId);
    if (!messages) {
      res.write(`data: ${JSON.stringify({
        type: 'error',
        content: 'Session not found',
      })}\n\n`);
      res.end();
      return;
    }

    // Make a copy
    messages = [...messages];

    const model = options.model || openRouterConfig.defaultModel;
    const maxTokens = options.maxTokens || 8192;

    logger.info('Processing tool results from client', {
      sessionId,
      toolCount: toolResults.length,
      submittedToolUseIds: toolResults.map(r => r.tool_use_id),
      messageCount: messages.length,
    });

    // Find the last assistant message to get tool_use info
    const lastAssistantMsg = [...messages].reverse().find(m => m.role === 'assistant');
    const storedToolCalls: Array<{ id: string; name: string; input: Record<string, unknown> }> = [];

    if (lastAssistantMsg && Array.isArray(lastAssistantMsg.content)) {
      for (const block of lastAssistantMsg.content) {
        if (typeof block === 'object' && 'type' in block && block.type === 'tool_use') {
          const toolUseBlock = block as { id: string; name: string; input: Record<string, unknown> };
          storedToolCalls.push({
            id: toolUseBlock.id,
            name: toolUseBlock.name,
            input: toolUseBlock.input,
          });
        }
      }
      logger.info('Found stored tool_use blocks', {
        storedToolUseIds: storedToolCalls.map(t => t.id),
        storedToolNames: storedToolCalls.map(t => t.name),
      });
    } else {
      logger.warn('No tool_use blocks found in last assistant message', {
        lastAssistantMsgRole: lastAssistantMsg?.role,
        contentType: lastAssistantMsg ? typeof lastAssistantMsg.content : 'undefined',
        contentIsArray: lastAssistantMsg ? Array.isArray(lastAssistantMsg.content) : false,
      });
    }

    // Build system prompt with TodoWrite instructions
    const systemPrompt = options.systemPrompt || options.appendSystemPrompt ||
      `You are Claude, an AI coding assistant. You have access to tools to read, write, and edit files, and run bash commands.
Current working directory: ${workspacePath}

## CRITICAL: Task Planning with TodoWrite

For ANY task that requires 2 or more steps, you MUST use the TodoWrite tool FIRST before doing anything else.

**TodoWrite Usage:**
1. BEFORE starting work, create a complete task list using TodoWrite
2. Each todo item needs: content (what to do), activeForm (present continuous form), status (start as 'pending')
3. Update the todo list as you work: mark current task as 'in_progress', completed tasks as 'completed'
4. Call TodoWrite again whenever a task status changes

## File Operations
- Always use the Write tool to create new files.
- Always use the Edit tool to modify existing files.
- Always use the Read tool to view file contents.
- Always use the Bash tool to run shell commands.`;

    // Convert messages to OpenAI format for consistency with runChatStreaming
    const openAIMessages: Array<{ role: string; content: string; tool_calls?: unknown[]; tool_call_id?: string; name?: string }> = [
      { role: 'system', content: systemPrompt },
    ];

    // Convert each message to OpenAI format
    for (const msg of messages) {
      if (msg.role === 'user') {
        if (typeof msg.content === 'string') {
          openAIMessages.push({ role: 'user', content: msg.content });
        } else if (Array.isArray(msg.content)) {
          // Check if this is tool_result content
          const toolResultBlocks = msg.content.filter(
            (b): b is Anthropic.ToolResultBlockParam =>
              typeof b === 'object' && 'type' in b && b.type === 'tool_result'
          );
          if (toolResultBlocks.length > 0) {
            // Convert tool_results to OpenAI tool messages
            for (const tr of toolResultBlocks) {
              openAIMessages.push({
                role: 'tool',
                content: typeof tr.content === 'string' ? tr.content : JSON.stringify(tr.content),
                tool_call_id: tr.tool_use_id,
              });
            }
          } else {
            // Regular user message with blocks
            const textContent = msg.content
              .filter((b): b is Anthropic.TextBlockParam => typeof b === 'object' && 'type' in b && b.type === 'text')
              .map(b => b.text)
              .join('\n');
            if (textContent) {
              openAIMessages.push({ role: 'user', content: textContent });
            }
          }
        }
      } else if (msg.role === 'assistant') {
        if (typeof msg.content === 'string') {
          openAIMessages.push({ role: 'assistant', content: msg.content });
        } else if (Array.isArray(msg.content)) {
          // Extract text and tool_use blocks
          const textBlocks = msg.content.filter(
            (b): b is Anthropic.TextBlockParam => typeof b === 'object' && 'type' in b && b.type === 'text'
          );
          const toolUseBlocks = msg.content.filter(
            (b): b is { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> } =>
              typeof b === 'object' && 'type' in b && b.type === 'tool_use'
          );

          const assistantMsg: { role: string; content: string; tool_calls?: unknown[] } = {
            role: 'assistant',
            content: textBlocks.map(b => b.text).join('\n') || '',
          };

          // Convert tool_use to OpenAI tool_calls format
          if (toolUseBlocks.length > 0) {
            assistantMsg.tool_calls = toolUseBlocks.map((tu, index) => ({
              id: tu.id,
              type: 'function',
              index,
              function: {
                name: tu.name,
                arguments: JSON.stringify(tu.input),
              },
            }));
          }

          openAIMessages.push(assistantMsg);
        }
      }
    }

    // Add the new tool results as tool messages
    for (const tr of toolResults) {
      openAIMessages.push({
        role: 'tool',
        content: tr.output,
        tool_call_id: tr.tool_use_id,
      });
    }

    logger.info('Converted to OpenAI format', {
      messageCount: openAIMessages.length,
      messageRoles: openAIMessages.map(m => m.role),
    });

    // Build request body in OpenAI format
    const requestBody: Record<string, unknown> = {
      model,
      messages: openAIMessages,
      max_tokens: maxTokens,
      stream: true,
      tools: toolDefinitions.map(t => ({
        type: 'function',
        function: {
          name: t.name,
          description: t.description,
          parameters: t.input_schema,
        },
      })),
    };

    // Send request using fetch (same as runChatStreaming)
    const streamResponse = await fetch(`${openRouterConfig.baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${openRouterConfig.authToken}`,
        'HTTP-Referer': 'https://openanalyst.ai',
        'X-Title': 'OpenAnalyst',
      },
      body: JSON.stringify(requestBody),
    });

    if (!streamResponse.ok) {
      const errorText = await streamResponse.text();
      logger.error('Tool results API error', {
        status: streamResponse.status,
        error: errorText,
      });
      res.write(`data: ${JSON.stringify({
        type: 'error',
        content: `API error: ${streamResponse.status} - ${errorText}`,
      })}\n\n`);
      res.end();
      return;
    }

    const reader = streamResponse.body?.getReader();
    if (!reader) {
      throw new Error('No response body');
    }

    const decoder = new TextDecoder();
    let buffer = '';
    let fullContent = '';
    const toolCalls: Array<{ id: string; name: string; arguments: string }> = [];
    let currentToolCall: { id: string; name: string; arguments: string } | null = null;
    let totalTokensInput = 0;
    let totalTokensOutput = 0;

    // Process stream
    while (!aborted) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (aborted) break;

        const trimmedLine = line.trim();
        if (!trimmedLine || !trimmedLine.startsWith('data: ')) continue;

        const data = trimmedLine.slice(6).trim();
        if (data === '[DONE]') continue;

        try {
          const parsed = JSON.parse(data);
          const choice = parsed.choices?.[0];
          if (!choice) continue;

          const delta = choice.delta;

          // Handle text content
          if (delta?.content) {
            fullContent += delta.content;
            res.write(`data: ${JSON.stringify({
              type: 'text',
              content: delta.content,
            })}\n\n`);
          }

          // Handle tool calls
          if (delta?.tool_calls) {
            for (const tc of delta.tool_calls) {
              if (tc.id) {
                if (currentToolCall) {
                  toolCalls.push(currentToolCall);
                }
                currentToolCall = {
                  id: tc.id,
                  name: tc.function?.name || '',
                  arguments: tc.function?.arguments || '',
                };
                res.write(`data: ${JSON.stringify({
                  type: 'tool_start',
                  tool: currentToolCall.name,
                  tool_use_id: currentToolCall.id,
                })}\n\n`);
              } else if (currentToolCall) {
                if (tc.function?.name) {
                  currentToolCall.name = tc.function.name;
                }
                if (tc.function?.arguments) {
                  currentToolCall.arguments += tc.function.arguments;
                }
              }
            }
          }

          // Track usage
          if (parsed.usage) {
            totalTokensInput = parsed.usage.prompt_tokens || 0;
            totalTokensOutput = parsed.usage.completion_tokens || 0;
          }
        } catch {
          // Ignore parse errors
        }
      }
    }

    // Push last tool call
    if (currentToolCall) {
      toolCalls.push(currentToolCall);
    }

    // Send tool_use events to client
    for (const tc of toolCalls) {
      let parsedInput = {};
      try {
        parsedInput = JSON.parse(tc.arguments || '{}');
      } catch {
        parsedInput = {};
      }

      res.write(`data: ${JSON.stringify({
        type: 'tool_use',
        tool: tc.name,
        input: parsedInput,
        tool_use_id: tc.id,
        execute_locally: true,
      })}\n\n`);
    }

    // Update conversation history with tool results and new response
    // First add the tool results we received
    const toolResultBlocks: Anthropic.ToolResultBlockParam[] = toolResults.map(r => ({
      type: 'tool_result',
      tool_use_id: r.tool_use_id,
      content: r.output,
      is_error: r.is_error,
    }));
    messages.push({ role: 'user', content: toolResultBlocks });

    // Then add the assistant response
    if (fullContent || toolCalls.length > 0) {
      const assistantContent: Anthropic.ContentBlockParam[] = [];

      if (fullContent) {
        assistantContent.push({ type: 'text' as const, text: fullContent });
      }

      for (const tc of toolCalls) {
        let parsedInput: Record<string, unknown> = {};
        try {
          parsedInput = JSON.parse(tc.arguments || '{}');
        } catch {
          parsedInput = {};
        }
        assistantContent.push({
          type: 'tool_use' as const,
          id: tc.id,
          name: tc.name,
          input: parsedInput,
        } as Anthropic.ToolUseBlockParam);
      }

      messages.push({ role: 'assistant' as const, content: assistantContent });

      logger.info('Stored tool response with tool_use blocks', {
        sessionId,
        textLength: fullContent.length,
        toolUseCount: toolCalls.length,
        toolUseIds: toolCalls.map(t => t.id),
      });
    }

    conversationHistory.set(sessionId, messages);

    // Calculate cost
    const pricing = getModelPricing(model);
    const costUsd = (totalTokensInput / 1_000_000) * pricing.input +
                    (totalTokensOutput / 1_000_000) * pricing.output;

    // Send usage and completion events
    res.write(`data: ${JSON.stringify({
      type: 'usage',
      tokensInput: totalTokensInput,
      tokensOutput: totalTokensOutput,
      costUsd,
    })}\n\n`);

    res.write(`data: ${JSON.stringify({
      type: 'turn_complete',
      sessionId,
      model,
      stopReason: toolCalls.length > 0 ? 'tool_use' : 'end_turn',
      needsToolExecution: toolCalls.length > 0,
      pendingTools: toolCalls.map(t => ({ id: t.id, name: t.name })),
      tokensInput: totalTokensInput,
      tokensOutput: totalTokensOutput,
      costUsd,
    })}\n\n`);

    logger.info('Tool results processed successfully', {
      sessionId,
      newToolCalls: toolCalls.length,
    });

  } catch (error) {
    logger.error('Tool results processing error', { error: (error as Error).message });

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

export default {
  runSdkStreaming,
  runSdkSync,
  resumeSession,
  clearSession,
  getSessionHistory,
  runChatStreaming,
  submitToolResults,
};
