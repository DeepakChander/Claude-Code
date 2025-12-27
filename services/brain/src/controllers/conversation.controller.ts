// Conversation Controller
// Handles all conversation management endpoints

import { Request, Response } from 'express';
import conversationRepo from '../repositories/conversation.repository';
import messageRepo from '../repositories/message.repository';
import { generateTitleFromMessage, needsTitleGeneration } from '../services/title-generation.service';
import logger from '../utils/logger';

// Extend Request to include user from auth middleware
interface AuthenticatedRequest extends Request {
  user?: {
    userId: string;
    email?: string;
  };
}

/**
 * GET /api/conversations
 * List all conversations for the authenticated user
 */
export const listConversations = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      res.status(401).json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
      });
      return;
    }

    // Parse query parameters
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
    const offset = parseInt(req.query.offset as string) || 0;
    const archived = req.query.archived === 'true';
    const sortBy = (req.query.sortBy as string) || 'lastMessageAt';
    const sortOrder = (req.query.sortOrder as string) || 'desc';

    logger.info('Listing conversations', { userId, limit, offset, archived });

    // Get conversations
    const conversations = await conversationRepo.findByUser(userId, {
      archived,
      limit,
      offset,
    });

    // Get total count for pagination
    const total = await conversationRepo.countByUser(userId, archived);

    // Map to response format
    const conversationList = conversations.map((conv) => ({
      conversationId: conv.conversationId,
      sessionId: conv.sessionId,
      projectId: conv.projectId,
      title: conv.title,
      messageCount: conv.messageCount,
      lastMessageAt: conv.lastMessageAt,
      createdAt: conv.createdAt,
      isArchived: conv.isArchived,
      isPinned: conv.isPinned,
      modelUsed: conv.modelUsed,
    }));

    // Sort if needed (already sorted by lastMessageAt in repo, but handle other fields)
    if (sortBy !== 'lastMessageAt') {
      conversationList.sort((a, b) => {
        const aVal = a[sortBy as keyof typeof a];
        const bVal = b[sortBy as keyof typeof b];
        if (sortOrder === 'asc') {
          return aVal > bVal ? 1 : -1;
        }
        return aVal < bVal ? 1 : -1;
      });
    }

    res.json({
      success: true,
      data: {
        conversations: conversationList,
        pagination: {
          total,
          limit,
          offset,
          hasMore: offset + conversations.length < total,
        },
      },
    });
  } catch (error) {
    logger.error('Failed to list conversations', { error: (error as Error).message });
    res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: 'Failed to retrieve conversations' },
    });
  }
};

/**
 * GET /api/conversations/:conversationId
 * Get a single conversation with optional messages
 */
export const getConversation = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      res.status(401).json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
      });
      return;
    }

    const { conversationId } = req.params;
    const includeMessages = req.query.includeMessages !== 'false';
    const messageLimit = Math.min(parseInt(req.query.messageLimit as string) || 100, 500);

    logger.info('Getting conversation', { userId, conversationId, includeMessages });

    // Find conversation
    const conversation = await conversationRepo.findById(conversationId);

    if (!conversation) {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Conversation not found' },
      });
      return;
    }

    // Check ownership
    if (conversation.userId !== userId) {
      res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: 'You do not have access to this conversation' },
      });
      return;
    }

    // Build response
    const responseData: Record<string, unknown> = {
      conversation: {
        conversationId: conversation.conversationId,
        sessionId: conversation.sessionId,
        projectId: conversation.projectId,
        title: conversation.title,
        messageCount: conversation.messageCount,
        totalTokensUsed: conversation.totalTokensUsed,
        totalCostUsd: conversation.totalCostUsd,
        lastMessageAt: conversation.lastMessageAt,
        createdAt: conversation.createdAt,
        updatedAt: conversation.updatedAt,
        isArchived: conversation.isArchived,
        isPinned: conversation.isPinned,
        modelUsed: conversation.modelUsed,
        tags: conversation.tags,
      },
    };

    // Include messages if requested
    if (includeMessages) {
      const messages = await messageRepo.findByConversation(conversationId, {
        limit: messageLimit,
        order: 'asc',
      });

      responseData.messages = messages.map((msg) => ({
        messageId: msg.messageId,
        role: msg.role,
        content: msg.content,
        createdAt: msg.createdAt,
        tokensInput: msg.tokensInput,
        tokensOutput: msg.tokensOutput,
      }));
    }

    res.json({
      success: true,
      data: responseData,
    });
  } catch (error) {
    logger.error('Failed to get conversation', { error: (error as Error).message });
    res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: 'Failed to retrieve conversation' },
    });
  }
};

/**
 * POST /api/conversations/:conversationId/generate-title
 * Generate AI-powered title for a conversation
 */
