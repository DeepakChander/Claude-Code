import { Conversation, IConversation } from '../models';
import { ConversationCreateInput, ConversationUpdateInput } from '../types';
import { generateUUID } from '../utils/helpers';
import logger from '../utils/logger';

/**
 * Create a new conversation
 */
export const create = async (
  userId: string,
  input: ConversationCreateInput
): Promise<IConversation> => {
  try {
    const conversation = new Conversation({
      conversationId: generateUUID(),
      userId,
      projectId: input.projectId || input.workspace_path || 'default',
      title: input.title || 'New Conversation',
      workspacePath: input.workspace_path || '',
      modelUsed: input.model || 'anthropic/claude-sonnet-4',
      tags: input.tags || [],
    });

    await conversation.save();
    logger.info('Conversation created', { conversationId: conversation.conversationId, userId });
    return conversation;
  } catch (error) {
    logger.error('Failed to create conversation', { userId, error });
    throw error;
  }
};

/**
 * Find conversation by ID
 */
export const findById = async (conversationId: string): Promise<IConversation | null> => {
  try {
    return await Conversation.findOne({ conversationId });
  } catch (error) {
    logger.error('Failed to find conversation', { conversationId, error });
    throw error;
  }
};

/**
 * Find conversation by session ID (for resume functionality)
 */
export const findBySessionId = async (sessionId: string): Promise<IConversation | null> => {
  try {
    return await Conversation.findOne({ sessionId, isArchived: false });
  } catch (error) {
    logger.error('Failed to find conversation by session ID', { sessionId, error });
    throw error;
  }
};

/**
 * Find or create conversation for user + project
 */
export const findOrCreateByProject = async (
  userId: string,
  projectId: string,
  model?: string
): Promise<IConversation> => {
  try {
    // First try to find existing
    const existing = await Conversation.findOne({
      userId,
      workspacePath: projectId,
      isArchived: false,
    }).sort({ updatedAt: -1 });

    if (existing) {
      return existing;
    }

    // Create new conversation
    return await create(userId, {
      title: `Project: ${projectId}`,
      workspace_path: projectId,
      model: model,
    });
  } catch (error) {
    logger.error('Failed to find or create conversation', { userId, projectId, error });
    throw error;
  }
};

/**
 * Find conversation by user and project (without creating)
 */
export const findByUserAndProject = async (
  userId: string,
  projectId: string
): Promise<IConversation | null> => {
  try {
    return await Conversation.findOne({
      userId,
      workspacePath: projectId,
      isArchived: false,
    }).sort({ updatedAt: -1 });
  } catch (error) {
    logger.error('Failed to find conversation by project', { userId, projectId, error });
    throw error;
  }
};

/**
 * Find all conversations for a user
 */
export const findByUser = async (
  userId: string,
  options: { archived?: boolean; limit?: number; offset?: number } = {}
): Promise<IConversation[]> => {
  const { archived = false, limit = 50, offset = 0 } = options;

  try {
    return await Conversation.find({ userId, isArchived: archived })
      .sort({ lastMessageAt: -1, updatedAt: -1 })
      .skip(offset)
      .limit(limit);
  } catch (error) {
    logger.error('Failed to find user conversations', { userId, error });
    throw error;
  }
};

/**
 * Find all resumable conversations for a user (those with sessionId)
 */
export const findResumable = async (
  userId: string,
  options: { limit?: number; offset?: number } = {}
): Promise<IConversation[]> => {
  const { limit = 20, offset = 0 } = options;

  try {
    return await Conversation.find({
      userId,
      sessionId: { $exists: true, $ne: '' },
      isArchived: false,
    })
      .sort({ lastMessageAt: -1 })
      .skip(offset)
      .limit(limit);
  } catch (error) {
    logger.error('Failed to find resumable conversations', { userId, error });
    throw error;
  }
};

/**
 * Update conversation
 */
export const update = async (
  conversationId: string,
  input: ConversationUpdateInput
): Promise<IConversation | null> => {
  try {
    const updateData: Record<string, unknown> = { updatedAt: new Date() };

    if (input.title !== undefined) updateData.title = input.title;
    if (input.description !== undefined) updateData.description = input.description;
    if (input.is_archived !== undefined) updateData.isArchived = input.is_archived;
    if (input.is_pinned !== undefined) updateData.isPinned = input.is_pinned;
    if (input.tags !== undefined) updateData.tags = input.tags;
    if (input.metadata !== undefined) updateData.metadata = input.metadata;

    const conversation = await Conversation.findOneAndUpdate(
      { conversationId },
      { $set: updateData },
      { new: true }
    );

    if (conversation) {
      logger.info('Conversation updated', { conversationId });
    }
    return conversation;
  } catch (error) {
    logger.error('Failed to update conversation', { conversationId, error });
    throw error;
  }
};

/**
 * Update session ID for Claude --resume functionality
 */
export const updateSessionId = async (
  conversationId: string,
  sessionId: string
): Promise<void> => {
  try {
    await Conversation.updateOne(
      { conversationId },
      { $set: { sessionId, updatedAt: new Date() } }
    );
    logger.info('Session ID updated', { conversationId, sessionId });
  } catch (error) {
    logger.error('Failed to update session ID', { conversationId, error });
    throw error;
  }
};

/**
 * Update token usage and cost
 */
export const updateTokenUsage = async (
  conversationId: string,
  tokensInput: number,
  tokensOutput: number,
  costUsd: number
): Promise<void> => {
  try {
    await Conversation.updateOne(
      { conversationId },
      {
        $inc: {
          totalTokensUsed: tokensInput + tokensOutput,
          totalCostUsd: costUsd,
          messageCount: 1,
        },
        $set: {
          lastMessageAt: new Date(),
          updatedAt: new Date(),
        },
      }
    );
  } catch (error) {
    logger.error('Failed to update token usage', { conversationId, error });
    throw error;
  }
};

/**
 * Update model used
 */
export const updateModel = async (
  conversationId: string,
  model: string
): Promise<void> => {
  try {
    await Conversation.updateOne(
      { conversationId },
      { $set: { modelUsed: model, updatedAt: new Date() } }
    );
  } catch (error) {
    logger.error('Failed to update model', { conversationId, error });
    throw error;
  }
};

/**
 * Delete conversation
 */
export const deleteConversation = async (conversationId: string): Promise<boolean> => {
  try {
    const result = await Conversation.deleteOne({ conversationId });
    return result.deletedCount > 0;
  } catch (error) {
    logger.error('Failed to delete conversation', { conversationId, error });
    throw error;
  }
};

/**
 * Archive conversation
 */
export const archive = async (conversationId: string): Promise<IConversation | null> => {
  return update(conversationId, { is_archived: true });
};

/**
 * Pin conversation
 */
export const pin = async (conversationId: string, pinned: boolean = true): Promise<IConversation | null> => {
  return update(conversationId, { is_pinned: pinned });
};

/**
 * Count conversations for a user
 */
export const countByUser = async (userId: string, archived: boolean = false): Promise<number> => {
  try {
    return await Conversation.countDocuments({ userId, isArchived: archived });
  } catch (error) {
    logger.error('Failed to count user conversations', { userId, error });
    throw error;
  }
};

export default {
  create,
  findById,
  findBySessionId,
  findOrCreateByProject,
  findByUserAndProject,
  findByUser,
  findResumable,
  update,
  updateSessionId,
  updateTokenUsage,
  updateModel,
  delete: deleteConversation,
  archive,
  pin,
  countByUser,
};
