import { pool } from '../config/database';
import { Message, MessageCreateInput, ToolCall, ToolResult } from '../types';
import { generateUUID } from '../utils/helpers';
import logger from '../utils/logger';

/**
 * Create a new message
 */
export const create = async (
  conversationId: string,
  input: MessageCreateInput & {
    toolCalls?: ToolCall[];
    tokensInput?: number;
    tokensOutput?: number;
    model?: string;
    costUsd?: number;
    latencyMs?: number;
  }
): Promise<Message> => {
  const messageId = generateUUID();
  const now = new Date();

  const query = `
    INSERT INTO messages (
      message_id, conversation_id, parent_message_id, role, content,
      content_type, tool_calls, tokens_input, tokens_output,
      model_used, cost_usd, latency_ms, is_error, created_at, metadata
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
    RETURNING *
  `;

  const values = [
    messageId,
    conversationId,
    input.parent_message_id || null,
    input.role,
    input.content,
    input.content_type || 'text',
    input.toolCalls ? JSON.stringify(input.toolCalls) : null,
    input.tokensInput || null,
    input.tokensOutput || null,
    input.model || null,
    input.costUsd || null,
    input.latencyMs || null,
    false,
    now,
    input.metadata || {},
  ];

  try {
    const result = await pool.query(query, values);
    logger.info('Message created', { messageId, conversationId, role: input.role });
    return result.rows[0];
  } catch (error) {
    logger.error('Failed to create message', { conversationId, error });
    throw error;
  }
};

/**
 * Find message by ID
 */
export const findById = async (messageId: string): Promise<Message | null> => {
  const query = 'SELECT * FROM messages WHERE message_id = $1';

  try {
    const result = await pool.query(query, [messageId]);
    return result.rows[0] || null;
  } catch (error) {
    logger.error('Failed to find message', { messageId, error });
    throw error;
  }
};

/**
 * Find all messages for a conversation
 */
export const findByConversation = async (
  conversationId: string,
  options: { limit?: number; offset?: number; order?: 'asc' | 'desc' } = {}
): Promise<Message[]> => {
  const { limit = 100, offset = 0, order = 'asc' } = options;

  const query = `
    SELECT * FROM messages
    WHERE conversation_id = $1
    ORDER BY created_at ${order === 'asc' ? 'ASC' : 'DESC'}
    LIMIT $2 OFFSET $3
  `;

  try {
    const result = await pool.query(query, [conversationId, limit, offset]);
    return result.rows;
  } catch (error) {
    logger.error('Failed to find messages', { conversationId, error });
    throw error;
  }
};

/**
 * Get the last N messages for a conversation
 */
export const getLastMessages = async (
  conversationId: string,
  count: number = 10
): Promise<Message[]> => {
  const query = `
    SELECT * FROM (
      SELECT * FROM messages
      WHERE conversation_id = $1
      ORDER BY created_at DESC
      LIMIT $2
    ) sub
    ORDER BY created_at ASC
  `;

  try {
    const result = await pool.query(query, [conversationId, count]);
    return result.rows;
  } catch (error) {
    logger.error('Failed to get last messages', { conversationId, error });
    throw error;
  }
};

/**
 * Update tool results for a message
 */
export const updateToolResults = async (
  messageId: string,
  toolResults: ToolResult[]
): Promise<Message | null> => {
  const query = `
    UPDATE messages
    SET tool_results = $1
    WHERE message_id = $2
    RETURNING *
  `;

  try {
    const result = await pool.query(query, [JSON.stringify(toolResults), messageId]);
    return result.rows[0] || null;
  } catch (error) {
    logger.error('Failed to update tool results', { messageId, error });
    throw error;
  }
};

/**
 * Mark message as error
 */
export const markAsError = async (
  messageId: string,
  errorMessage: string
): Promise<Message | null> => {
  const query = `
    UPDATE messages
    SET is_error = true, error_message = $1
    WHERE message_id = $2
    RETURNING *
  `;

  try {
    const result = await pool.query(query, [errorMessage, messageId]);
    return result.rows[0] || null;
  } catch (error) {
    logger.error('Failed to mark message as error', { messageId, error });
    throw error;
  }
};

/**
 * Count messages in a conversation
 */
export const countByConversation = async (conversationId: string): Promise<number> => {
  const query = 'SELECT COUNT(*) FROM messages WHERE conversation_id = $1';

  try {
    const result = await pool.query(query, [conversationId]);
    return parseInt(result.rows[0].count, 10);
  } catch (error) {
    logger.error('Failed to count messages', { conversationId, error });
    throw error;
  }
};

/**
 * Delete all messages in a conversation
 */
export const deleteByConversation = async (conversationId: string): Promise<number> => {
  const query = 'DELETE FROM messages WHERE conversation_id = $1';

  try {
    const result = await pool.query(query, [conversationId]);
    return result.rowCount ?? 0;
  } catch (error) {
    logger.error('Failed to delete messages', { conversationId, error });
    throw error;
  }
};

/**
 * Create user message helper
 */
export const createUserMessage = async (
  conversationId: string,
  content: string,
  metadata?: Record<string, unknown>
): Promise<Message> => {
  return create(conversationId, {
    role: 'user',
    content,
    content_type: 'text',
    metadata,
  });
};

/**
 * Create assistant message helper
 */
export const createAssistantMessage = async (
  conversationId: string,
  content: string,
  options: {
    toolCalls?: ToolCall[];
    tokensInput?: number;
    tokensOutput?: number;
    model?: string;
    costUsd?: number;
    latencyMs?: number;
    metadata?: Record<string, unknown>;
  } = {}
): Promise<Message> => {
  return create(conversationId, {
    role: 'assistant',
    content,
    content_type: 'text',
    ...options,
  });
};

export default {
  create,
  findById,
  findByConversation,
  getLastMessages,
  updateToolResults,
  markAsError,
  countByConversation,
  deleteByConversation,
  createUserMessage,
  createAssistantMessage,
};
