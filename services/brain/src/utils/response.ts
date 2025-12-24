import { Response } from 'express';

interface SuccessResponse<T> {
  success: true;
  data: T;
}

interface ErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
  };
}

export const successResponse = <T>(res: Response, data: T, statusCode = 200): void => {
  const response: SuccessResponse<T> = {
    success: true,
    data,
  };
  res.status(statusCode).json(response);
};

/**
 * Send an error response
 * @param res Express Response object
 * @param message Error message
 * @param statusCode HTTP status code (default: 500)
 */
export const errorResponse = (
  res: Response,
  message: string,
  statusCode = 500
): void => {
  // Generate code from status
  const codeMap: Record<number, string> = {
    400: 'BAD_REQUEST',
    401: 'UNAUTHORIZED',
    403: 'FORBIDDEN',
    404: 'NOT_FOUND',
    500: 'INTERNAL_ERROR',
  };

  const response: ErrorResponse = {
    success: false,
    error: {
      code: codeMap[statusCode] || 'ERROR',
      message,
    },
  };
  res.status(statusCode).json(response);
};

export default {
  successResponse,
  errorResponse,
};
