import type { FastifyPluginAsync } from 'fastify';
import type { LLMAdapter, LLMHealthReport } from '../llm/adapter';

interface HealthRouteOptions {
  llmAdapter: LLMAdapter;
}

function normalizeProbe(raw: unknown): boolean {
  if (typeof raw !== 'string') {
    return false;
  }

  return ['1', 'true', 'yes', 'on'].includes(raw.trim().toLowerCase());
}

function buildFallbackHealth(llmAdapter: LLMAdapter): LLMHealthReport {
  return {
    provider: llmAdapter.kind,
    model: 'unknown',
    configured: llmAdapter.kind === 'mock',
    reachable: llmAdapter.kind === 'mock',
    message: llmAdapter.kind === 'mock' ? 'mock 适配器可用。' : '适配器未提供 healthCheck 方法。',
    checkedAt: new Date().toISOString(),
  };
}

export const healthRoutes: FastifyPluginAsync<HealthRouteOptions> = async (app, options) => {
  app.get('/healthz', async () => ({ ok: true, llmProvider: options.llmAdapter.kind }));

  app.get('/llm/healthz', async (request) => {
    const query = request.query as { probe?: string };
    const probe = normalizeProbe(query?.probe);

    const report = options.llmAdapter.healthCheck
      ? await options.llmAdapter.healthCheck(probe)
      : buildFallbackHealth(options.llmAdapter);

    const ok = probe ? report.reachable : report.configured;

    return {
      ok,
      probe,
      responsibilities: options.llmAdapter.getResponsibilities(),
      ...report,
    };
  });
};
