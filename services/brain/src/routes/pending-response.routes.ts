import { Router } from 'express';
import pendingResponseController from '../controllers/pending-response.controller';
import { authMiddleware } from '../middleware/auth.middleware';

const router = Router();

// All routes require authentication
router.use(authMiddleware);

/**
 * @route   GET /api/pending-responses
 * @desc    Get all pending/completed responses for the authenticated user
 * @access  Private
 * @query   status - Filter by status (comma-separated: pending,processing,completed)
 * @query   limit - Number of responses to return (default: 50)
 * @query   offset - Offset for pagination (default: 0)
 */
router.get('/', pendingResponseController.getPendingResponses);

/**
 * @route   GET /api/pending-responses/deliver
 * @desc    Get completed responses and mark them as delivered (for offline users)
 * @access  Private
 * @query   limit - Number of responses to return (default: 50)
 */
router.get('/deliver', pendingResponseController.getAndDeliverResponses);

/**
 * @route   GET /api/pending-responses/counts
 * @desc    Get status counts for the authenticated user
 * @access  Private
 */
router.get('/counts', pendingResponseController.getStatusCounts);

/**
 * @route   GET /api/pending-responses/subscribe
 * @desc    Subscribe to SSE stream for real-time updates
 * @access  Private
 */
router.get('/subscribe', pendingResponseController.subscribeToUpdates);

/**
 * @route   GET /api/pending-responses/:correlationId
 * @desc    Get status of a specific request by correlation ID
 * @access  Private
 */
router.get('/:correlationId', pendingResponseController.getRequestStatus);

/**
 * @route   GET /api/pending-responses/:correlationId/deliver
 * @desc    Get response and mark as delivered
 * @access  Private
 */
router.get('/:correlationId/deliver', pendingResponseController.getAndDeliverResponse);

/**
 * @route   GET /api/pending-responses/:correlationId/subscribe
 * @desc    Subscribe to SSE stream for a specific correlation ID
 * @access  Private
 */
router.get('/:correlationId/subscribe', pendingResponseController.subscribeToCorrelation);

/**
 * @route   POST /api/pending-responses/:correlationId/retry
 * @desc    Retry a failed request
 * @access  Private
 */
router.post('/:correlationId/retry', pendingResponseController.retryRequest);

export default router;
