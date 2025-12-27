import { Response } from 'express';
import { ChildProcess } from 'child_process';
import { AuthRequest } from '../middleware/auth.middleware';
import { ensureWorkspace } from '../services/workspace.service';
import * as cliService from '../services/agent-cli.service';
import * as sdkService from '../services/agent-sdk.service';
import { ensureUserProject } from '../services/project.service';
import { orchestrationService } from '../services/orchestration.service';
import { generateTitleFromMessage, needsTitleGeneration } from '../services/title-generation.service';
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
  clientSkills?: Array<{
    name: string;
    description: string;
    content: string;
    allowedTools?: string[];
  }>;
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
    // Enforce One Project Per User
    const project = await ensureUserProject(userId);
    const effectiveProjectId = project.projectId;

    // Ensure workspace exists (using project ID as name)
    const workspace = await ensureWorkspace(userId, effectiveProjectId);

    // Find or create conversation
    const conversation = await conversationRepo.findOrCreateByProject(userId, effectiveProjectId, model);

    // Log the query
    logAgentQuery(conversation.conversationId, prompt, userId);

    // Store user message
    await messageRepo.createUserMessage(conversation.conversationId, prompt);

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
  const { prompt, projectId, allowedTools, model, systemPrompt, maxTurns } = req.body as AgentRequestBody;

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
    // Enforce One Project Per User - auto-create if needed
    const project = await ensureUserProject(userId, projectId);
    const effectiveProjectId = project.projectId;

    // Ensure workspace exists
    const workspace = await ensureWorkspace(userId, effectiveProjectId);

    // Find or create conversation
    const conversation = await conversationRepo.findOrCreateByProject(userId, effectiveProjectId, model);

    // Log the query
    logAgentQuery(conversation.conversationId, prompt, userId);

    // Store user message
    await messageRepo.createUserMessage(conversation.conversationId, prompt);

    // Run CLI synchronously
    const result = await cliService.runCliSync(prompt, workspace, {
      allowedTools,
      model,
      systemPrompt,
      maxTurns,
    });

    // Update session ID if available
    if (result.sessionId) {
      await conversationRepo.updateSessionId(conversation.conversationId, result.sessionId);
    }

    // Parse output and store assistant message
    let parsedOutput = result.output;
    try {
      parsedOutput = JSON.parse(result.output);
    } catch {
      // Keep as string if not valid JSON
    }

    await messageRepo.createAssistantMessage(
      conversation.conversationId,
      typeof parsedOutput === 'string' ? parsedOutput : JSON.stringify(parsedOutput)
    );

    // Auto-generate title if this is the first response and title is default
    let conversationTitle = conversation.title;
    let titleGenerated = false;

    if (result.success && needsTitleGeneration(conversation.title)) {
      try {
        const titleResult = await generateTitleFromMessage(prompt);
        conversationTitle = titleResult.title;
        titleGenerated = true;
        await conversationRepo.update(conversation.conversationId, { title: titleResult.title });
        logger.info('Auto-generated conversation title', {
          conversationId: conversation.conversationId,
          title: titleResult.title,
        });
      } catch (titleError) {
        logger.warn('Failed to auto-generate title', {
          error: (titleError as Error).message,
        });
      }
    }

    res.json({
      success: result.success,
      data: {
        result: parsedOutput,
        conversationId: conversation.conversationId,
        sessionId: result.sessionId,
        conversationTitle,
        titleGenerated,
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
  const { prompt, projectId, conversationId } = req.body as AgentRequestBody;

  if (!prompt) {
    res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'prompt is required' },
    });
    return;
  }

  try {
    // Enforce One Project Per User - auto-create if needed
    const project = await ensureUserProject(userId, projectId);
    const effectiveProjectId = project.projectId;

    // Ensure workspace exists
    const workspace = await ensureWorkspace(userId, effectiveProjectId);

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
      conversation = await conversationRepo.findOrCreateByProject(userId, effectiveProjectId);
    }

    // Log the query
    logAgentQuery(conversation.conversationId, prompt, userId);

    // Store user message
    await messageRepo.createUserMessage(conversation.conversationId, prompt);

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
  const { prompt, projectId, allowedTools, model, systemPrompt, maxTurns, conversationId } = req.body as AgentRequestBody;

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
    // Enforce One Project Per User - auto-create if needed
    const project = await ensureUserProject(userId, projectId);
    const effectiveProjectId = project.projectId;

    // Ensure workspace exists
    const workspace = await ensureWorkspace(userId, effectiveProjectId);

    // Find or create conversation
    let conversation;
    let resumeSessionId: string | undefined;

    if (conversationId) {
      conversation = await conversationRepo.findById(conversationId);
      if (conversation?.sessionId) {
        resumeSessionId = conversation.sessionId;
      }
    }

    if (!conversation) {
      conversation = await conversationRepo.findOrCreateByProject(userId, effectiveProjectId, model);
    }

    // Log the query
    logAgentQuery(conversation.conversationId, prompt, userId);

    // Store user message
    await messageRepo.createUserMessage(conversation.conversationId, prompt);

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
  const { prompt, projectId, allowedTools, model, systemPrompt, maxTurns, conversationId } = req.body as AgentRequestBody;

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
    // Enforce One Project Per User - auto-create if needed
    const project = await ensureUserProject(userId, projectId);
    const effectiveProjectId = project.projectId;

    // Ensure workspace exists
    const workspace = await ensureWorkspace(userId, effectiveProjectId);

    // Find or create conversation
    let conversation;
    let resumeSessionId: string | undefined;

    if (conversationId) {
      conversation = await conversationRepo.findById(conversationId);
      if (conversation?.sessionId) {
        resumeSessionId = conversation.sessionId;
      }
    }

    if (!conversation) {
      conversation = await conversationRepo.findOrCreateByProject(userId, effectiveProjectId, model);
    }

    // Log the query
    logAgentQuery(conversation.conversationId, prompt, userId);

    // Store user message
    await messageRepo.createUserMessage(conversation.conversationId, prompt);

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
      await conversationRepo.updateSessionId(conversation.conversationId, result.sessionId);
    }

    // Update token usage
    if (result.tokensInput && result.tokensOutput) {
      await conversationRepo.updateTokenUsage(
        conversation.conversationId,
        result.tokensInput,
        result.tokensOutput,
        result.costUsd || 0
      );
    }

    // Store assistant message
    await messageRepo.createAssistantMessage(
      conversation.conversationId,
      result.output,
      {
        tokensInput: result.tokensInput,
        tokensOutput: result.tokensOutput,
        model: model,
        costUsd: result.costUsd,
      }
    );

    // Auto-generate title if this is the first response and title is default
    let conversationTitle = conversation.title;
    let titleGenerated = false;

    if (result.success && needsTitleGeneration(conversation.title)) {
      try {
        // Generate title from the user's first message (the prompt)
        const titleResult = await generateTitleFromMessage(prompt);
        conversationTitle = titleResult.title;
        titleGenerated = true;

        // Save the generated title
        await conversationRepo.update(conversation.conversationId, { title: titleResult.title });

        logger.info('Auto-generated conversation title', {
          conversationId: conversation.conversationId,
          title: titleResult.title,
          model: titleResult.model,
        });
      } catch (titleError) {
        // Title generation is non-blocking - log error but continue
        logger.warn('Failed to auto-generate title', {
          conversationId: conversation.conversationId,
          error: (titleError as Error).message,
        });
      }
    }

    res.json({
      success: result.success,
      data: {
        result: result.output,
        conversationId: conversation.conversationId,
        sessionId: result.sessionId,
        conversationTitle,
        titleGenerated,
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
  const { prompt, projectId, allowedTools, model, systemPrompt, maxTurns, conversationId } = req.body as AgentRequestBody;

  if (!prompt) {
    res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'prompt is required' },
    });
    return;
  }

  try {
    // Enforce One Project Per User - auto-create if needed
    const project = await ensureUserProject(userId, projectId);
    const effectiveProjectId = project.projectId;

    // Ensure workspace exists
    const workspace = await ensureWorkspace(userId, effectiveProjectId);

    // Get existing conversation with session ID
    let conversation;
    let resumeSessionId: string | undefined;

    if (conversationId) {
      conversation = await conversationRepo.findById(conversationId);
    } else {
      // Get the most recent conversation for this project
      conversation = await conversationRepo.findOrCreateByProject(userId, effectiveProjectId, model);
    }

    if (conversation?.sessionId) {
      resumeSessionId = conversation.sessionId;
    }

    if (!conversation) {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'No conversation found to continue' },
      });
      return;
    }

    // Log the query
    logAgentQuery(conversation.conversationId, prompt, userId);

    // Store user message
    await messageRepo.createUserMessage(conversation.conversationId, prompt);

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
  const { prompt, projectId, allowedTools, model, systemPrompt, maxTurns, conversationId } = req.body as AgentRequestBody;

  if (!prompt) {
    res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'prompt is required' },
    });
    return;
  }

  try {
    // Enforce One Project Per User - auto-create if needed
    const project = await ensureUserProject(userId, projectId);
    const effectiveProjectId = project.projectId;

    // Ensure workspace exists
    const workspace = await ensureWorkspace(userId, effectiveProjectId);

    // Get existing conversation with session ID
    let conversation;
    let resumeSessionId: string | undefined;

    if (conversationId) {
      conversation = await conversationRepo.findById(conversationId);
    } else {
      conversation = await conversationRepo.findOrCreateByProject(userId, effectiveProjectId, model);
    }

    if (conversation?.sessionId) {
      resumeSessionId = conversation.sessionId;
    }

    if (!conversation) {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'No conversation found to continue' },
      });
      return;
    }

    // Log the query
    logAgentQuery(conversation.conversationId, prompt, userId);

    // Store user message
    await messageRepo.createUserMessage(conversation.conversationId, prompt);

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
      await conversationRepo.updateSessionId(conversation.conversationId, result.sessionId);
    }

    // Update token usage
    if (result.tokensInput && result.tokensOutput) {
      await conversationRepo.updateTokenUsage(
        conversation.conversationId,
        result.tokensInput,
        result.tokensOutput,
        result.costUsd || 0
      );
    }

    // Store assistant message
    await messageRepo.createAssistantMessage(
      conversation.conversationId,
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
        conversationId: conversation.conversationId,
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
        tokensInput: conversation.totalTokensUsed || 0,
        tokensOutput: 0, // We store total, need to split if needed
        costUsd: conversation.totalCostUsd || 0,
        messageCount: conversation.messageCount || 0,
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
    const messages = await messageRepo.findByConversation(conversation.conversationId);

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

/**
 * List resumable conversations (those with sessionId)
 * GET /api/agent/resumable
 */
export const listResumableConversations = async (req: AuthRequest, res: Response): Promise<void> => {
  const userId = req.user!.userId;
  const { limit, offset } = req.query;

  try {
    const conversations = await conversationRepo.findResumable(userId, {
      limit: limit ? parseInt(limit as string, 10) : undefined,
      offset: offset ? parseInt(offset as string, 10) : undefined,
    });

    res.json({
      success: true,
      data: conversations.map((c) => ({
        conversationId: c.conversationId,
        title: c.title,
        sessionId: c.sessionId,
        workspacePath: c.workspacePath,
        modelUsed: c.modelUsed,
        messageCount: c.messageCount,
        lastMessageAt: c.lastMessageAt,
        createdAt: c.createdAt,
      })),
    });
  } catch (error) {
    logger.error('List resumable conversations error', { userId, error: (error as Error).message });

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
 * Resume a specific conversation by ID
 * POST /api/agent/resume/:conversationId
 */
export const resumeConversationById = async (req: AuthRequest, res: Response): Promise<void> => {
  const userId = req.user!.userId;
  const { conversationId } = req.params;
  const { prompt, projectId } = req.body as AgentRequestBody;

  if (!prompt) {
    res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'prompt is required' },
    });
    return;
  }

  try {
    // Get the conversation
    const conversation = await conversationRepo.findById(conversationId);

    if (!conversation) {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Conversation not found' },
      });
      return;
    }

    // Check if it has a session ID
    if (!conversation.sessionId) {
      res.status(400).json({
        success: false,
        error: { code: 'NO_SESSION', message: 'This conversation has no session to resume. Start a new conversation or use continue.' },
      });
      return;
    }

    // Get or create workspace
    const workspace = await ensureWorkspace(userId, projectId || conversation.workspacePath || 'default');

    // Log the query
    logAgentQuery(conversation.conversationId, prompt, userId);

    // Store user message
    await messageRepo.createUserMessage(conversation.conversationId, prompt);

    // Run CLI with --resume flag
    const process = cliService.resumeSession(prompt, workspace, conversation.sessionId, res);

    // Track process for cleanup
    const processId = `${userId}:resume:${conversationId}`;
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
    logger.error('Resume conversation error', { userId, conversationId, error: (error as Error).message });

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
 * Resume a conversation synchronously
 * POST /api/agent/resume/:conversationId/sync
 */
