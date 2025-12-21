import { Request, Response } from 'express';
import pendingResponseRepository from '../repositories/pending-response.repository';
import responseHandler from '../services/response-handler.service';
import { successResponse, errorResponse } from '../utils/response';
import logger from '../utils/logger';

/**
 * Get all pending/completed responses for the authenticated user
 */
export const getPendingResponses = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user?.userId;
    if (!userId) {
      errorResponse(res, 'Unauthorized', 401);
      return;
    }

    const { status, limit = 50, offset = 0 } = req.query;

    const statusFilter = status
      ? (status as string).split(',') as any[]
      : ['pending', 'processing', 'completed'];

    const responses = await pendingResponseRepository.findByUser(userId, {
      status: statusFilter,
      limit: Number(limit),
      offset: Number(offset),
    });

    successResponse(res, {
      responses: responses.map((r) => ({
        correlationId: r.correlationId,
        conversationId: r.conversationId,
        status: r.status,
        request: {
          prompt: r.requestPayload.prompt,
          model: r.requestPayload.model,
        },
        response: r.response,
        createdAt: r.createdAt,
        expiresAt: r.expiresAt,
      })),
      count: responses.length,
    });
  } catch (error) {
    logger.error('Failed to get pending responses', { error });
    errorResponse(res, 'Failed to get pending responses', 500);
  }
};

/**
 * Get completed (undelivered) responses and mark them as delivered
 */
export const getAndDeliverResponses = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user?.userId;
    if (!userId) {
      errorResponse(res, 'Unauthorized', 401);
      return;
    }

    const { limit = 50 } = req.query;

    const responses = await pendingResponseRepository.findCompletedByUser(
      userId,
      Number(limit)
    );

    if (responses.length > 0) {
      // Mark all as delivered
      const correlationIds = responses.map((r) => r.correlationId);
      await pendingResponseRepository.markManyAsDelivered(correlationIds);
    }

    successResponse(res, {
      responses: responses.map((r) => ({
        correlationId: r.correlationId,
        conversationId: r.conversationId,
        response: r.response,
        createdAt: r.createdAt,
      })),
      count: responses.length,
      delivered: responses.length,
    });
  } catch (error) {
    logger.error('Failed to get and deliver responses', { error });
    errorResponse(res, 'Failed to get responses', 500);
  }
};

/**
 * Get status of a specific request by correlation ID
 */
export const getRequestStatus = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user?.userId;
    const { correlationId } = req.params;

    if (!userId) {
      errorResponse(res, 'Unauthorized', 401);
      return;
    }

    const pendingResponse = await pendingResponseRepository.findByCorrelationId(correlationId);

    if (!pendingResponse) {
      errorResponse(res, 'Request not found', 404);
      return;
    }

    // Verify ownership
    if (pendingResponse.userId.toString() !== userId) {
      errorResponse(res, 'Unauthorized', 403);
      return;
    }

    successResponse(res, {
      correlationId: pendingResponse.correlationId,
      conversationId: pendingResponse.conversationId,
      status: pendingResponse.status,
      response: pendingResponse.status === 'completed' ? pendingResponse.response : null,
      errorMessage: pendingResponse.errorMessage || null,
      createdAt: pendingResponse.createdAt,
      expiresAt: pendingResponse.expiresAt,
      processingStartedAt: pendingResponse.processingStartedAt,
      processingCompletedAt: pendingResponse.processingCompletedAt,
    });
  } catch (error) {
    logger.error('Failed to get request status', { error });
    errorResponse(res, 'Failed to get request status', 500);
  }
};

/**
 * Get response and mark as delivered
 */
