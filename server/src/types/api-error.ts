export type ApiErrorCode =
  | 'VALIDATION_ERROR'
  | 'RUN_NOT_FOUND'
  | 'EMPTY_EXECUTIONS'
  | 'INTERNAL_ERROR';

export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly statusCode: number;
  readonly details?: unknown;

  constructor(code: ApiErrorCode, message: string, statusCode: number, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}
