import { Router } from 'express';
import { generateToken, verifyToken } from '../controllers/auth.controller';

const router = Router();

/**
 * @route   POST /api/auth/token
 * @desc    Generate a test JWT token
 * @access  Public
 */
router.post('/token', generateToken);

/**
 * @route   POST /api/auth/verify
 * @desc    Verify a JWT token
 * @access  Public
 */
router.post('/verify', verifyToken);

export default router;
