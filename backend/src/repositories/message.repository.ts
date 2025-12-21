import { Message, IMessage, IToolCall, IToolResult } from '../models';
import { MessageCreateInput, ToolCall, ToolResult } from '../types';
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
    correlationId?: string;
  }
): Promise<IMessage> => {
  try {
    // Convert ToolCall format to IToolCall format
    const toolCalls: IToolCall[] = input.toolCalls?.map(tc => ({
      id: tc.tool_use_id,
      type: 'function',
      function: {
        name: tc.tool_name,
        arguments: JSON.stringify(tc.tool_input),
      },
    })) || [];

    const message = new Message({
      messageId: generateUUID(),
      conversationId,
      role: input.role,
      content: input.content,
      tokensInput: input.tokensInput || 0,
      tokensOutput: input.tokensOutput || 0,
      modelUsed: input.model || 'anthropic/claude-sonnet-4',
      costUsd: input.costUsd || 0,
      toolCalls,
      correlationId: input.correlationId || '',
    });

    await message.save();
    logger.info('Message created', { messageId: message.messageId, conversationId, role: input.role });
    return message;
  } catch (error) {
    logger.error('Failed to create message', { conversationId, error });
    throw error;
  }
};

/**
 * Find message by ID
 */
export const findById = async (messageId: string): Promise<IMessage | null> => {
  try {
    return await Message.findOne({ messageId });
  } catch (error) {
    logger.error('Failed to find message', { messageId, error });
    throw error;
  }
};

/**
 * Find message by correlation ID
 */
export const findByCorrelationId = async (correlationId: string): Promise<IMessage | null> => {
  try {
    return await Message.findOne({ correlationId });
  } catch (error) {
    logger.error('Failed to find message by correlation ID', { correlationId, error });
    throw error;
  }
};

/**
 * Find all messages for a conversation
 */
export const findByConversation = async (
  conversationId: string,
  options: { limit?: number; offset?: number; order?: 'asc' | 'desc' } = {}
): Promise<IMessage[]> => {
  const { limit = 100, offset = 0, order = 'asc' } = options;

  try {
    return await Message.find({ conversationId })
      .sort({ createdAt: order === 'asc' ? 1 : -1 })
      .skip(offset)
      .limit(limit);
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
): Promise<IMessage[]> => {
  try {
    const messages = await Message.find({ conversationId })
      .sort({ createdAt: -1 })
      .limit(count);

    // Reverse to get chronological order
    return messages.reverse();
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
): Promise<IMessage | null> => {
  try {
    // Convert ToolResult format to IToolResult format
    const results: IToolResult[] = toolResults.map(tr => ({
      toolCallId: tr.tool_use_id,
      result: tr.output,
      isError: tr.is_error,
    }));

    const message = await Message.findOneAndUpdate(
      { messageId },
      { $set: { toolResults: results } },
      { new: true }
    );
    return message;
  } catch (error) {
    logger.error('Failed to update tool results', { messageId, error });
    throw error;
  }
};

/**
 * Count messages in a conversation
 */
export const countByConversation = async (conversationId: string): Promise<number> => {
  try {
    return await Message.countDocuments({ conversationId });
  } catch (error) {
    logger.error('Failed to count messages', { conversationId, error });
    throw error;
  }
};

/**
 * Delete all messages in a conversation
 */
export const deleteByConversation = async (conversationId: string): Promise<number> => {
  try {
    const result = await Message.deleteMany({ conversationId });
    return result.deletedCount;
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
  correlationId?: string
): Promise<IMessage> => {
  return create(conversationId, {
    role: 'user',
    content,
    correlationId,
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
    correlationId?: string;
  } = {}
): Promise<IMessage> => {
  return create(conversationId, {
    role: 'assistant',
    content,
    ...options,
  });
};

/**
 * Delete a single message
 */
export const deleteMessage = async (messageId: string): Promise<boolean> => {
  try {
    const result = await Message.deleteOne({ messageId });
    return result.deletedCount > 0;
  } catch (error) {
    logger.error('Failed to delete message', { messageId, error });
    throw error;
  }
};

export default {
  create,
  findById,
  findByCorrelationId,
  findByConversation,
  getLastMessages,
  updateToolResults,
  countByConversation,
  deleteByConversation,
  createUserMessage,
  createAssistantMessage,
  delete: deleteMessage,
};
