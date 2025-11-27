
import { Request, Response, NextFunction } from 'express';
import { AppError } from '../core/appError';
import { ResponseBuilder } from '../core/apiResponse';
import { ErrorCode } from '../../types';

export const errorHandler = (err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error('[Global Error]', err);

  if (err instanceof AppError) {
    return ResponseBuilder.error(res, err.message, err.errorCode, err.statusCode);
  }

  // Handle unexpected errors
  return ResponseBuilder.error(
    res, 
    'Internal Server Error', 
    ErrorCode.INTERNAL_ERROR, 
    500, 
    process.env.NODE_ENV === 'development' ? err.message : undefined
  );
};
