import { Router } from 'express';
import { generateToken, verifyToken } from '../controllers/auth.controller';
import rateLimit from 'express-rate-limit';

const router = Router();

// Strict rate limiter for auth endpoints (5 requests per 15 minutes)
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        success: false,
        error: {
            code: 'RATE_LIMIT_EXCEEDED',
            message: 'Too many login attempts, please try again later'
        }
    }
});

/**
 * @route   POST /api/auth/token
 * @desc    Generate a test JWT token
 * @access  Public
 */
router.post('/token', authLimiter, generateToken);

/**
 * @route   POST /api/auth/verify
 * @desc    Verify a JWT token
 * @access  Public
 */
router.post('/verify', authLimiter, verifyToken);

export default router;
