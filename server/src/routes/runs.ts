import { z } from 'zod';
import type { FastifyPluginAsync } from 'fastify';
import { defaultTasks } from '../data/tasks';
import { buildRunSnapshot, MAX_EXECUTION_CASES } from '../domain/execution-builder';
import { RunStore } from '../store/run-store';
import { ApiError } from '../types/api-error';
import type { ExecutionRequest } from '../types/domain';
import { parseOrThrow } from './_utils';

interface RunsRouteOptions {
  runStore: RunStore;
}

const knownTaskIds = new Set(defaultTasks.map((task) => task.id));

const taskCatalogItemSchema = z.object({
  id: z.number().int(),
  name: z.string().min(1),
  description: z.string().min(1),
  difficulty: z.enum(['简单', '中等', '困难']).optional(),
  estimatedDuration: z.string().min(1).optional(),
  testScenario: z.string().min(1).optional(),
  operationSteps: z.array(z.string().min(1)).min(1).optional(),
  successCriteria: z.array(z.string().min(1)).min(1).optional(),
  tags: z.array(z.string().min(1)).optional(),
  evidenceRefs: z.array(z.string().min(1)).min(1).optional(),
  evidenceReason: z.string().min(1).optional(),
});

const createRunSchema = z.object({
  targetUrl: z.string().min(1).optional(),
  selectedTaskIds: z.array(z.number().int()).min(1),
  taskCatalog: z.array(taskCatalogItemSchema).optional(),
  categorySelections: z
    .array(
      z.object({
        categoryId: z.string().min(1),
        count: z.number().int().min(0).max(20),
      }),
    )
    .min(1),
  maxCases: z.number().int().min(1).max(MAX_EXECUTION_CASES).optional(),
});

const runIdSchema = z.object({
  runId: z.string().min(1),
});

export const runsRoutes: FastifyPluginAsync<RunsRouteOptions> = async (app, options) => {
  app.post('/runs', async (request) => {
    const input = parseOrThrow(createRunSchema, request.body);

    const uniqueTaskIds = Array.from(new Set(input.selectedTaskIds));
    if (uniqueTaskIds.length < 3 || uniqueTaskIds.length > 10) {
      throw new ApiError('VALIDATION_ERROR', '任务数量必须在 3 到 10 之间（去重后）', 400, {
        selectedTaskIds: uniqueTaskIds,
      });
    }

    const catalogIds =
      input.taskCatalog && input.taskCatalog.length > 0
        ? new Set(input.taskCatalog.map((task) => task.id))
        : knownTaskIds;

    const invalidTaskIds = uniqueTaskIds.filter((taskId) => !catalogIds.has(taskId));
    if (invalidTaskIds.length > 0) {
      throw new ApiError('VALIDATION_ERROR', '存在无效任务 ID', 400, { invalidTaskIds });
    }

    const totalSelectedPeople = input.categorySelections.reduce(
      (sum, selection) => sum + selection.count,
      0,
    );
    if (totalSelectedPeople <= 0) {
      throw new ApiError('VALIDATION_ERROR', '至少需要配置 1 个测试人群', 400);
    }

    const executionRequest: ExecutionRequest = {
      targetUrl: input.targetUrl,
      selectedTaskIds: uniqueTaskIds,
      taskCatalog: input.taskCatalog,
      categorySelections: input.categorySelections,
      maxCases: input.maxCases ?? MAX_EXECUTION_CASES,
    };

    const snapshot = buildRunSnapshot(executionRequest);

    if (snapshot.selectedTaskIds.length < 3 || snapshot.selectedTaskIds.length > 10) {
      throw new ApiError('VALIDATION_ERROR', '任务过滤后数量无效，请检查输入', 400);
    }

    options.runStore.set(snapshot);

    return {
      runId: snapshot.runId,
      createdAt: snapshot.createdAt,
      snapshot,
      executions: snapshot.executions,
      caseRefs: snapshot.caseRefs,
    };
  });

  app.get('/runs/:runId', async (request) => {
    const params = parseOrThrow(runIdSchema, request.params);
    const snapshot = options.runStore.get(params.runId);
    if (!snapshot) {
      throw new ApiError('RUN_NOT_FOUND', `未找到 run: ${params.runId}`, 404);
    }

    return { snapshot };
  });
};
