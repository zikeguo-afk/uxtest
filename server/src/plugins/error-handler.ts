import { ZodError } from 'zod';
import type { FastifyInstance } from 'fastify';
import { ApiError } from '../types/api-error';

interface ErrorPayload {
  error: {
    code: string;
    message: string;
    details?: unknown;
    requestId: string;
  };
}

export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((error, request, reply) => {
    const requestId = request.id;

    if (error instanceof ApiError) {
      const payload: ErrorPayload = {
        error: {
          code: error.code,
          message: error.message,
          details: error.details,
          requestId,
        },
      };
      reply.status(error.statusCode).send(payload);
      return;
    }

    if (error instanceof ZodError) {
      const payload: ErrorPayload = {
        error: {
          code: 'VALIDATION_ERROR',
          message: '请求参数不合法',
          details: error.issues,
          requestId,
        },
      };
      reply.status(400).send(payload);
      return;
    }

    const payload: ErrorPayload = {
      error: {
        code: 'INTERNAL_ERROR',
        message: '服务内部错误',
        requestId,
      },
    };

    reply.status(500).send(payload);
  });
}
