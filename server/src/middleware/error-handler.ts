import type { ApiErrorBody } from '@tracker/shared';
import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../lib/app-error.ts';

export const notFoundHandler: RequestHandler = (req, _res, next) => {
  next(new AppError('NOT_FOUND', `No route for ${req.method} ${req.path}`));
};

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  let appError: AppError;

  if (err instanceof AppError) {
    appError = err;
  } else if (err instanceof ZodError) {
    appError = new AppError('VALIDATION_ERROR', 'Invalid request', err.issues);
  } else if (isBodyParseError(err)) {
    appError = new AppError('VALIDATION_ERROR', 'Malformed JSON body');
  } else {
    console.error(err);
    appError = new AppError('INTERNAL', 'Something went wrong');
  }

  const body: ApiErrorBody = {
    error: {
      code: appError.code,
      message: appError.message,
      ...(appError.details === undefined ? {} : { details: appError.details }),
    },
  };
  res.status(appError.status).json(body);
};

function isBodyParseError(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'type' in err &&
    (err as { type: unknown }).type === 'entity.parse.failed'
  );
}