export const getAndDeliverResponse = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user?.userId;
    const { correlationId } = req.params;

    if (!userId) {
      errorResponse(res, 'Unauthorized', 401);
      return;
    }

    const pendingResponse = await pendingResponseRepository.findByCorrelationId(correlationId);

    if (!pendingResponse) {
      errorResponse(res, 'Request not found', 404);
      return;
    }

    // Verify ownership
    if (pendingResponse.userId.toString() !== userId) {
      errorResponse(res, 'Unauthorized', 403);
      return;
    }

    if (pendingResponse.status !== 'completed') {
      successResponse(res, {
        correlationId: pendingResponse.correlationId,
        status: pendingResponse.status,
        message: 'Response not yet available',
        response: null,
      });
      return;
    }

    // Mark as delivered
    await pendingResponseRepository.markAsDelivered(correlationId);

    successResponse(res, {
      correlationId: pendingResponse.correlationId,
      conversationId: pendingResponse.conversationId,
      status: 'delivered',
      response: pendingResponse.response,
      createdAt: pendingResponse.createdAt,
    });
  } catch (error) {
    logger.error('Failed to get and deliver response', { error });
    errorResponse(res, 'Failed to get response', 500);
  }
};

/**
 * Get status counts for the authenticated user
 */
export const getStatusCounts = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user?.userId;
    if (!userId) {
      errorResponse(res, 'Unauthorized', 401);
      return;
    }

    const counts = await pendingResponseRepository.getStatusCounts(userId);

    successResponse(res, { counts });
  } catch (error) {
    logger.error('Failed to get status counts', { error });
    errorResponse(res, 'Failed to get status counts', 500);
  }
};

/**
 * Subscribe to SSE stream for real-time updates
 */
export const subscribeToUpdates = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user?.userId;
    if (!userId) {
      errorResponse(res, 'Unauthorized', 401);
      return;
    }

    // Register SSE connection
    responseHandler.registerUserSSE(userId, res);

    logger.info('User subscribed to SSE updates', { userId });
  } catch (error) {
    logger.error('Failed to subscribe to updates', { error });
    errorResponse(res, 'Failed to subscribe', 500);
  }
};

/**
 * Subscribe to SSE stream for a specific correlation ID
 */
export const subscribeToCorrelation = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user?.userId;
    const { correlationId } = req.params;

    if (!userId) {
      errorResponse(res, 'Unauthorized', 401);
      return;
    }

    // Verify ownership
    const pendingResponse = await pendingResponseRepository.findByCorrelationId(correlationId);
    if (pendingResponse && pendingResponse.userId.toString() !== userId) {
      errorResponse(res, 'Unauthorized', 403);
      return;
    }

    // Register SSE connection for this correlation
    responseHandler.registerCorrelationSSE(correlationId, res);

    logger.info('User subscribed to correlation SSE', { userId, correlationId });
  } catch (error) {
    logger.error('Failed to subscribe to correlation', { error });
    errorResponse(res, 'Failed to subscribe', 500);
  }
};

/**
 * Retry a failed request
 */
export const retryRequest = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user?.userId;
    const { correlationId } = req.params;

    if (!userId) {
      errorResponse(res, 'Unauthorized', 401);
      return;
    }

    const pendingResponse = await pendingResponseRepository.findByCorrelationId(correlationId);

    if (!pendingResponse) {
      errorResponse(res, 'Request not found', 404);
      return;
    }

    // Verify ownership
    if (pendingResponse.userId.toString() !== userId) {
      errorResponse(res, 'Unauthorized', 403);
      return;
    }

    if (pendingResponse.status !== 'failed') {
      errorResponse(res, 'Only failed requests can be retried', 400);
      return;
    }

    // Reset to pending
    const updated = await pendingResponseRepository.retry(correlationId);

    successResponse(res, {
      correlationId,
      status: updated?.status || 'pending',
      message: 'Request queued for retry',
    });
  } catch (error) {
    logger.error('Failed to retry request', { error });
    errorResponse(res, 'Failed to retry request', 500);
  }
};

export default {
  getPendingResponses,
  getAndDeliverResponses,
  getRequestStatus,
  getAndDeliverResponse,
  getStatusCounts,
  subscribeToUpdates,
  subscribeToCorrelation,
  retryRequest,
};
