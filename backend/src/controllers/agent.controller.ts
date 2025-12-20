import { Response } from 'express';
import { ChildProcess } from 'child_process';
import { AuthRequest } from '../middleware/auth.middleware';
import { ensureWorkspace } from '../services/workspace.service';
import * as cliService from '../services/agent-cli.service';
import * as sdkService from '../services/agent-sdk.service';
import * as conversationRepo from '../repositories/conversation.repository';
import * as messageRepo from '../repositories/message.repository';
import logger, { logAgentQuery } from '../utils/logger';
import { agentQuerySchema, validate } from '../utils/validators';

// Store active CLI processes for cleanup
const activeProcesses = new Map<string, ChildProcess>();

interface AgentRequestBody {
  prompt: string;
  projectId?: string;
  allowedTools?: string[];
  model?: string;
  systemPrompt?: string;
  maxTurns?: number;
  conversationId?: string;
}

/**
 * Run Claude Code CLI with streaming output (SSE)
 * POST /api/agent/run
 */
export const runAgent = async (req: AuthRequest, res: Response): Promise<void> => {
  const userId = req.user!.userId;
  const { prompt, projectId = 'default', allowedTools, model, systemPrompt, maxTurns } = req.body as AgentRequestBody;

  // Validate request
  const { error } = validate(agentQuerySchema, req.body);
  if (error) {
    res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: error },
    });
    return;
  }

  try {
    // Ensure workspace exists
    const workspace = await ensureWorkspace(userId, projectId);

    // Find or create conversation
    const conversation = await conversationRepo.findOrCreateByProject(userId, projectId, model);

    // Log the query
    logAgentQuery(conversation.conversation_id, prompt, userId);

    // Store user message
    await messageRepo.createUserMessage(conversation.conversation_id, prompt);

    // Run CLI with streaming
    const process = cliService.runCliStreaming(prompt, workspace, res, {
      allowedTools,
      model,
      systemPrompt,
      maxTurns,
    });

    // Track process for cleanup
    const processId = `${userId}:${projectId}`;
    activeProcesses.set(processId, process);

    // Handle client disconnect
    req.on('close', () => {
      const proc = activeProcesses.get(processId);
      if (proc) {
        cliService.killProcess(proc);
        activeProcesses.delete(processId);
      }
    });

    // Cleanup when process ends
    process.on('close', () => {
      activeProcesses.delete(processId);
    });
  } catch (error) {
    logger.error('Agent run error', { userId, projectId, error: (error as Error).message });

    res.status(500).json({
      success: false,
      error: {
        code: 'AGENT_ERROR',
        message: (error as Error).message,
      },
    });
  }
};

/**
 * Run Claude Code CLI and return JSON
 * POST /api/agent/run-sync
 */
export const runAgentSync = async (req: AuthRequest, res: Response): Promise<void> => {
  const userId = req.user!.userId;
  const { prompt, projectId = 'default', allowedTools, model, systemPrompt, maxTurns } = req.body as AgentRequestBody;

  // Validate request
  const { error } = validate(agentQuerySchema, req.body);
  if (error) {
    res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: error },
    });
    return;
  }

  try {
    // Ensure workspace exists
    const workspace = await ensureWorkspace(userId, projectId);

    // Find or create conversation
    const conversation = await conversationRepo.findOrCreateByProject(userId, projectId, model);

    // Log the query
    logAgentQuery(conversation.conversation_id, prompt, userId);

    // Store user message
    await messageRepo.createUserMessage(conversation.conversation_id, prompt);

    // Run CLI synchronously
    const result = await cliService.runCliSync(prompt, workspace, {
      allowedTools,
      model,
      systemPrompt,
      maxTurns,
    });

    // Update session ID if available
    if (result.sessionId) {
      await conversationRepo.updateSessionId(conversation.conversation_id, result.sessionId);
    }

    // Parse output and store assistant message
    let parsedOutput = result.output;
    try {
      parsedOutput = JSON.parse(result.output);
    } catch {
      // Keep as string if not valid JSON
    }

    await messageRepo.createAssistantMessage(
      conversation.conversation_id,
      typeof parsedOutput === 'string' ? parsedOutput : JSON.stringify(parsedOutput)
    );

    res.json({
      success: result.success,
      data: {
        result: parsedOutput,
        conversationId: conversation.conversation_id,
        sessionId: result.sessionId,
      },
    });
  } catch (error) {
    logger.error('Agent sync error', { userId, projectId, error: (error as Error).message });

    res.status(500).json({
      success: false,
      error: {
        code: 'AGENT_ERROR',
        message: (error as Error).message,
      },
    });
  }
};