export const resumeConversationByIdSync = async (req: AuthRequest, res: Response): Promise<void> => {
  const userId = req.user!.userId;
  const { conversationId } = req.params;
  const { prompt, projectId, model } = req.body as AgentRequestBody;

  if (!prompt) {
    res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'prompt is required' },
    });
    return;
  }

  try {
    // Get the conversation
    const conversation = await conversationRepo.findById(conversationId);

    if (!conversation) {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Conversation not found' },
      });
      return;
    }

    // Check if it has a session ID
    if (!conversation.sessionId) {
      res.status(400).json({
        success: false,
        error: { code: 'NO_SESSION', message: 'This conversation has no session to resume' },
      });
      return;
    }

    // Get or create workspace
    const workspace = await ensureWorkspace(userId, projectId || conversation.workspacePath || 'default');

    // Log the query
    logAgentQuery(conversation.conversationId, prompt, userId);

    // Store user message
    await messageRepo.createUserMessage(conversation.conversationId, prompt);

    // Run CLI with --resume flag synchronously
    const result = await cliService.runCliSync(prompt, workspace, {
      resume: conversation.sessionId,
      model,
    });

    // Update session ID if changed
    if (result.sessionId && result.sessionId !== conversation.sessionId) {
      await conversationRepo.updateSessionId(conversation.conversationId, result.sessionId);
    }

    // Parse output and store assistant message
    let parsedOutput = result.output;
    try {
      parsedOutput = JSON.parse(result.output);
    } catch {
      // Keep as string if not valid JSON
    }

    await messageRepo.createAssistantMessage(
      conversation.conversationId,
      typeof parsedOutput === 'string' ? parsedOutput : JSON.stringify(parsedOutput)
    );

    res.json({
      success: result.success,
      data: {
        result: parsedOutput,
        conversationId: conversation.conversationId,
        sessionId: result.sessionId || conversation.sessionId,
      },
    });
  } catch (error) {
    logger.error('Resume conversation sync error', { userId, conversationId, error: (error as Error).message });

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
 * Get conversation details including session info for resume
 * GET /api/agent/conversations/:conversationId
 */
export const getConversationDetails = async (req: AuthRequest, res: Response): Promise<void> => {
  const { conversationId } = req.params;

  try {
    const conversation = await conversationRepo.findById(conversationId);

    if (!conversation) {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Conversation not found' },
      });
      return;
    }

    res.json({
      success: true,
      data: {
        conversationId: conversation.conversationId,
        title: conversation.title,
        workspacePath: conversation.workspacePath,
        sessionId: conversation.sessionId,
        modelUsed: conversation.modelUsed,
        isArchived: conversation.isArchived,
        isPinned: conversation.isPinned,
        totalTokensUsed: conversation.totalTokensUsed,
        totalCostUsd: conversation.totalCostUsd,
        messageCount: conversation.messageCount,
        tags: conversation.tags,
        canResume: !!conversation.sessionId,
        lastMessageAt: conversation.lastMessageAt,
        createdAt: conversation.createdAt,
        updatedAt: conversation.updatedAt,
      },
    });
  } catch (error) {
    logger.error('Get conversation details error', { conversationId, error: (error as Error).message });

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
 * Chat mode - returns tool_use for client-side execution
 * POST /api/agent/sdk/chat
 */
export const runAgentChat = async (req: AuthRequest, res: Response): Promise<void> => {
  const userId = req.user!.userId;
  const { prompt, projectId, model, systemPrompt, conversationId, messages, clientSkills } = req.body as AgentRequestBody & {
    messages?: Array<{ role: 'user' | 'assistant'; content: string }>;
  };

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
    // Enforce One Project Per User - auto-create if needed
    const project = await ensureUserProject(userId, projectId);
    const effectiveProjectId = project.projectId;

    // Ensure workspace exists
    const workspace = await ensureWorkspace(userId, effectiveProjectId);

    // Find or create conversation
    let conversation;
    let resumeSessionId: string | undefined;

    if (conversationId) {
      conversation = await conversationRepo.findById(conversationId);
      if (conversation?.sessionId) {
        resumeSessionId = conversation.sessionId;
      }
    }

    if (!conversation) {
      conversation = await conversationRepo.findOrCreateByProject(userId, effectiveProjectId, model);
    }

    // Log the query
    logAgentQuery(conversation.conversationId, prompt, userId);

    // Store user message
    await messageRepo.createUserMessage(conversation.conversationId, prompt);

    // Run chat mode (client executes tools)
    await sdkService.runChatStreaming(prompt, workspace, res, {
      model,
      systemPrompt,
      resume: resumeSessionId,
      previousMessages: messages, // Pass client-side conversation history
      clientSkills, // Pass client-side skills
    });
  } catch (error) {
    logger.error('Agent chat error', { userId, projectId, error: (error as Error).message });

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
 * Submit tool results from client
 * POST /api/agent/sdk/chat/tools
 */
export const submitToolResults = async (req: AuthRequest, res: Response): Promise<void> => {
  const userId = req.user!.userId;
  const { sessionId, toolResults, projectId, model, clientSkills } = req.body as {
    sessionId: string;
    toolResults: Array<{ tool_use_id: string; output: string; is_error: boolean }>;
    projectId?: string;
    model?: string;
    clientSkills?: AgentRequestBody['clientSkills'];
  };

  if (!sessionId || !toolResults || !Array.isArray(toolResults)) {
    res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'sessionId and toolResults are required' },
    });
    return;
  }

  try {
    // Enforce One Project Per User - auto-create if needed
    const project = await ensureUserProject(userId, projectId);
    const effectiveProjectId = project.projectId;

    // Ensure workspace exists
    const workspace = await ensureWorkspace(userId, effectiveProjectId);

    logger.info('Submitting tool results from client', {
      userId,
      sessionId,
      toolCount: toolResults.length,
    });

    // Submit tool results and continue conversation
    await sdkService.submitToolResults(sessionId, toolResults, workspace, res, {
      model,
      clientSkills,
    });
  } catch (error) {
    logger.error('Submit tool results error', { userId, sessionId, error: (error as Error).message });

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
 * Run orchestrated request - routes to Agno or Claude based on skill requirements
 * POST /api/agent/orchestrate
 */
export const runOrchestrated = async (req: AuthRequest, res: Response): Promise<void> => {
  const userId = req.user!.userId;
  const { prompt, projectId, model, systemPrompt: userSystemPrompt, maxTurns } = req.body as AgentRequestBody;

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
    // Enforce One Project Per User - auto-create if needed
    const project = await ensureUserProject(userId, projectId);
    const effectiveProjectId = project.projectId;

    // Ensure workspace exists
    const workspace = await ensureWorkspace(userId, effectiveProjectId);

    // Find or create conversation
    const conversation = await conversationRepo.findOrCreateByProject(userId, effectiveProjectId, model);

    // Log the query
    logAgentQuery(conversation.conversationId, prompt, userId);

    // Store user message
    await messageRepo.createUserMessage(conversation.conversationId, prompt);

    // Use orchestration service to analyze and potentially route to Agno
    // Eval engine is enabled by default for self-correction
    const { result, agnoResponse, evalResult } = await orchestrationService.orchestrate({
      userId,
      sessionId: conversation.conversationId,
      prompt,
      conversationId: conversation.conversationId,
      context: { projectId },
    });

    logger.info('Orchestration completed', {
      userId,
      routedTo: result.routedTo,
      skill: result.skill,
      evalRetries: evalResult?.retryCount,
      evalResearch: evalResult?.researchApplied,
    });

    if (result.routedTo === 'agno' && agnoResponse) {
      // Agno handled the request (with eval engine)
      const responseContent = agnoResponse.status === 'completed'
        ? JSON.stringify(agnoResponse.result)
        : agnoResponse.error || 'Task failed';

      await messageRepo.createAssistantMessage(
        conversation.conversationId,
        responseContent
      );

      res.json({
        success: agnoResponse.status === 'completed',
        data: {
          result: agnoResponse.result,
          conversationId: conversation.conversationId,
          routedTo: 'agno',
          skill: result.skill,
          taskId: agnoResponse.task_id,
          executionTime: agnoResponse.execution_time_ms,
          // Eval engine metadata
          eval: evalResult ? {
            retryCount: evalResult.retryCount,
            researchApplied: evalResult.researchApplied,
            needsClarification: evalResult.needsClarification,
            questions: evalResult.questions,
            learnings: evalResult.learnings,
          } : undefined,
        },
        error: agnoResponse.status === 'failed' ? {
          code: 'AGNO_ERROR',
          message: agnoResponse.error,
        } : undefined,
      });
    } else {
      // Use Claude directly with skill's system prompt if matched
      const effectiveSystemPrompt = result.systemPrompt || userSystemPrompt;

      const cliResult = await cliService.runCliSync(prompt, workspace, {
        model,
        systemPrompt: effectiveSystemPrompt,
        maxTurns,
      });

      // Update session ID if available
      if (cliResult.sessionId) {
        await conversationRepo.updateSessionId(conversation.conversationId, cliResult.sessionId);
      }

      // Parse output
      let parsedOutput = cliResult.output;
      try {
        parsedOutput = JSON.parse(cliResult.output);
      } catch {
        // Keep as string if not valid JSON
      }

      await messageRepo.createAssistantMessage(
        conversation.conversationId,
        typeof parsedOutput === 'string' ? parsedOutput : JSON.stringify(parsedOutput)
      );

      res.json({
        success: cliResult.success,
        data: {
          result: parsedOutput,
          conversationId: conversation.conversationId,
          sessionId: cliResult.sessionId,
          routedTo: 'claude',
          skill: result.skill,
        },
      });
    }
  } catch (error) {
    logger.error('Orchestrated request error', { userId, projectId, error: (error as Error).message });

    res.status(500).json({
      success: false,
      error: {
        code: 'ORCHESTRATION_ERROR',
        message: (error as Error).message,
      },
    });
  }
};

/**
 * Get available skills and their routing configuration
 * GET /api/agent/skills
 */
export const getSkills = async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const skills = orchestrationService.getAvailableSkills();
    const agnoAvailable = await orchestrationService.isAgnoAvailable();

    res.json({
      success: true,
      data: {
        skills,
        agnoAvailable,
      },
    });
  } catch (error) {
    logger.error('Get skills error', { error: (error as Error).message });

    res.status(500).json({
      success: false,
      error: {
        code: 'SKILLS_ERROR',
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
  listResumableConversations,
  resumeConversationById,
  resumeConversationByIdSync,
  getConversationDetails,
  getUsage,
  agentHealth,
  compactConversation,
  runAgentChat,
  submitToolResults,
  runOrchestrated,
  getSkills,
};
