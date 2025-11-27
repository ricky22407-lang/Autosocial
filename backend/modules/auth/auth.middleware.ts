


import { Request, Response, NextFunction } from 'express';
import * as admin from 'firebase-admin';
import { AppError } from '../../core/appError';
import { ErrorCode } from '../../../types';

export const isAuthenticated = async (req: Request, res: Response, next: NextFunction) => {
  const authHeader = (req as any).headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next(new AppError('No token provided', 401, ErrorCode.UNAUTHORIZED));
  }

  const token = authHeader.split('Bearer ')[1];

  try {
    const decodedToken = await admin.auth().verifyIdToken(token);
    (req as any).user = decodedToken;
    next();
  } catch (error) {
    return next(new AppError('Invalid token', 403, ErrorCode.TOKEN_EXPIRED));
  }
};