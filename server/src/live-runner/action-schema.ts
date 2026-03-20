import { z } from 'zod';
import type { LiveExecutionAction } from '../types/domain';

const actionSchema = z.object({
  type: z.enum(['click', 'type', 'select', 'wait', 'scroll', 'assert', 'finish', 'fail']),
  selector: z.string().min(1).optional(),
  text: z.string().min(1).optional(),
  optionValue: z.string().min(1).optional(),
  waitMs: z.number().int().min(100).max(20_000).optional(),
  direction: z.enum(['up', 'down']).optional(),
  expected: z.string().min(1).optional(),
  reason: z.string().min(1).optional(),
});

export function parseExecutionAction(input: unknown): LiveExecutionAction {
  return actionSchema.parse(input);
}

export function safeParseExecutionAction(input: unknown): LiveExecutionAction | null {
  const parsed = actionSchema.safeParse(input);
  if (!parsed.success) {
    return null;
  }
  return parsed.data;
}
