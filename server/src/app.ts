import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import { registerCors } from './plugins/cors';
import { registerErrorHandler } from './plugins/error-handler';
import { diagnosisRoutes } from './routes/diagnosis';
import { executionJobsRoutes } from './routes/execution-jobs';
import { healthRoutes } from './routes/health';
import { questionsRoutes } from './routes/questions';
import { reportRoutes } from './routes/report';
import { runsRoutes } from './routes/runs';
import type { EnvConfig } from './config/env';
import type { LLMAdapter } from './llm/adapter';
import { LiveExecutionJobRunner } from './live-runner/job-runner';
import { ExecutionJobStore } from './store/execution-job-store';
import { RunStore } from './store/run-store';

export interface AppDeps {
  env: EnvConfig;
  runStore: RunStore;
  executionJobStore?: ExecutionJobStore;
  liveExecutionJobRunner?: LiveExecutionJobRunner;
  llmAdapter: LLMAdapter;
  executionLlmAdapter?: LLMAdapter;
}

export async function createApp(deps: AppDeps): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  const startedAtByRequestId = new Map<string, number>();
  const executionJobStore =
    deps.executionJobStore ??
    new ExecutionJobStore({
      ttlMs: deps.env.executionJobTtlMs,
      maxSize: deps.env.executionJobCacheSize,
      cleanupIntervalMs: deps.env.executionJobCleanupIntervalMs,
    });
  const liveExecutionJobRunner =
    deps.liveExecutionJobRunner ??
    new LiveExecutionJobRunner(
      deps.runStore,
      executionJobStore,
      deps.executionLlmAdapter ?? deps.llmAdapter,
      {
      enabled: deps.env.liveRunnerEnabled,
      headless: deps.env.playwrightHeadless,
      concurrency: deps.env.playwrightConcurrency,
      maxSteps: deps.env.caseMaxSteps,
      caseTimeoutMs: deps.env.caseTimeoutMs,
      stepTimeoutMs: deps.env.stepTimeoutMs,
      screenshotEnabled: deps.env.liveRunnerScreenshotEnabled,
      artifactRootDir: deps.env.liveRunnerArtifactDir,
      },
    );

  await registerCors(app, deps.env.corsOrigin);
  registerErrorHandler(app);

  app.addHook('onRequest', async (request) => {
    startedAtByRequestId.set(request.id, Date.now());
  });

  app.addHook('onResponse', async (request, reply) => {
    const startAt = startedAtByRequestId.get(request.id);
    startedAtByRequestId.delete(request.id);
    const durationMs =
      typeof startAt === 'number' ? Math.max(0, Date.now() - startAt) : reply.elapsedTime;

    console.info(
      `[api] requestId=${request.id} path=${request.method} ${request.url} status=${reply.statusCode} durationMs=${durationMs}`,
    );
  });

  await app.register(healthRoutes, {
    prefix: '/api/v1',
    llmAdapter: deps.llmAdapter,
    executionLlmAdapter: deps.executionLlmAdapter,
  });
  await app.register(diagnosisRoutes, {
    prefix: '/api/v1',
    evaluationMode: deps.env.evaluationMode,
    evaluatorTimeoutMs: deps.env.evaluatorTimeoutMs,
    evaluatorAllowInsecureTls: deps.env.evaluatorAllowInsecureTls,
    diagnosisPipelineMode: deps.env.diagnosisPipelineMode,
    sourceCollectSameOriginOnly: deps.env.sourceCollectSameOriginOnly,
    sourceCollectMaxTotalBytes: deps.env.sourceCollectMaxTotalBytes,
    llmChunkTokenBudget: deps.env.llmChunkTokenBudget,
    strictTasks: deps.env.diagnosisStrictTasks,
    taskBlacklist: deps.env.diagnosisTaskBlacklist,
    llmAdapter: deps.llmAdapter,
  });
  await app.register(runsRoutes, { prefix: '/api/v1', runStore: deps.runStore });
  await app.register(executionJobsRoutes, {
    prefix: '/api/v1',
    runStore: deps.runStore,
    executionJobStore,
    liveExecutionJobRunner,
  });
  await app.register(reportRoutes, { prefix: '/api/v1', runStore: deps.runStore });
  await app.register(questionsRoutes, {
    prefix: '/api/v1',
    runStore: deps.runStore,
    llmAdapter: deps.llmAdapter,
  });

  if (!deps.executionJobStore) {
    app.addHook('onClose', async () => {
      executionJobStore.close();
    });
  }

  return app;
}
