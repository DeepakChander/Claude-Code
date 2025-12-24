import jwt from 'jsonwebtoken';
import { JWTPayload } from '../types';
import logger from '../utils/logger';

const JWT_SECRET = process.env.JWT_SECRET || 'default-secret-change-me';

export function verifyToken(token: string): JWTPayload | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as JWTPayload;
    return decoded;
  } catch (error) {
    logger.warn('JWT verification failed', { error: (error as Error).message });
    return null;
  }
}

export function extractTokenFromUrl(url: string | undefined): string | null {
  if (!url) return null;

  try {
    const urlObj = new URL(url, 'http://localhost');
    return urlObj.searchParams.get('token');
  } catch {
    return null;
  }
}

export function extractTokenFromHeaders(headers: { authorization?: string }): string | null {
  const auth = headers.authorization;
  if (!auth) return null;

  if (auth.startsWith('Bearer ')) {
    return auth.slice(7);
  }

  return auth;
}
