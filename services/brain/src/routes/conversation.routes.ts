// Conversation Routes
// Dedicated routes for conversation management

import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.middleware';
import {
  listConversations,
  getConversation,
  generateTitle,
  updateTitle,
  updateConversation,
  deleteConversation,
} from '../controllers/conversation.controller';

const router = Router();

// All routes require authentication
router.use(authMiddleware);

/**
 * @route   GET /api/conversations
 * @desc    List all conversations for the authenticated user
 * @query   limit (number, default: 50, max: 100)
 * @query   offset (number, default: 0)
 * @query   archived (boolean, default: false)
 * @query   sortBy (string, default: lastMessageAt)
 * @query   sortOrder (string, default: desc)
 * @access  Private
 */
router.get('/', listConversations);

/**
 * @route   GET /api/conversations/:conversationId
 * @desc    Get a single conversation with optional messages
 * @query   includeMessages (boolean, default: true)
 * @query   messageLimit (number, default: 100, max: 500)
 * @access  Private
 */
router.get('/:conversationId', getConversation);

/**
 * @route   POST /api/conversations/:conversationId/generate-title
 * @desc    Generate AI-powered title for a conversation using Claude Haiku
 * @body    regenerate (boolean, default: false) - Force regeneration of existing title
 * @access  Private
 */
router.post('/:conversationId/generate-title', generateTitle);

/**
 * @route   PUT /api/conversations/:conversationId/title
 * @desc    Update conversation title manually
 * @body    title (string, 1-100 characters)
 * @access  Private
 */
router.put('/:conversationId/title', updateTitle);

/**
 * @route   PATCH /api/conversations/:conversationId
 * @desc    Update conversation properties (archive, pin)
 * @body    isArchived (boolean, optional)
 * @body    isPinned (boolean, optional)
 * @access  Private
 */
router.patch('/:conversationId', updateConversation);

/**
 * @route   DELETE /api/conversations/:conversationId
 * @desc    Delete or archive a conversation
 * @query   permanent (boolean, default: false) - If true, permanently deletes
 * @access  Private
 */
router.delete('/:conversationId', deleteConversation);

export default router;