/**
 * Continue a conversation using --continue flag
 * POST /api/agent/continue
 */
export const continueAgent = async (req: AuthRequest, res: Response): Promise<void> => {
  const userId = req.user!.userId;
  const { prompt, projectId = 'default', conversationId } = req.body as AgentRequestBody;

  if (!prompt) {
    res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'prompt is required' },
    });
    return;
  }

  try {
    // Ensure workspace exists
    const workspace = await ensureWorkspace(userId, projectId);

    // Get existing conversation or create new
    let conversation;
    if (conversationId) {
      conversation = await conversationRepo.findById(conversationId);
      if (!conversation) {
        res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Conversation not found' },
        });
        return;
      }
    } else {
      conversation = await conversationRepo.findOrCreateByProject(userId, projectId);
    }

    // Log the query
    logAgentQuery(conversation.conversation_id, prompt, userId);

    // Store user message
    await messageRepo.createUserMessage(conversation.conversation_id, prompt);

    // Run CLI with --continue flag
    const process = cliService.continueConversation(prompt, workspace, res);

    // Track process for cleanup
    const processId = `${userId}:${projectId}`;
    activeProcesses.set(processId, process);

    req.on('close', () => {
      const proc = activeProcesses.get(processId);
      if (proc) {
        cliService.killProcess(proc);
        activeProcesses.delete(processId);
      }
    });

    process.on('close', () => {
      activeProcesses.delete(processId);
    });
  } catch (error) {
    logger.error('Agent continue error', { userId, projectId, error: (error as Error).message });

    res.status(500).json({
      success: false,
      error: {
        code: 'AGENT_ERROR',
        message: (error as Error).message,
      },
    });
  }
};

/**
 * Run Agent SDK with streaming output (SSE)
 * POST /api/agent/sdk/run
 */
export const runAgentSdk = async (req: AuthRequest, res: Response): Promise<void> => {
  const userId = req.user!.userId;
  const { prompt, projectId = 'default', allowedTools, model, systemPrompt, maxTurns, conversationId } = req.body as AgentRequestBody;

  // Validate request
  const { error } = validate(agentQuerySchema, req.body);
  if (error) {
    res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: error },
    });
    return;
  }

  try {
    // Ensure workspace exists
    const workspace = await ensureWorkspace(userId, projectId);

    // Find or create conversation
    let conversation;
    let resumeSessionId: string | undefined;

    if (conversationId) {
      conversation = await conversationRepo.findById(conversationId);
      if (conversation?.session_id) {
        resumeSessionId = conversation.session_id;
      }
    }

    if (!conversation) {
      conversation = await conversationRepo.findOrCreateByProject(userId, projectId, model);
    }

    // Log the query
    logAgentQuery(conversation.conversation_id, prompt, userId);

    // Store user message
    await messageRepo.createUserMessage(conversation.conversation_id, prompt);

    // Run SDK with streaming
    await sdkService.runSdkStreaming(prompt, workspace, res, {
      allowedTools,
      model,
      systemPrompt,
      maxTurns,
      resume: resumeSessionId,
    });
  } catch (error) {
    logger.error('Agent SDK run error', { userId, projectId, error: (error as Error).message });

    res.status(500).json({
      success: false,
      error: {
        code: 'AGENT_ERROR',
        message: (error as Error).message,
      },
    });
  }
};

/**
 * Run Agent SDK and return JSON
 * POST /api/agent/sdk/run-sync
 */
