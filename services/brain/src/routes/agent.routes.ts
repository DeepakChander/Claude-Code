import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.middleware';
import {
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
} from '../controllers/agent.controller';

const router = Router();

// All routes require authentication
router.use(authMiddleware);

/**
 * CLI-based endpoints
 */

/**
 * @route   POST /api/agent/run
 * @desc    Run Claude Code CLI with streaming output (SSE)
 * @access  Private
 */
router.post('/run', runAgent);

/**
 * @route   POST /api/agent/run-sync
 * @desc    Run Claude Code CLI and return JSON response
 * @access  Private
 */
router.post('/run-sync', runAgentSync);

/**
 * @route   POST /api/agent/continue
 * @desc    Continue a conversation using --continue flag
 * @access  Private
 */
router.post('/continue', continueAgent);

/**
 * SDK-based endpoints
 */

/**
 * @route   POST /api/agent/sdk/run
 * @desc    Run Agent SDK with streaming output (SSE)
 * @access  Private
 */
router.post('/sdk/run', runAgentSdk);

/**
 * @route   POST /api/agent/sdk/run-sync
 * @desc    Run Agent SDK and return JSON response
 * @access  Private
 */
router.post('/sdk/run-sync', runAgentSdkSync);

/**
 * @route   POST /api/agent/sdk/continue
 * @desc    Continue a conversation using SDK session resume (SSE)
 * @access  Private
 */
router.post('/sdk/continue', continueAgentSdk);

/**
 * @route   POST /api/agent/sdk/continue-sync
 * @desc    Continue a conversation using SDK session resume (JSON)
 * @access  Private
 */
router.post('/sdk/continue-sync', continueAgentSdkSync);

/**
 * @route   POST /api/agent/sdk/chat
 * @desc    Chat mode - returns tool_use for client-side local execution (SSE)
 * @access  Private
 */
router.post('/sdk/chat', runAgentChat);

/**
 * @route   POST /api/agent/sdk/chat/tools
 * @desc    Submit tool results from client and continue conversation (SSE)
 * @access  Private
 */
router.post('/sdk/chat/tools', submitToolResults);

/**
 * Conversation endpoints
 */

/**
 * @route   GET /api/agent/conversations
 * @desc    List all conversations for the authenticated user
 * @access  Private
 */
router.get('/conversations', listConversations);

/**
 * @route   GET /api/agent/resumable
 * @desc    List all resumable conversations (those with sessionId)
 * @access  Private
 */
router.get('/resumable', listResumableConversations);

/**
 * @route   GET /api/agent/conversations/:conversationId
 * @desc    Get conversation details including session info
 * @access  Private
 */
router.get('/conversations/:conversationId', getConversationDetails);

/**
 * @route   GET /api/agent/conversations/:conversationId/messages
 * @desc    Get all messages for a conversation
 * @access  Private
 */
router.get('/conversations/:conversationId/messages', getConversationMessages);

/**
 * @route   POST /api/agent/resume/:conversationId
 * @desc    Resume a conversation by ID (SSE streaming)
 * @access  Private
 */
router.post('/resume/:conversationId', resumeConversationById);

/**
 * @route   POST /api/agent/resume/:conversationId/sync
 * @desc    Resume a conversation by ID (JSON response)
 * @access  Private
 */
router.post('/resume/:conversationId/sync', resumeConversationByIdSync);

/**
 * Utility endpoints
 */

/**
 * @route   GET /api/agent/usage
 * @desc    Get token usage and cost for a project
 * @access  Private
 */
router.get('/usage', getUsage);

/**
 * @route   GET /api/agent/health
 * @desc    Check agent service health (OpenRouter connection)
 * @access  Private
 */
router.get('/health', agentHealth);

/**
 * @route   POST /api/agent/compact
 * @desc    Compact conversation to save context
 * @access  Private
 */
router.post('/compact', compactConversation);

export default router;
