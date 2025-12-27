import Anthropic from '@anthropic-ai/sdk';
import { Response } from 'express';
import { config } from 'dotenv';
import logger from '../utils/logger';
import { openRouterConfig, getModelPricing, supportsReasoning } from '../config/openrouter';
import { toolDefinitions, executeTool } from './tools.service';
import { skillService } from './skill.service';
import { ensureWorkspace } from './workspace.service';

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

  // Client-side skills (for hybrid mode)
  clientSkills?: Array<{
    name: string;
    description: string;
    content: string;
    allowedTools?: string[];
  }>;

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

// OpenAI format message types for consistent storage
interface OpenAIToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

interface OpenAIMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content?: string | null;
  tool_calls?: OpenAIToolCall[];
  tool_call_id?: string;
  name?: string;
}

// Store conversation history in OpenAI format for consistency
const conversationHistory: Map<string, OpenAIMessage[]> = new Map();

/**
 * Generate a unique session ID
 */
const generateSessionId = (): string => {
  return `session-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
};

/**
 * Natural response guidelines - no phase labels in output
 */
const PHASE_BEHAVIOR_PROMPT = `
## RESPONSE GUIDELINES

Respond naturally and directly like ChatGPT or Gemini.

RULES:
- Answer questions directly and helpfully
- Do NOT use labels like [THINKING], [PLANNING], [WORKING], [FINAL] in your response
- Do NOT mention skill names like "CORE", "DATA_ANALYSIS", etc.
- Do NOT say "I am specialized in X" or "I am here to help with X"
- Do NOT mention internal routing or capabilities
- Just provide clear, helpful answers
- Use markdown formatting for code and lists
- Be concise but thorough

EXAMPLE:
User: What are React hooks?

React hooks are functions that let you use state and lifecycle features in functional components. The most common hooks are:

- **useState**: Manages local state
- **useEffect**: Handles side effects like data fetching
- **useContext**: Accesses context values

They were introduced in React 16.8 to give functional components the same capabilities as class components.
`;

/**
 * Build system prompt with TodoWrite instructions, phase behavior, and matched skills
 */
const buildSystemPrompt = async (
  workspacePath: string,
  prompt?: string,
  customPrompt?: string,
  clientSkills?: SdkOptions['clientSkills']
): Promise<string> => {
  // Auto-create skills folder if not exists (on first query)
  try {
    await skillService.initializeSkillsFolder(workspacePath);
  } catch (error) {
    logger.debug('Could not initialize skills folder', { error: (error as Error).message });
  }

  // Load and match skills for this prompt
  let skillContext = '';
  try {
    const serverSkills = await skillService.loadSkills(workspacePath);

    // Merge client skills if provided
    const allSkills = [...serverSkills];
    if (clientSkills && clientSkills.length > 0) {
      const parsedClientSkills = clientSkills.map(s => ({
        name: s.name,
        description: s.description,
        content: s.content,
        allowedTools: s.allowedTools || [],
        path: 'client-side',
        type: 'project' as const
      }));
      allSkills.push(...parsedClientSkills);
    }

    if (prompt && allSkills.length > 0) {
      const matchedSkills = skillService.matchSkills(prompt, allSkills);
      if (matchedSkills.length > 0) {
        skillContext = skillService.buildSkillContext(matchedSkills);
        logger.info('Skills matched for prompt', {
          count: matchedSkills.length,
          skills: matchedSkills.map(m => m.skill.name)
        });
      }
    }
  } catch (error) {
    logger.debug('Failed to load skills', { error: (error as Error).message });
  }

  const basePrompt = `You are Claude, an AI coding assistant. You have access to tools to read, write, and edit files, and run bash commands.
Current working directory: ${workspacePath}

${PHASE_BEHAVIOR_PROMPT}

${skillContext}

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

  return customPrompt || basePrompt;
};


/**
 * Convert tool definitions to OpenAI function format
 */