export const runAgentSdkSync = async (req: AuthRequest, res: Response): Promise<void> => {
  const userId = req.user!.userId;
  const { prompt, projectId = 'default', allowedTools, model, systemPrompt, maxTurns, conversationId } = req.body as AgentRequestBody;

  // Validate request
  const { error } = validate(agentQuerySchema, req.body);
  if (error) {
    res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: error },
    });
    return;
  }

  try {
    // Ensure workspace exists
    const workspace = await ensureWorkspace(userId, projectId);

    // Find or create conversation
    let conversation;
    let resumeSessionId: string | undefined;

    if (conversationId) {
      conversation = await conversationRepo.findById(conversationId);
      if (conversation?.session_id) {
        resumeSessionId = conversation.session_id;
      }
    }

    if (!conversation) {
      conversation = await conversationRepo.findOrCreateByProject(userId, projectId, model);
    }

    // Log the query
    logAgentQuery(conversation.conversation_id, prompt, userId);

    // Store user message
    await messageRepo.createUserMessage(conversation.conversation_id, prompt);

    // Run SDK synchronously
    const result = await sdkService.runSdkSync(prompt, workspace, {
      allowedTools,
      model,
      systemPrompt,
      maxTurns,
      resume: resumeSessionId,
    });

    // Update session ID if available
    if (result.sessionId) {
      await conversationRepo.updateSessionId(conversation.conversation_id, result.sessionId);
    }

    // Update token usage
    if (result.tokensInput && result.tokensOutput) {
      await conversationRepo.updateTokenUsage(
        conversation.conversation_id,
        result.tokensInput,
        result.tokensOutput,
        result.costUsd || 0
      );
    }

    // Store assistant message
    await messageRepo.createAssistantMessage(
      conversation.conversation_id,
      result.output,
      {
        tokensInput: result.tokensInput,
        tokensOutput: result.tokensOutput,
        model: model,
        costUsd: result.costUsd,
      }
    );

    res.json({
      success: result.success,
      data: {
        result: result.output,
        conversationId: conversation.conversation_id,
        sessionId: result.sessionId,
        usage: {
          tokensInput: result.tokensInput,
          tokensOutput: result.tokensOutput,
          costUsd: result.costUsd,
        },
      },
    });
  } catch (error) {
    logger.error('Agent SDK sync error', { userId, projectId, error: (error as Error).message });

    res.status(500).json({
      success: false,
      error: {
        code: 'AGENT_ERROR',
        message: (error as Error).message,
      },
    });
  }
};

/**
 * Continue a conversation using SDK session resume
 * POST /api/agent/sdk/continue
 */
export const continueAgentSdk = async (req: AuthRequest, res: Response): Promise<void> => {
  const userId = req.user!.userId;
  const { prompt, projectId = 'default', allowedTools, model, systemPrompt, maxTurns, conversationId } = req.body as AgentRequestBody;

  if (!prompt) {
    res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'prompt is required' },
    });
    return;
  }

  try {
    // Ensure workspace exists
    const workspace = await ensureWorkspace(userId, projectId);

    // Get existing conversation with session ID
    let conversation;
    let resumeSessionId: string | undefined;

    if (conversationId) {
      conversation = await conversationRepo.findById(conversationId);
    } else {
      // Get the most recent conversation for this project
      conversation = await conversationRepo.findOrCreateByProject(userId, projectId, model);
    }

    if (conversation?.session_id) {
      resumeSessionId = conversation.session_id;
    }

    if (!conversation) {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'No conversation found to continue' },
      });
      return;
    }

    // Log the query
    logAgentQuery(conversation.conversation_id, prompt, userId);

    // Store user message
    await messageRepo.createUserMessage(conversation.conversation_id, prompt);

    // Run SDK with session resume
    await sdkService.runSdkStreaming(prompt, workspace, res, {
      allowedTools,
      model,
      systemPrompt,
      maxTurns,
      resume: resumeSessionId,
    });
  } catch (error) {
    logger.error('Agent SDK continue error', { userId, projectId, error: (error as Error).message });

    res.status(500).json({
      success: false,
      error: {
        code: 'AGENT_ERROR',
        message: (error as Error).message,
      },
    });
  }
};

