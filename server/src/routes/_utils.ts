import type { ZodType } from 'zod';
import { ApiError } from '../types/api-error';

export function parseOrThrow<T>(schema: ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new ApiError('VALIDATION_ERROR', '请求参数不合法', 400, parsed.error.issues);
  }
  return parsed.data;
}