const getOpenAITools = () => {
  return toolDefinitions.map(t => ({
    type: 'function' as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: t.input_schema,
    },
  }));
};

/**
 * Run with streaming output (SSE) and tool use support
 * Uses Anthropic SDK directly
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

    // Get or create conversation history (Anthropic format for SDK)
    let messages: Anthropic.MessageParam[] = [];
    if (options.resume && conversationHistory.has(options.resume)) {
      // Convert from OpenAI format to Anthropic format
      const openaiMessages = conversationHistory.get(options.resume)!;
      for (const msg of openaiMessages) {
        if (msg.role === 'user') {
          messages.push({ role: 'user', content: msg.content || '' });
        } else if (msg.role === 'assistant') {
          if (msg.tool_calls && msg.tool_calls.length > 0) {
            const content: Anthropic.ContentBlockParam[] = [];
            if (msg.content) {
              content.push({ type: 'text', text: msg.content });
            }
            for (const tc of msg.tool_calls) {
              content.push({
                type: 'tool_use',
                id: tc.id,
                name: tc.function.name,
                input: JSON.parse(tc.function.arguments || '{}'),
              });
            }
            messages.push({ role: 'assistant', content });
          } else {
            messages.push({ role: 'assistant', content: msg.content || '' });
          }
        } else if (msg.role === 'tool') {
          // Tool results need to be added to the previous or a new user message
          const lastMsg = messages[messages.length - 1];
          if (lastMsg?.role === 'user' && Array.isArray(lastMsg.content)) {
            (lastMsg.content as Anthropic.ContentBlockParam[]).push({
              type: 'tool_result',
              tool_use_id: msg.tool_call_id!,
              content: msg.content || '',
            });
          } else {
            messages.push({
              role: 'user',
              content: [{
                type: 'tool_result',
                tool_use_id: msg.tool_call_id!,
                content: msg.content || '',
              }],
            });
          }
        }
      }
    }

    // Add new user message
    messages.push({ role: 'user', content: prompt });

    // Send init message
    res.write(`data: ${JSON.stringify({
      type: 'system',
      subtype: 'init',
      session_id: sessionId,
    })}\n\n`);

    const systemPrompt = await buildSystemPrompt(workspacePath, prompt, options.systemPrompt || options.appendSystemPrompt);

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

    // Convert to OpenAI format for storage
    const openaiMessages: OpenAIMessage[] = [];
    for (const msg of messages) {
      if (msg.role === 'user') {
        if (typeof msg.content === 'string') {
          openaiMessages.push({ role: 'user', content: msg.content });
        } else if (Array.isArray(msg.content)) {
          // Check if it's tool results
          const toolResults = msg.content.filter(
            (b): b is Anthropic.ToolResultBlockParam =>
              typeof b === 'object' && 'type' in b && b.type === 'tool_result'
          );
          for (const tr of toolResults) {
            openaiMessages.push({
              role: 'tool',
              tool_call_id: tr.tool_use_id,
              content: typeof tr.content === 'string' ? tr.content : JSON.stringify(tr.content),
            });
          }
        }
      } else if (msg.role === 'assistant') {
        if (typeof msg.content === 'string') {
          openaiMessages.push({ role: 'assistant', content: msg.content });
        } else if (Array.isArray(msg.content)) {
          const textBlocks = msg.content.filter(
            (b): b is Anthropic.TextBlock => typeof b === 'object' && 'type' in b && b.type === 'text'
          );
          const toolUseBlocks = msg.content.filter(
            (b): b is Anthropic.ToolUseBlock => typeof b === 'object' && 'type' in b && b.type === 'tool_use'
          );

          const openaiMsg: OpenAIMessage = {
            role: 'assistant',
            content: textBlocks.map(b => b.text).join('\n') || null,
          };

          if (toolUseBlocks.length > 0) {
            openaiMsg.tool_calls = toolUseBlocks.map(b => ({
              id: b.id,
              type: 'function' as const,
              function: {
                name: b.name,
                arguments: JSON.stringify(b.input),
              },
            }));
          }

          openaiMessages.push(openaiMsg);
        }
      }
    }
    conversationHistory.set(sessionId, openaiMessages);

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
      // Convert from OpenAI format
      const openaiMessages = conversationHistory.get(options.resume)!;
      // Simple conversion - just get text content
      for (const msg of openaiMessages) {
        if (msg.role === 'user' || msg.role === 'assistant') {
          messages.push({ role: msg.role, content: msg.content || '' });
        }
      }
    }

    // Add new user message
    messages.push({ role: 'user', content: prompt });

    const systemPrompt = await buildSystemPrompt(workspacePath, prompt, options.systemPrompt || options.appendSystemPrompt);

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

    // Store in OpenAI format
    const openaiMessages: OpenAIMessage[] = [
      { role: 'user', content: prompt },
      { role: 'assistant', content: finalOutput },
    ];
    conversationHistory.set(sessionId, openaiMessages);

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
export const getSessionHistory = (sessionId: string): OpenAIMessage[] | undefined => {
  return conversationHistory.get(sessionId);
};

/**
 * Chat mode - TRUE STREAMING with Server-Sent Events
 * Uses OpenAI-compatible format throughout for consistency
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

    // Get or create conversation history (OpenAI format)
    let messages: OpenAIMessage[] = [];

    // First try server-side session history
    if (options.resume && conversationHistory.has(options.resume)) {
      messages = [...conversationHistory.get(options.resume)!];
      logger.info('Restored session from server', {
        sessionId: options.resume,
        messageCount: messages.length,
      });
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

    const systemPrompt = await buildSystemPrompt(workspacePath, prompt, options.systemPrompt || options.appendSystemPrompt, options.clientSkills);

    // Build request body - messages are already in OpenAI format
    const requestBody: Record<string, unknown> = {
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        ...messages,
      ],
      max_tokens: maxTokens,
      stream: true,
      tools: getOpenAITools(),
    };

    // For DeepSeek R1 models, add reasoning configuration
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
    const toolCalls: OpenAIToolCall[] = [];
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
                    toolCalls.push({
                      id: currentToolCall.id,
                      type: 'function',
                      function: {
                        name: currentToolCall.name,
                        arguments: currentToolCall.arguments,
                      },
                    });
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
          // Skip non-JSON lines
          if (data.startsWith('{')) {
            logger.warn('Failed to parse SSE data', { data: data.substring(0, 100) });
          }
        }
      }
    }

    // Push last tool call if exists
    if (currentToolCall) {
      toolCalls.push({
        id: currentToolCall.id,
        type: 'function',
        function: {
          name: currentToolCall.name,
          arguments: currentToolCall.arguments,
        },
      });
    }

    // Send tool calls to client for execution
    for (const tc of toolCalls) {
      let parsedInput = {};
      try {
        parsedInput = JSON.parse(tc.function.arguments || '{}');
      } catch {
        logger.warn('Failed to parse tool arguments', { tool: tc.function.name, args: tc.function.arguments });
        parsedInput = {};
      }

      res.write(`data: ${JSON.stringify({
        type: 'tool_use',
        tool: tc.function.name,
        input: parsedInput,
        tool_use_id: tc.id,
        execute_locally: true,
      })}\n\n`);
    }

    // Store conversation in OpenAI format
    const assistantMessage: OpenAIMessage = {
      role: 'assistant',
      content: fullContent || null,
    };

    if (toolCalls.length > 0) {
      assistantMessage.tool_calls = toolCalls;
    }

    messages.push(assistantMessage);
    conversationHistory.set(sessionId, messages);

    logger.info('Stored conversation in OpenAI format', {
      sessionId,
      messageCount: messages.length,
      hasToolCalls: toolCalls.length > 0,
      toolCallIds: toolCalls.map(t => t.id),
    });

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
      pendingTools: toolCalls.map(t => ({ id: t.id, name: t.function.name })),
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
 * Uses OpenAI-compatible format consistently with runChatStreaming
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
      logger.error('Session not found', { sessionId, availableSessions: Array.from(conversationHistory.keys()) });
      res.write(`data: ${JSON.stringify({
        type: 'error',
        content: `Session not found: ${sessionId}. Please start a new session with /new`,
      })}\n\n`);
      res.end();
      return;
    }

    // Make a copy
    messages = [...messages];

    const model = options.model || openRouterConfig.defaultModel;
    const maxTokens = options.maxTokens || 8192;

    logger.info('=== SUBMIT TOOL RESULTS START ===', {
      sessionId,
      toolCount: toolResults.length,
      submittedToolUseIds: toolResults.map(r => r.tool_use_id),
      messageCount: messages.length,
    });

    // Find the last assistant message to verify tool_calls exist
    const lastAssistantMsg = [...messages].reverse().find(m => m.role === 'assistant');
    const storedToolCalls: Map<string, string> = new Map(); // id -> function name

    if (lastAssistantMsg?.tool_calls) {
      for (const tc of lastAssistantMsg.tool_calls) {
        storedToolCalls.set(tc.id, tc.function.name);
      }
    }

    const storedToolCallIds = Array.from(storedToolCalls.keys());

    logger.info('Tool call ID comparison', {
      storedToolCallIds,
      storedToolNames: Array.from(storedToolCalls.values()),
      submittedToolUseIds: toolResults.map(r => r.tool_use_id),
      match: storedToolCallIds.length > 0 && toolResults.every(r => storedToolCallIds.includes(r.tool_use_id)),
    });

    // Verify tool_calls exist
    if (storedToolCallIds.length === 0) {
      logger.error('NO TOOL_CALLS FOUND in last assistant message', {
        sessionId,
        lastAssistantMsg,
        allMessages: messages.map((m, i) => ({
          index: i,
          role: m.role,
          hasToolCalls: !!(m as OpenAIMessage).tool_calls?.length,
          toolCallIds: (m as OpenAIMessage).tool_calls?.map(tc => tc.id),
        })),
      });
      res.write(`data: ${JSON.stringify({
        type: 'error',
        content: 'Internal error: No tool_calls found in conversation history. Please start a new session with /new',
      })}\n\n`);
      res.end();
      return;
    }

    // Verify submitted tool IDs match stored tool calls
    const missingIds = toolResults.filter(r => !storedToolCalls.has(r.tool_use_id));
    if (missingIds.length > 0) {
      logger.error('Tool result IDs do not match stored tool_calls', {
        sessionId,
        missingIds: missingIds.map(r => r.tool_use_id),
        storedToolCallIds,
      });
      // Try to continue anyway - some providers may be lenient
      logger.warn('Attempting to continue despite ID mismatch');
    }

    // Add tool results as 'tool' role messages (OpenAI format)
    // IMPORTANT: Include 'name' field which is required by some providers (Google/Gemini)
    for (const result of toolResults) {
      const toolName = storedToolCalls.get(result.tool_use_id) || 'unknown';
      messages.push({
        role: 'tool',
        tool_call_id: result.tool_use_id,
        content: result.output,
        name: toolName, // Required by some OpenRouter providers
      });
    }

    logger.info('Added tool results to messages', {
      newMessageCount: messages.length,
      toolResultIds: toolResults.map(r => r.tool_use_id),
      toolNames: toolResults.map(r => storedToolCalls.get(r.tool_use_id)),
    });

    // Debug: Log the message structure being sent
    logger.debug('Message structure for OpenRouter request', {
      messages: messages.map((m, i) => ({
        index: i,
        role: m.role,
        contentPreview: typeof m.content === 'string' ? m.content?.substring(0, 50) : '(null)',
        hasToolCalls: !!(m as OpenAIMessage).tool_calls?.length,
        toolCallId: (m as OpenAIMessage).tool_call_id,
        name: (m as OpenAIMessage).name,
      })),
    });

    const systemPrompt = await buildSystemPrompt(workspacePath, undefined, options.systemPrompt || options.appendSystemPrompt, options.clientSkills);

    // Build request body - same format as runChatStreaming
    // Sanitize messages to ensure only valid fields are sent to OpenRouter
    const validMessages = messages.map(m => {
      const msg: any = { role: m.role };

      // Handle content - use empty string instead of null for max compatibility
      msg.content = m.content === null || m.content === undefined ? '' : m.content;

      // Only include valid properties
      if (m.tool_calls) msg.tool_calls = m.tool_calls;
      if (m.tool_call_id) msg.tool_call_id = m.tool_call_id;
      if (m.name) msg.name = m.name;

      return msg;
    });

    const requestBody: Record<string, unknown> = {
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        ...validMessages,
      ],
      max_tokens: maxTokens,
      stream: true,
      tools: getOpenAITools(),
    };

    logger.info('Sending tool results request to OpenRouter', {
      url: `${openRouterConfig.baseUrl}/v1/chat/completions`,
      model,
      messageCount: messages.length,
    });

    // Use fetch with OpenAI format - same as runChatStreaming
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
      logger.error('Tool results API error from OpenRouter', {
        status: streamResponse.status,
        statusText: streamResponse.statusText,
        error: errorText,
        requestMessages: messages.slice(-3), // Last 3 messages for debugging
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
    const newToolCalls: OpenAIToolCall[] = [];
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
              if (tc.index !== undefined) {
                if (tc.id) {
                  if (currentToolCall) {
                    newToolCalls.push({
                      id: currentToolCall.id,
                      type: 'function',
                      function: {
                        name: currentToolCall.name,
                        arguments: currentToolCall.arguments,
                      },
                    });
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
                  if (tc.function?.name) currentToolCall.name = tc.function.name;
                  if (tc.function?.arguments) currentToolCall.arguments += tc.function.arguments;
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
          // Skip parse errors
        }
      }
    }

    // Push last tool call
    if (currentToolCall) {
      newToolCalls.push({
        id: currentToolCall.id,
        type: 'function',
        function: {
          name: currentToolCall.name,
          arguments: currentToolCall.arguments,
        },
      });
    }

    // Send new tool calls to client
    for (const tc of newToolCalls) {
      let parsedInput = {};
      try {
        parsedInput = JSON.parse(tc.function.arguments || '{}');
      } catch {
        parsedInput = {};
      }

      res.write(`data: ${JSON.stringify({
        type: 'tool_use',
        tool: tc.function.name,
        input: parsedInput,
        tool_use_id: tc.id,
        execute_locally: true,
      })}\n\n`);
    }

    // Store updated conversation
    const assistantMessage: OpenAIMessage = {
      role: 'assistant',
      content: fullContent || null,
    };

    if (newToolCalls.length > 0) {
      assistantMessage.tool_calls = newToolCalls;
    }

    messages.push(assistantMessage);
    conversationHistory.set(sessionId, messages);

    logger.info('=== SUBMIT TOOL RESULTS COMPLETE ===', {
      sessionId,
      newMessageCount: messages.length,
      hasNewToolCalls: newToolCalls.length > 0,
      newToolCallIds: newToolCalls.map(t => t.id),
    });

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
    })}\n\n`);

    // Send completion event
    res.write(`data: ${JSON.stringify({
      type: 'turn_complete',
      sessionId,
      model,
      stopReason: newToolCalls.length > 0 ? 'tool_use' : 'end_turn',
      needsToolExecution: newToolCalls.length > 0,
      pendingTools: newToolCalls.map(t => ({ id: t.id, name: t.function.name })),
      tokensInput: totalTokensInput,
      tokensOutput: totalTokensOutput,
      costUsd,
    })}\n\n`);

  } catch (error) {
    const errorMessage = (error as Error).message;
    logger.error('Tool results processing error', {
      error: errorMessage,
      stack: (error as Error).stack,
      sessionId,
    });

    if (!aborted) {
      res.write(`data: ${JSON.stringify({
        type: 'error',
        content: errorMessage,
      })}\n\n`);
    }
  } finally {
    res.end();
  }
};

/**
 * WebSocket Chat Streaming - Stream AI responses via WebSocket
 * Similar to runChatStreaming but uses WebSocket instead of SSE
 */