/**
 * Continue a conversation using SDK (sync version)
 * POST /api/agent/sdk/continue-sync
 */
export const continueAgentSdkSync = async (req: AuthRequest, res: Response): Promise<void> => {
  const userId = req.user!.userId;
  const { prompt, projectId = 'default', allowedTools, model, systemPrompt, maxTurns, conversationId } = req.body as AgentRequestBody;

  if (!prompt) {
    res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'prompt is required' },
    });
    return;
  }

  try {
    // Ensure workspace exists
    const workspace = await ensureWorkspace(userId, projectId);

    // Get existing conversation with session ID
    let conversation;
    let resumeSessionId: string | undefined;

    if (conversationId) {
      conversation = await conversationRepo.findById(conversationId);
    } else {
      conversation = await conversationRepo.findOrCreateByProject(userId, projectId, model);
    }

    if (conversation?.session_id) {
      resumeSessionId = conversation.session_id;
    }

    if (!conversation) {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'No conversation found to continue' },
      });
      return;
    }

    // Log the query
    logAgentQuery(conversation.conversation_id, prompt, userId);

    // Store user message
    await messageRepo.createUserMessage(conversation.conversation_id, prompt);

    // Run SDK synchronously with resume
    const result = await sdkService.runSdkSync(prompt, workspace, {
      allowedTools,
      model,
      systemPrompt,
      maxTurns,
      resume: resumeSessionId,
    });

    // Update session ID if new one was created
    if (result.sessionId) {
      await conversationRepo.updateSessionId(conversation.conversation_id, result.sessionId);
    }

    // Update token usage
    if (result.tokensInput && result.tokensOutput) {
      await conversationRepo.updateTokenUsage(
        conversation.conversation_id,
        result.tokensInput,
        result.tokensOutput,
        result.costUsd || 0
      );
    }

    // Store assistant message
    await messageRepo.createAssistantMessage(
      conversation.conversation_id,
      result.output,
      {
        tokensInput: result.tokensInput,
        tokensOutput: result.tokensOutput,
        model: model,
        costUsd: result.costUsd,
      }
    );

    res.json({
      success: result.success,
      data: {
        result: result.output,
        conversationId: conversation.conversation_id,
        sessionId: result.sessionId,
        usage: {
          tokensInput: result.tokensInput,
          tokensOutput: result.tokensOutput,
          costUsd: result.costUsd,
        },
      },
    });
  } catch (error) {
    logger.error('Agent SDK continue sync error', { userId, projectId, error: (error as Error).message });

    res.status(500).json({
      success: false,
      error: {
        code: 'AGENT_ERROR',
        message: (error as Error).message,
      },
    });
  }
};

/**
 * Get conversation history
 * GET /api/agent/conversations/:conversationId/messages
 */
export const getConversationMessages = async (req: AuthRequest, res: Response): Promise<void> => {
  const { conversationId } = req.params;

  try {
    const messages = await messageRepo.findByConversation(conversationId);

    res.json({
      success: true,
      data: messages,
    });
  } catch (error) {
    logger.error('Get messages error', { conversationId, error: (error as Error).message });

    res.status(500).json({
      success: false,
      error: {
        code: 'DATABASE_ERROR',
        message: (error as Error).message,
      },
    });
  }
};

/**
 * List user conversations
 * GET /api/agent/conversations
 */
export const listConversations = async (req: AuthRequest, res: Response): Promise<void> => {
  const userId = req.user!.userId;
  const { archived, limit, offset } = req.query;

  try {
    const conversations = await conversationRepo.findByUser(userId, {
      archived: archived === 'true',
      limit: limit ? parseInt(limit as string, 10) : undefined,
      offset: offset ? parseInt(offset as string, 10) : undefined,
    });

    res.json({
      success: true,
      data: conversations,
    });
  } catch (error) {
    logger.error('List conversations error', { userId, error: (error as Error).message });

    res.status(500).json({
      success: false,
      error: {
        code: 'DATABASE_ERROR',
        message: (error as Error).message,
      },
    });
  }
};

