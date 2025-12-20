import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { config } from 'dotenv';
import logger from '../utils/logger';

config();

const JWT_SECRET = process.env.JWT_SECRET || 'default-secret-change-me';
const JWT_EXPIRES_IN = '7d';

interface TokenRequest {
  userId?: string;
  email?: string;
}

/**
 * Generate a test JWT token
 * POST /api/auth/token
 *
 * This is a test endpoint for development. In production,
 * replace with your actual authentication system.
 */
export const generateToken = async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId, email } = req.body as TokenRequest;

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
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    // Calculate expiration date
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    logger.info('Token generated', { userId, email });

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

    const decoded = jwt.verify(token, JWT_SECRET) as { userId: string; email?: string; exp: number };

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
