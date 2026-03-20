import { z } from 'zod';
import type { FastifyPluginAsync } from 'fastify';
import { ApiError } from '../types/api-error';
import { parseOrThrow } from './_utils';
import { RunStore } from '../store/run-store';
import { ExecutionJobStore } from '../store/execution-job-store';
import { LiveExecutionJobRunner } from '../live-runner/job-runner';

interface ExecutionJobsRouteOptions {
  runStore: RunStore;
  executionJobStore: ExecutionJobStore;
  liveExecutionJobRunner: LiveExecutionJobRunner;
}

const runIdSchema = z.object({
  runId: z.string().min(1),
});

const runAndJobSchema = z.object({
  runId: z.string().min(1),
  jobId: z.string().min(1),
});

export const executionJobsRoutes: FastifyPluginAsync<ExecutionJobsRouteOptions> = async (
  app,
  options,
) => {
  app.post('/runs/:runId/execution-jobs', async (request) => {
    const params = parseOrThrow(runIdSchema, request.params);
    const snapshot = options.runStore.get(params.runId);
    if (!snapshot) {
      throw new ApiError('RUN_NOT_FOUND', `未找到 run: ${params.runId}`, 404);
    }

    const started = options.liveExecutionJobRunner.start(snapshot);
    return {
      jobId: started.jobId,
      status: started.status,
      progress: started.progress,
      createdAt: started.createdAt,
    };
  });

  app.get('/runs/:runId/execution-jobs/:jobId', async (request) => {
    const params = parseOrThrow(runAndJobSchema, request.params);
    const entry = options.executionJobStore.get(params.jobId);
    if (!entry || entry.runId !== params.runId) {
      throw new ApiError(
        'RUN_NOT_FOUND',
        `未找到执行任务: run=${params.runId}, job=${params.jobId}`,
        404,
      );
    }

    return {
      jobId: entry.jobId,
      status: entry.status,
      progress: entry.progress,
      snapshot: entry.snapshot,
      error: entry.error,
      createdAt: entry.createdAt,
      updatedAt: entry.updatedAt,
    };
  });
};
