import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import { registerCors } from './plugins/cors';
import { registerErrorHandler } from './plugins/error-handler';
import { diagnosisRoutes } from './routes/diagnosis';
import { healthRoutes } from './routes/health';
import { questionsRoutes } from './routes/questions';
import { reportRoutes } from './routes/report';
import { runsRoutes } from './routes/runs';
import { taskGeneratorRoutes } from './routes/task-generator';
import type { EnvConfig } from './config/env';
import type { LLMAdapter } from './llm/adapter';
import { RunStore } from './store/run-store';

export interface AppDeps {
  env: EnvConfig;
  runStore: RunStore;
  llmAdapter: LLMAdapter;
}

export async function createApp(deps: AppDeps): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  const startedAtByRequestId = new Map<string, number>();

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

  await app.register(healthRoutes, { prefix: '/api/v1', llmAdapter: deps.llmAdapter });
  await app.register(diagnosisRoutes, {
    prefix: '/api/v1',
    evaluationMode: deps.env.evaluationMode,
    evaluatorTimeoutMs: deps.env.evaluatorTimeoutMs,
    evaluatorAllowInsecureTls: deps.env.evaluatorAllowInsecureTls,
  });
  await app.register(runsRoutes, { prefix: '/api/v1', runStore: deps.runStore });
  await app.register(reportRoutes, { prefix: '/api/v1', runStore: deps.runStore });
  await app.register(questionsRoutes, {
    prefix: '/api/v1',
    runStore: deps.runStore,
    llmAdapter: deps.llmAdapter,
  });
  await app.register(taskGeneratorRoutes, {
    prefix: '/api/v1',
    evaluatorTimeoutMs: deps.env.evaluatorTimeoutMs,
    evaluatorAllowInsecureTls: deps.env.evaluatorAllowInsecureTls,
  });

  return app;
}
