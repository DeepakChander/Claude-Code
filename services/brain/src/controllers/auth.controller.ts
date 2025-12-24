import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { config } from 'dotenv';
import logger from '../utils/logger';

config();

// SECURITY: Enforce JWT_SECRET is set properly
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || JWT_SECRET === 'default-secret-change-me') {
  logger.error('FATAL: JWT_SECRET must be set to a secure value');
  if (process.env.NODE_ENV === 'production') {
    throw new Error('FATAL: JWT_SECRET must be set in production');
  }
}
const SAFE_JWT_SECRET = JWT_SECRET || 'dev-secret-not-for-production';
const JWT_EXPIRES_IN = '7d';

// SECURITY: Master API key for token generation (required in production)
const MASTER_API_KEY = process.env.MASTER_API_KEY;

interface TokenRequest {
  userId?: string;
  email?: string;
  apiKey?: string;
}

/**
 * Generate a JWT token
 * POST /api/auth/token
 *
 * SECURITY: Requires MASTER_API_KEY to generate tokens.
 * This prevents unauthorized token generation.
 */
export const generateToken = async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId, email, apiKey } = req.body as TokenRequest;

    // SECURITY: Validate master API key in production
    if (process.env.NODE_ENV === 'production') {
      if (!MASTER_API_KEY) {
        logger.error('MASTER_API_KEY not configured');
        res.status(500).json({
          success: false,
          error: {
            code: 'CONFIG_ERROR',
            message: 'Server not properly configured for token generation',
          },
        });
        return;
      }

      if (apiKey !== MASTER_API_KEY) {
        logger.warn('Invalid API key attempt', { userId, ip: req.ip });
        res.status(401).json({
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'Valid API key required for token generation',
          },
        });
        return;
      }
    }

    // Validate input
    if (!userId) {
      res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'userId is required',
        },
      });
      return;
    }

    // Generate token
    const token = jwt.sign(
      {
        userId: userId,
        email: email || `${userId}@example.com`,
      },
      SAFE_JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    // Calculate expiration date
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    logger.info('Token generated', { userId, email, ip: req.ip });

    res.json({
      success: true,
      data: {
        token,
        expiresIn: JWT_EXPIRES_IN,
        expiresAt: expiresAt.toISOString(),
        userId,
      },
    });
  } catch (error) {
    logger.error('Token generation failed', { error: (error as Error).message });

    res.status(500).json({
      success: false,
      error: {
        code: 'TOKEN_GENERATION_ERROR',
        message: 'Failed to generate token',
      },
    });
  }
};

/**
 * Verify a JWT token
 * POST /api/auth/verify
 */
export const verifyToken = async (req: Request, res: Response): Promise<void> => {
  try {
    const { token } = req.body as { token?: string };

    if (!token) {
      res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'token is required',
        },
      });
      return;
    }

    const decoded = jwt.verify(token, SAFE_JWT_SECRET) as { userId: string; email?: string; exp: number };

    res.json({
      success: true,
      data: {
        valid: true,
        userId: decoded.userId,
        email: decoded.email,
        expiresAt: new Date(decoded.exp * 1000).toISOString(),
      },
    });
  } catch (error) {
    res.json({
      success: true,
      data: {
        valid: false,
        error: (error as Error).message,
      },
    });
  }
};

export default {
  generateToken,
  verifyToken,
};