export const runChatStreamingForWebSocket = async (
  prompt: string,
  sessionId: string,
  projectId: string,
  ws: import('ws').WebSocket,
  userId: string,
  onApprovalNeeded?: (toolCallId: string, toolName: string, toolInput: Record<string, unknown>) => void
): Promise<void> => {
  // CRITICAL SECURITY FIX: Use isolated workspace instead of process.cwd()
  const workspacePath = await ensureWorkspace(userId, projectId);
  logger.info('Using workspace for WebSocket chat', { userId, projectId, workspacePath });
  let totalTokensInput = 0;
  let totalTokensOutput = 0;

  try {
    const model = openRouterConfig.defaultModel;
    const maxTokens = 8192;
    const useReasoning = supportsReasoning(model);

    logger.info('Running WebSocket streaming chat', {
      sessionId,
      projectId,
      model,
      useReasoning,
    });

    // Get or create conversation history
    let messages: OpenAIMessage[] = [];
    if (conversationHistory.has(sessionId)) {
      messages = [...conversationHistory.get(sessionId)!];
    }

    // Add new user message
    messages.push({ role: 'user', content: prompt });

    // Send init message
    ws.send(JSON.stringify({
      type: 'system',
      subtype: 'init',
      sessionId,
      timestamp: new Date().toISOString(),
      data: {
        mode: 'streaming',
        model,
        useReasoning,
      }
    }));

    const systemPrompt = await buildSystemPrompt(workspacePath, prompt);

    // Build request body
    const requestBody: Record<string, unknown> = {
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        ...messages,
      ],
      max_tokens: maxTokens,
      stream: true,
      tools: getOpenAITools(),
    };

    // Make streaming request to OpenRouter
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openRouterConfig.authToken}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://openanalyst.ai',
        'X-Title': 'OpenAnalyst',
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenRouter API error: ${response.status} - ${errorText}`);
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('No response body reader');
    }

    const decoder = new TextDecoder();
    let buffer = '';
    let fullContent = '';
    let currentToolCalls: Array<{ id: string; type: string; function: { name: string; arguments: string } }> = [];

    // Stream response
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6);

        if (data === '[DONE]') {
          // Stream complete
          ws.send(JSON.stringify({
            type: 'complete',
            sessionId,
            timestamp: new Date().toISOString(),
            data: {
              tokensInput: totalTokensInput,
              tokensOutput: totalTokensOutput,
            }
          }));
          break;
        }

        try {
          const parsed = JSON.parse(data);
          const delta = parsed.choices?.[0]?.delta;

          if (delta?.content) {
            fullContent += delta.content;

            // Send text chunk
            ws.send(JSON.stringify({
              type: 'text',
              sessionId,
              timestamp: new Date().toISOString(),
              data: {
                content: fullContent,
                delta: delta.content,
              }
            }));
          }

          // Handle tool calls
          if (delta?.tool_calls) {
            for (const toolCall of delta.tool_calls) {
              const index = toolCall.index || 0;

              if (!currentToolCalls[index]) {
                currentToolCalls[index] = {
                  id: toolCall.id || `tool-${Date.now()}-${index}`,
                  type: 'function',
                  function: { name: '', arguments: '' }
                };
              }

              if (toolCall.function?.name) {
                currentToolCalls[index].function.name = toolCall.function.name;
              }
              if (toolCall.function?.arguments) {
                currentToolCalls[index].function.arguments += toolCall.function.arguments;
              }
            }
          }

          // Track usage
          if (parsed.usage) {
            totalTokensInput = parsed.usage.prompt_tokens || 0;
            totalTokensOutput = parsed.usage.completion_tokens || 0;
          }
        } catch {
          // Ignore parse errors for incomplete chunks
        }
      }
    }

    // Process completed tool calls
    for (const toolCall of currentToolCalls) {
      if (!toolCall.function.name) continue;

      const toolName = toolCall.function.name;
      let toolInput: Record<string, unknown> = {};

      try {
        toolInput = JSON.parse(toolCall.function.arguments || '{}');
      } catch {
        toolInput = { raw: toolCall.function.arguments };
      }

      // Check if tool needs approval
      const needsApproval = ['Write', 'Edit', 'Bash'].includes(toolName);

      if (needsApproval) {
        // Send approval_needed event
        ws.send(JSON.stringify({
          type: 'approval_needed',
          sessionId,
          timestamp: new Date().toISOString(),
          data: {
            toolCallId: toolCall.id,
            toolName,
            toolInput,
            requiresApproval: true,
            preview: toolName === 'Write' ? {
              filePath: toolInput.file_path,
              content: toolInput.content,
            } : toolName === 'Bash' ? {
              command: toolInput.command,
            } : null,
          }
        }));

        // Notify the caller to store pending approval
        if (onApprovalNeeded) {
          onApprovalNeeded(toolCall.id, toolName, toolInput);
        }
      } else {
        // Auto-execute safe tools (Read, ListDir, Glob, Grep, TodoWrite)
        ws.send(JSON.stringify({
          type: 'tool_use',
          sessionId,
          timestamp: new Date().toISOString(),
          data: {
            toolCallId: toolCall.id,
            toolName,
            toolInput,
            autoExecute: true,
          }
        }));

        // Execute the tool
        try {
          const result = await executeTool(toolName, toolInput, workspacePath);

          // For TodoWrite, send todo_created event
          if (toolName === 'TodoWrite' && toolInput.todos) {
            ws.send(JSON.stringify({
              type: 'todo_created',
              sessionId,
              timestamp: new Date().toISOString(),
              data: {
                todos: (toolInput.todos as Array<{ content: string; status?: string }>).map((t, i) => ({
                  id: `todo-${i}`,
                  content: t.content,
                  status: t.status || 'pending',
                }))
              }
            }));
          }

          ws.send(JSON.stringify({
            type: 'tool_result',
            sessionId,
            timestamp: new Date().toISOString(),
            data: {
              toolCallId: toolCall.id,
              toolName,
              success: result.success,
              output: result.output,
              error: result.error,
            }
          }));
        } catch (error) {
          ws.send(JSON.stringify({
            type: 'tool_result',
            sessionId,
            timestamp: new Date().toISOString(),
            data: {
              toolCallId: toolCall.id,
              toolName,
              success: false,
              output: '',
              error: (error as Error).message,
            }
          }));
        }
      }
    }

    // Store conversation history
    messages.push({
      role: 'assistant',
      content: fullContent || null,
      tool_calls: currentToolCalls.length > 0 ? currentToolCalls as OpenAIToolCall[] : undefined,
    });
    conversationHistory.set(sessionId, messages);

    logger.info('WebSocket streaming completed', {
      sessionId,
      contentLength: fullContent.length,
      toolCalls: currentToolCalls.length,
      tokensInput: totalTokensInput,
      tokensOutput: totalTokensOutput,
    });

  } catch (error) {
    logger.error('WebSocket streaming error', {
      sessionId,
      error: (error as Error).message,
    });

    ws.send(JSON.stringify({
      type: 'error',
      sessionId,
      timestamp: new Date().toISOString(),
      data: {
        message: (error as Error).message,
      }
    }));
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
  runChatStreamingForWebSocket,
};
