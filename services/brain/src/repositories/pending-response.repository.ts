import { PendingResponse, IPendingResponse, IRequestPayload, IResponseData, PendingResponseStatus } from '../models';
import { generateUUID } from '../utils/helpers';
import logger from '../utils/logger';

const TTL_HOURS = parseInt(process.env.PENDING_RESPONSE_TTL_HOURS || '24', 10);

/**
 * Create a new pending response
 */
export const create = async (
  userId: string,
  conversationId: string,
  requestPayload: IRequestPayload
): Promise<IPendingResponse> => {
  try {
    const pendingResponse = new PendingResponse({
      correlationId: generateUUID(),
      userId,
      conversationId,
      requestPayload,
      status: 'pending',
      expiresAt: new Date(Date.now() + TTL_HOURS * 60 * 60 * 1000),
    });

    await pendingResponse.save();
    logger.info('Pending response created', {
      correlationId: pendingResponse.correlationId,
      userId,
      conversationId,
    });
    return pendingResponse;
  } catch (error) {
    logger.error('Failed to create pending response', { userId, conversationId, error });
    throw error;
  }
};

/**
 * Find by correlation ID
 */
export const findByCorrelationId = async (correlationId: string): Promise<IPendingResponse | null> => {
  try {
    return await PendingResponse.findOne({ correlationId });
  } catch (error) {
    logger.error('Failed to find pending response', { correlationId, error });
    throw error;
  }
};

/**
 * Find all pending/completed responses for a user
 */
export const findByUser = async (
  userId: string,
  options: { status?: PendingResponseStatus[]; limit?: number; offset?: number } = {}
): Promise<IPendingResponse[]> => {
  const { status = ['pending', 'processing', 'completed'], limit = 50, offset = 0 } = options;

  try {
    return await PendingResponse.find({
      userId,
      status: { $in: status },
      expiresAt: { $gt: new Date() },
    })
      .sort({ createdAt: -1 })
      .skip(offset)
      .limit(limit);
  } catch (error) {
    logger.error('Failed to find pending responses by user', { userId, error });
    throw error;
  }
};

/**
 * Find completed (undelivered) responses for a user
 */
export const findCompletedByUser = async (
  userId: string,
  limit: number = 50
): Promise<IPendingResponse[]> => {
  try {
    return await PendingResponse.find({
      userId,
      status: 'completed',
      expiresAt: { $gt: new Date() },
    })
      .sort({ createdAt: -1 })
      .limit(limit);
  } catch (error) {
    logger.error('Failed to find completed responses', { userId, error });
    throw error;
  }
};

/**
 * Find unprocessed pending responses (for worker polling)
 */
export const findUnprocessed = async (limit: number = 10): Promise<IPendingResponse[]> => {
  try {
    return await PendingResponse.find({
      status: 'pending',
      expiresAt: { $gt: new Date() },
    })
      .sort({ createdAt: 1 })
      .limit(limit);
  } catch (error) {
    logger.error('Failed to find unprocessed responses', { error });
    throw error;
  }
};

/**
 * Mark as processing
 */
export const markAsProcessing = async (correlationId: string): Promise<IPendingResponse | null> => {
  try {
    const pendingResponse = await PendingResponse.findOneAndUpdate(
      { correlationId, status: 'pending' },
      {
        $set: {
          status: 'processing',
          processingStartedAt: new Date(),
        },
      },
      { new: true }
    );

    if (pendingResponse) {
      logger.info('Pending response marked as processing', { correlationId });
    }
    return pendingResponse;
  } catch (error) {
    logger.error('Failed to mark as processing', { correlationId, error });
    throw error;
  }
};

/**
 * Mark as completed with response data
 */
export const markAsCompleted = async (
  correlationId: string,
  responseData: IResponseData
): Promise<IPendingResponse | null> => {
  try {
    const pendingResponse = await PendingResponse.findOneAndUpdate(
      { correlationId },
      {
        $set: {
          status: 'completed',
          response: responseData,
          processingCompletedAt: new Date(),
        },
      },
      { new: true }
    );

    if (pendingResponse) {
      logger.info('Pending response marked as completed', { correlationId });
    }
    return pendingResponse;
  } catch (error) {
    logger.error('Failed to mark as completed', { correlationId, error });
    throw error;
  }
};

/**
 * Mark as delivered
 */
