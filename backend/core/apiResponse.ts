


import { Response } from 'express';
import { ApiResponse, ErrorCode } from '../../types';

export class ResponseBuilder {
  static success<T>(res: Response, data?: T, statusCode = 200) {
    const response: ApiResponse<T> = {
      success: true,
      data,
      timestamp: Date.now()
    };
    return (res as any).status(statusCode).json(response);
  }

  static error(res: Response, message: string, code: ErrorCode, statusCode = 500, details?: any) {
    const response: ApiResponse = {
      success: false,
      error: {
        code,
        message,
        details
      },
      timestamp: Date.now()
    };
    return (res as any).status(statusCode).json(response);
  }
}