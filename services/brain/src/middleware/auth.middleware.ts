import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from 'dotenv';

config();

// SECURITY: Enforce JWT_SECRET is set properly
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || JWT_SECRET === 'default-secret-change-me') {
  console.error('FATAL: JWT_SECRET must be set to a secure value');
  if (process.env.NODE_ENV === 'production') {
    throw new Error('FATAL: JWT_SECRET must be set in production');
  }
}
const SAFE_JWT_SECRET = JWT_SECRET || 'dev-secret-not-for-production';

// SECURITY: Master API key for direct authentication
const MASTER_API_KEY = process.env.MASTER_API_KEY;

// Authenticated user interface
export interface AuthUser {
  userId: string;
  email?: string;
}

// Extended request with user
export interface AuthRequest extends Request {
  user?: AuthUser;
}

// JWT verification middleware with API key support
export const authMiddleware = (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): void => {
  const authHeader = req.headers.authorization;
  const apiKey = req.headers['x-api-key'] as string | undefined;

  // Option 1: Check for X-API-Key header (direct API key authentication)
  if (apiKey) {
    if (MASTER_API_KEY && apiKey === MASTER_API_KEY) {
      // API key is valid - create a system user
      req.user = {
        userId: 'api-key-user',
        email: 'api@openanalyst.com',
      };
      next();
      return;
    } else {
      res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Invalid API key',
        },
      });
      return;
    }
  }

  // Option 2: Check for Bearer token (JWT authentication)
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'No token provided. Use Authorization: Bearer <token> or X-API-Key: <api-key>',
      },
    });
    return;
  }

  const token = authHeader.replace('Bearer ', '');

  try {
    const decoded = jwt.verify(token, SAFE_JWT_SECRET) as AuthUser;
    req.user = {
      userId: decoded.userId,
      email: decoded.email,
    };
    next();
  } catch (error) {
    res.status(401).json({
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'Invalid or expired token',
      },
    });
  }
};

// Optional auth - doesn't fail if no token
export const optionalAuthMiddleware = (
  req: AuthRequest,
  _res: Response,
  next: NextFunction
): void => {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    next();
    return;
  }

  const token = authHeader.replace('Bearer ', '');

  try {
    const decoded = jwt.verify(token, SAFE_JWT_SECRET) as AuthUser;
    req.user = {
      userId: decoded.userId,
      email: decoded.email,
    };
  } catch (error) {
    // Token invalid but we continue anyway
    // Log this as a warning so potential frontend bugs are visible
    console.warn('Optional auth failed with invalid token:', (error as Error).message);
  }

  next();
};

export default authMiddleware;
