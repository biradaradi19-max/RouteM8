import type { Request, Response, NextFunction } from 'express';
import { verifyFirebaseIdToken, type VerifiedUser } from '../config/firebaseAdmin.js';

export interface AuthenticatedRequest extends Request {
  user?: VerifiedUser;
}

export async function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({
      error: 'Unauthorized',
      message: 'Missing or malformed Authorization header. Expected Bearer <token>',
    });
    return;
  }

  const token = authHeader.split('Bearer ')[1]?.trim();
  if (!token) {
    res.status(401).json({
      error: 'Unauthorized',
      message: 'Empty bearer token provided',
    });
    return;
  }

  try {
    const verifiedUser = await verifyFirebaseIdToken(token);
    req.user = verifiedUser;
    next();
  } catch (error: any) {
    res.status(401).json({
      error: 'Unauthorized',
      message: error.message || 'Token verification failed',
    });
  }
}

export async function optionalAuth(req: AuthenticatedRequest, _res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split('Bearer ')[1]?.trim();
    if (token) {
      try {
        req.user = await verifyFirebaseIdToken(token);
      } catch {
        // Silently continue unauthenticated
      }
    }
  }
  next();
}