export const generateTitle = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      res.status(401).json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
      });
      return;
    }

    const { conversationId } = req.params;
    const regenerate = req.body?.regenerate === true;

    logger.info('Generating title', { userId, conversationId, regenerate });

    // Find conversation
    const conversation = await conversationRepo.findById(conversationId);

    if (!conversation) {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Conversation not found' },
      });
      return;
    }

    // Check ownership
    if (conversation.userId !== userId) {
      res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: 'You do not have access to this conversation' },
      });
      return;
    }

    // Check if title already exists and regenerate not requested
    if (!needsTitleGeneration(conversation.title) && !regenerate) {
      res.status(409).json({
        success: false,
        error: {
          code: 'TITLE_EXISTS',
          message: 'Title already exists. Set regenerate=true to generate a new one.',
        },
        data: {
          currentTitle: conversation.title,
        },
      });
      return;
    }

    // Get first user message
    const messages = await messageRepo.findByConversation(conversationId, {
      limit: 5,
      order: 'asc',
    });

    const firstUserMessage = messages.find((m) => m.role === 'user');

    if (!firstUserMessage) {
      res.status(400).json({
        success: false,
        error: { code: 'NO_MESSAGES', message: 'Cannot generate title: no user messages found' },
      });
      return;
    }

    // Generate title
    const previousTitle = conversation.title;
    const result = await generateTitleFromMessage(firstUserMessage.content);

    // Save to database
    await conversationRepo.update(conversationId, { title: result.title });

    logger.info('Title generated successfully', {
      conversationId,
      title: result.title,
      model: result.model,
    });

    res.json({
      success: true,
      data: {
        conversationId,
        title: result.title,
        previousTitle,
        generatedAt: result.generatedAt,
        model: result.model,
      },
    });
  } catch (error) {
    logger.error('Failed to generate title', { error: (error as Error).message });
    res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: 'Failed to generate title' },
    });
  }
};

/**
 * PUT /api/conversations/:conversationId/title
 * Update conversation title manually
 */
export const updateTitle = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      res.status(401).json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
      });
      return;
    }

    const { conversationId } = req.params;
    const { title } = req.body;

    // Validate title
    if (!title || typeof title !== 'string') {
      res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Title is required' },
      });
      return;
    }

    if (title.length < 1 || title.length > 100) {
      res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Title must be between 1 and 100 characters' },
      });
      return;
    }

    logger.info('Updating title', { userId, conversationId, title });

    // Find conversation
    const conversation = await conversationRepo.findById(conversationId);

    if (!conversation) {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Conversation not found' },
      });
      return;
    }

    // Check ownership
    if (conversation.userId !== userId) {
      res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: 'You do not have access to this conversation' },
      });
      return;
    }

    // Update title
    await conversationRepo.update(conversationId, { title });

    res.json({
      success: true,
      data: {
        conversationId,
        title,
        updatedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    logger.error('Failed to update title', { error: (error as Error).message });
    res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: 'Failed to update title' },
    });
  }
};

/**
 * PATCH /api/conversations/:conversationId
 * Update conversation properties (archive, pin)
 */
export const updateConversation = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      res.status(401).json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
      });
      return;
    }

    const { conversationId } = req.params;
    const { isArchived, isPinned } = req.body;

    logger.info('Updating conversation', { userId, conversationId, isArchived, isPinned });

    // Find conversation
    const conversation = await conversationRepo.findById(conversationId);

    if (!conversation) {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Conversation not found' },
      });
      return;
    }

    // Check ownership
    if (conversation.userId !== userId) {
      res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: 'You do not have access to this conversation' },
      });
      return;
    }

    // Build update object
    const updateData: { is_archived?: boolean; is_pinned?: boolean } = {};
    if (typeof isArchived === 'boolean') updateData.is_archived = isArchived;
    if (typeof isPinned === 'boolean') updateData.is_pinned = isPinned;

    if (Object.keys(updateData).length === 0) {
      res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'No valid fields to update' },
      });
      return;
    }

    // Update conversation
    const updated = await conversationRepo.update(conversationId, updateData);

    res.json({
      success: true,
      data: {
        conversationId,
        isArchived: updated?.isArchived,
        isPinned: updated?.isPinned,
        updatedAt: updated?.updatedAt,
      },
    });
  } catch (error) {
    logger.error('Failed to update conversation', { error: (error as Error).message });
    res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: 'Failed to update conversation' },
    });
  }
};

/**
 * DELETE /api/conversations/:conversationId
 * Delete or archive a conversation
 */
export const deleteConversation = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      res.status(401).json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
      });
      return;
    }

    const { conversationId } = req.params;
    const permanent = req.query.permanent === 'true';

    logger.info('Deleting conversation', { userId, conversationId, permanent });

    // Find conversation
    const conversation = await conversationRepo.findById(conversationId);

    if (!conversation) {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Conversation not found' },
      });
      return;
    }

    // Check ownership
    if (conversation.userId !== userId) {
      res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: 'You do not have access to this conversation' },
      });
      return;
    }

    if (permanent) {
      // Delete messages first
      await messageRepo.deleteByConversation(conversationId);
      // Then delete conversation
      await conversationRepo.delete(conversationId);

      res.json({
        success: true,
        data: {
          conversationId,
          action: 'deleted',
          deletedAt: new Date().toISOString(),
        },
      });
    } else {
      // Soft delete (archive)
      await conversationRepo.archive(conversationId);

      res.json({
        success: true,
        data: {
          conversationId,
          action: 'archived',
          deletedAt: new Date().toISOString(),
        },
      });
    }
  } catch (error) {
    logger.error('Failed to delete conversation', { error: (error as Error).message });
    res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: 'Failed to delete conversation' },
    });
  }
};

export default {
  listConversations,
  getConversation,
  generateTitle,
  updateTitle,
  updateConversation,
  deleteConversation,
};
