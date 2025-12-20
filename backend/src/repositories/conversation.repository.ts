import { pool } from '../config/database';
import { Conversation, ConversationCreateInput, ConversationUpdateInput } from '../types';
import { generateUUID } from '../utils/helpers';
import logger from '../utils/logger';

/**
 * Create a new conversation
 */
export const create = async (
  userId: string,
  input: ConversationCreateInput
): Promise<Conversation> => {
  const conversationId = generateUUID();
  const now = new Date();

  const query = `
    INSERT INTO conversations (
      conversation_id, user_id, title, description, workspace_path,
      model_used, tags, metadata, created_at, updated_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    RETURNING *
  `;

  const values = [
    conversationId,
    userId,
    input.title || null,
    input.description || null,
    input.workspace_path || null,
    input.model || 'anthropic/claude-sonnet-4.5',
    input.tags || [],
    input.metadata || {},
    now,
    now,
  ];

  try {
    const result = await pool.query(query, values);
    logger.info('Conversation created', { conversationId, userId });
    return result.rows[0];
  } catch (error) {
    logger.error('Failed to create conversation', { userId, error });
    throw error;
  }
};

/**
 * Find conversation by ID
 */
export const findById = async (conversationId: string): Promise<Conversation | null> => {
  const query = 'SELECT * FROM conversations WHERE conversation_id = $1';

  try {
    const result = await pool.query(query, [conversationId]);
    return result.rows[0] || null;
  } catch (error) {
    logger.error('Failed to find conversation', { conversationId, error });
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
): Promise<Conversation> => {
  // First try to find existing
  const findQuery = `
    SELECT * FROM conversations
    WHERE user_id = $1 AND workspace_path = $2 AND is_archived = false
    ORDER BY updated_at DESC
    LIMIT 1
  `;

  try {
    const result = await pool.query(findQuery, [userId, projectId]);

    if (result.rows[0]) {
      return result.rows[0];
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
): Promise<Conversation | null> => {
  const query = `
    SELECT * FROM conversations
    WHERE user_id = $1 AND workspace_path = $2 AND is_archived = false
    ORDER BY updated_at DESC
    LIMIT 1
  `;

  try {
    const result = await pool.query(query, [userId, projectId]);
    return result.rows[0] || null;
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
): Promise<Conversation[]> => {
  const { archived = false, limit = 50, offset = 0 } = options;

  const query = `
    SELECT * FROM conversations
    WHERE user_id = $1 AND is_archived = $2
    ORDER BY updated_at DESC
    LIMIT $3 OFFSET $4
  `;

  try {
    const result = await pool.query(query, [userId, archived, limit, offset]);
    return result.rows;
  } catch (error) {
    logger.error('Failed to find user conversations', { userId, error });
    throw error;
  }
};

/**
 * Update conversation
 */
export const update = async (
  conversationId: string,
  input: ConversationUpdateInput
): Promise<Conversation | null> => {
  const fields: string[] = [];
  const values: unknown[] = [];
  let paramCount = 1;

  if (input.title !== undefined) {
    fields.push(`title = $${paramCount++}`);
    values.push(input.title);
  }
  if (input.description !== undefined) {
    fields.push(`description = $${paramCount++}`);
    values.push(input.description);
  }
  if (input.is_archived !== undefined) {
    fields.push(`is_archived = $${paramCount++}`);
    values.push(input.is_archived);
  }
  if (input.is_pinned !== undefined) {
    fields.push(`is_pinned = $${paramCount++}`);
    values.push(input.is_pinned);
  }
  if (input.tags !== undefined) {
    fields.push(`tags = $${paramCount++}`);
    values.push(input.tags);
  }
  if (input.metadata !== undefined) {
    fields.push(`metadata = $${paramCount++}`);
    values.push(input.metadata);
  }

  if (fields.length === 0) {
    return findById(conversationId);
  }

  fields.push(`updated_at = $${paramCount++}`);
  values.push(new Date());

  values.push(conversationId);

  const query = `
    UPDATE conversations
    SET ${fields.join(', ')}
    WHERE conversation_id = $${paramCount}
    RETURNING *
  `;

  try {
    const result = await pool.query(query, values);
    return result.rows[0] || null;
  } catch (error) {
    logger.error('Failed to update conversation', { conversationId, error });
    throw error;
  }
};

/**
 * Update session ID for Claude --continue functionality
 */
export const updateSessionId = async (
  conversationId: string,
  sessionId: string
): Promise<void> => {
  const query = `
    UPDATE conversations
    SET session_id = $1, updated_at = $2
    WHERE conversation_id = $3
  `;

  try {
    await pool.query(query, [sessionId, new Date(), conversationId]);
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
  const query = `
    UPDATE conversations
    SET
      total_tokens_used = total_tokens_used + $1,
      total_cost_usd = total_cost_usd + $2,
      message_count = message_count + 1,
      last_message_at = $3,
      updated_at = $3
    WHERE conversation_id = $4
  `;

  try {
    await pool.query(query, [
      tokensInput + tokensOutput,
      costUsd,
      new Date(),
      conversationId,
    ]);
  } catch (error) {
    logger.error('Failed to update token usage', { conversationId, error });
    throw error;
  }
};

/**
 * Delete conversation
 */
export const deleteConversation = async (conversationId: string): Promise<boolean> => {
  const query = 'DELETE FROM conversations WHERE conversation_id = $1';

  try {
    const result = await pool.query(query, [conversationId]);
    return (result.rowCount ?? 0) > 0;
  } catch (error) {
    logger.error('Failed to delete conversation', { conversationId, error });
    throw error;
  }
};

export default {
  create,
  findById,
  findOrCreateByProject,
  findByUserAndProject,
  findByUser,
  update,
  updateSessionId,
  updateTokenUsage,
  delete: deleteConversation,
};