export const markAsDelivered = async (correlationId: string): Promise<IPendingResponse | null> => {
  try {
    const pendingResponse = await PendingResponse.findOneAndUpdate(
      { correlationId, status: 'completed' },
      {
        $set: {
          status: 'delivered',
          deliveredAt: new Date(),
        },
      },
      { new: true }
    );

    if (pendingResponse) {
      logger.info('Pending response marked as delivered', { correlationId });
    }
    return pendingResponse;
  } catch (error) {
    logger.error('Failed to mark as delivered', { correlationId, error });
    throw error;
  }
};

/**
 * Mark multiple as delivered
 */
export const markManyAsDelivered = async (correlationIds: string[]): Promise<number> => {
  try {
    const result = await PendingResponse.updateMany(
      { correlationId: { $in: correlationIds }, status: 'completed' },
      {
        $set: {
          status: 'delivered',
          deliveredAt: new Date(),
        },
      }
    );

    logger.info('Pending responses marked as delivered', { count: result.modifiedCount });
    return result.modifiedCount;
  } catch (error) {
    logger.error('Failed to mark many as delivered', { correlationIds, error });
    throw error;
  }
};

/**
 * Mark as failed
 */
export const markAsFailed = async (
  correlationId: string,
  errorMessage: string
): Promise<IPendingResponse | null> => {
  try {
    const pendingResponse = await PendingResponse.findOneAndUpdate(
      { correlationId },
      {
        $set: {
          status: 'failed',
          errorMessage,
        },
        $inc: { retryCount: 1 },
      },
      { new: true }
    );

    if (pendingResponse) {
      logger.error('Pending response marked as failed', { correlationId, errorMessage });
    }
    return pendingResponse;
  } catch (error) {
    logger.error('Failed to mark as failed', { correlationId, error });
    throw error;
  }
};

/**
 * Retry failed response (reset to pending)
 */
export const retry = async (correlationId: string): Promise<IPendingResponse | null> => {
  try {
    const pendingResponse = await PendingResponse.findOneAndUpdate(
      { correlationId, status: 'failed' },
      {
        $set: {
          status: 'pending',
          errorMessage: '',
          processingStartedAt: null,
          processingCompletedAt: null,
        },
      },
      { new: true }
    );

    if (pendingResponse) {
      logger.info('Pending response retried', { correlationId });
    }
    return pendingResponse;
  } catch (error) {
    logger.error('Failed to retry pending response', { correlationId, error });
    throw error;
  }
};

/**
 * Delete by correlation ID
 */
export const deleteByCorrelationId = async (correlationId: string): Promise<boolean> => {
  try {
    const result = await PendingResponse.deleteOne({ correlationId });
    return result.deletedCount > 0;
  } catch (error) {
    logger.error('Failed to delete pending response', { correlationId, error });
    throw error;
  }
};

/**
 * Count pending responses by status for a user
 */
export const countByUserAndStatus = async (
  userId: string,
  status: PendingResponseStatus
): Promise<number> => {
  try {
    return await PendingResponse.countDocuments({
      userId,
      status,
      expiresAt: { $gt: new Date() },
    });
  } catch (error) {
    logger.error('Failed to count pending responses', { userId, status, error });
    throw error;
  }
};

/**
 * Get status counts for a user
 */
export const getStatusCounts = async (userId: string): Promise<Record<PendingResponseStatus, number>> => {
  try {
    const results = await PendingResponse.aggregate([
      {
        $match: {
          userId,
          expiresAt: { $gt: new Date() },
        },
      },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
        },
      },
    ]);

    const counts: Record<PendingResponseStatus, number> = {
      pending: 0,
      processing: 0,
      completed: 0,
      delivered: 0,
      expired: 0,
      failed: 0,
    };

    results.forEach((r: { _id: PendingResponseStatus; count: number }) => {
      counts[r._id] = r.count;
    });

    return counts;
  } catch (error) {
    logger.error('Failed to get status counts', { userId, error });
    throw error;
  }
};

export default {
  create,
  findByCorrelationId,
  findByUser,
  findCompletedByUser,
  findUnprocessed,
  markAsProcessing,
  markAsCompleted,
  markAsDelivered,
  markManyAsDelivered,
  markAsFailed,
  retry,
  delete: deleteByCorrelationId,
  countByUserAndStatus,
  getStatusCounts,
};