/**
 * Get usage statistics for a project
 * GET /api/agent/usage
 */
export const getUsage = async (req: AuthRequest, res: Response): Promise<void> => {
  const userId = req.user!.userId;
  const { projectId = 'default' } = req.query;

  try {
    // Get conversation for this project
    const conversation = await conversationRepo.findByUserAndProject(userId, projectId as string);

    if (!conversation) {
      res.json({
        success: true,
        data: {
          tokensInput: 0,
          tokensOutput: 0,
          costUsd: 0,
          messageCount: 0,
        },
      });
      return;
    }

    res.json({
      success: true,
      data: {
        tokensInput: conversation.total_tokens_used || 0,
        tokensOutput: 0, // We store total, need to split if needed
        costUsd: conversation.total_cost_usd || 0,
        messageCount: conversation.message_count || 0,
      },
    });
  } catch (error) {
    logger.error('Get usage error', { userId, error: (error as Error).message });

    res.status(500).json({
      success: false,
      error: {
        code: 'DATABASE_ERROR',
        message: (error as Error).message,
      },
    });
  }
};

/**
 * Health check for agent services
 * GET /api/agent/health
 */
export const agentHealth = async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    // Check if OpenRouter is configured
    const openrouterConfigured = !!process.env.OPENROUTER_API_KEY;

    // Try a simple request to verify connection (optional, can be slow)
    let openrouterConnected = 'unknown';
    if (openrouterConfigured) {
      try {
        const response = await fetch('https://openrouter.ai/api/v1/models', {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
          },
        });
        openrouterConnected = response.ok ? 'connected' : 'error';
      } catch {
        openrouterConnected = 'unreachable';
      }
    }

    res.json({
      success: true,
      data: {
        openrouter: openrouterConnected,
        configured: openrouterConfigured,
        mode: 'sdk',
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'HEALTH_CHECK_ERROR',
        message: (error as Error).message,
      },
    });
  }
};

/**
 * Compact a conversation (summarize to save context)
 * POST /api/agent/compact
 */
export const compactConversation = async (req: AuthRequest, res: Response): Promise<void> => {
  const userId = req.user!.userId;
  const { projectId = 'default' } = req.body;

  try {
    // Get conversation for this project
    const conversation = await conversationRepo.findByUserAndProject(userId, projectId);

    if (!conversation) {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Conversation not found' },
      });
      return;
    }

    // Get all messages
    const messages = await messageRepo.findByConversation(conversation.conversation_id);

    if (messages.length < 5) {
      res.json({
        success: true,
        data: {
          summary: null,
          tokensSaved: 0,
          message: 'Conversation too short to compact',
        },
      });
      return;
    }

    // Calculate approximate tokens before
    const tokensBefore = messages.reduce((acc, m) => acc + (m.content?.length || 0) / 4, 0);

    // For now, we just return the message - actual compaction would use Claude to summarize
    // This is a placeholder for the actual implementation
    res.json({
      success: true,
      data: {
        summary: `Conversation with ${messages.length} messages about: ${conversation.title || 'various topics'}`,
        tokensSaved: Math.floor(tokensBefore * 0.3), // Estimate 30% savings
        message: 'Compact feature will use Claude to summarize in a future update',
      },
    });
  } catch (error) {
    logger.error('Compact conversation error', { userId, projectId, error: (error as Error).message });

    res.status(500).json({
      success: false,
      error: {
        code: 'COMPACT_ERROR',
        message: (error as Error).message,
      },
    });
  }
};

export default {
  runAgent,
  runAgentSync,
  continueAgent,
  runAgentSdk,
  runAgentSdkSync,
  continueAgentSdk,
  continueAgentSdkSync,
  getConversationMessages,
  listConversations,
  getUsage,
  agentHealth,
  compactConversation,
};
