import { z } from 'zod';
import type { FastifyPluginAsync } from 'fastify';
import { askQuestion } from '../domain/qa-engine';
import type { LLMAdapter } from '../llm/adapter';
import { RunStore } from '../store/run-store';
import { ApiError } from '../types/api-error';
import type { QARequest } from '../types/domain';
import { parseOrThrow } from './_utils';

interface QuestionsRouteOptions {
  runStore: RunStore;
  llmAdapter: LLMAdapter;
}

const runIdSchema = z.object({
  runId: z.string().min(1),
});

const questionSchema = z.object({
  scope: z.enum(['case', 'global']),
  question: z.string().min(1),
  caseId: z.string().min(1).optional(),
  filters: z
    .object({
      taskId: z.number().int().optional(),
      categoryId: z.string().min(1).optional(),
      status: z.enum(['pending', 'running', 'success', 'failed']).optional(),
      emotion: z.enum(['neutral', 'frustrated', 'angry', 'anxious', 'satisfied']).optional(),
    })
    .optional(),
});

export const questionsRoutes: FastifyPluginAsync<QuestionsRouteOptions> = async (
  app,
  options,
) => {
  app.post('/runs/:runId/questions', async (request) => {
    const params = parseOrThrow(runIdSchema, request.params);
    const body = parseOrThrow(questionSchema, request.body);

    const snapshot = options.runStore.get(params.runId);
    if (!snapshot) {
      throw new ApiError('RUN_NOT_FOUND', `未找到 run: ${params.runId}`, 404);
    }

    const qaRequest: QARequest = {
      runId: params.runId,
      question: body.question,
      scope: body.scope,
      caseId: body.caseId,
      filters: body.filters,
    };

    return askQuestion(qaRequest, snapshot, options.llmAdapter);
  });
};
