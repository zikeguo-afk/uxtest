/** @vitest-environment node */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { FastifyInstance } from 'fastify';
import { createApp } from '../app';
import { mockLLMAdapter } from '../llm/mock-llm-adapter';
import { RunStore } from '../store/run-store';

let app: FastifyInstance;
let runStore: RunStore;

beforeAll(async () => {
  runStore = new RunStore({
    ttlMs: 2 * 60 * 60 * 1000,
    maxSize: 200,
    cleanupIntervalMs: 10 * 60 * 1000,
  });

  app = await createApp({
    env: {
      apiPort: 8787,
      runTtlMs: 2 * 60 * 60 * 1000,
      runCacheSize: 200,
      runCleanupIntervalMs: 10 * 60 * 1000,
      corsOrigin: '*',
      evaluationMode: 'mock',
      evaluatorTimeoutMs: 30_000,
      evaluatorAllowInsecureTls: true,
      llmProvider: 'mock',
      llmApiBaseUrl: 'https://api.openai.com/v1',
      llmApiKey: '',
      llmModel: 'gpt-4o-mini',
      llmTimeoutMs: 20_000,
      llmTemperature: 0.2,
      llmStageRetryCount: 2,
      llmJsonRepairCount: 1,
      llmChunkTokenBudget: 1_600,
      diagnosisPipelineMode: 'llm-4stage',
      sourceCollectSameOriginOnly: true,
      sourceCollectMaxTotalBytes: 2_500_000,
      diagnosisStrictTasks: false,
      diagnosisTaskBlacklist: ['购物车', '结账'],
    },
    runStore,
    llmAdapter: mockLLMAdapter,
  });

  await app.ready();
});

afterAll(async () => {
  runStore.close();
  await app.close();
});

describe('API integration', () => {
  it('returns llm health with responsibilities', async () => {
    const res = await request(app.server).get('/api/v1/llm/healthz');

    expect(res.status).toBe(200);
    expect(res.body.provider).toBe('mock');
    expect(Array.isArray(res.body.responsibilities)).toBe(true);
    expect(res.body.responsibilities.length).toBeGreaterThan(0);
  });

  it('returns diagnosis items and task list for target url', async () => {
    const res = await request(app.server)
      .post('/api/v1/diagnosis')
      .send({ targetUrl: 'https://example.com' });

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.items)).toBe(true);
    expect(res.body.items.length).toBeGreaterThan(0);
    expect(Array.isArray(res.body.tasks)).toBe(true);
    expect(res.body.tasks.length).toBeGreaterThan(0);
    expect(res.body.taskGeneration).toBeTruthy();
    expect(res.body.taskGeneration.status).toBe('success');
    expect(typeof res.body.source).toBe('string');
  });

  it('creates diagnosis job and returns progress/result', async () => {
    const createRes = await request(app.server)
      .post('/api/v1/diagnosis/jobs')
      .send({ targetUrl: 'https://example.com' });

    expect(createRes.status).toBe(200);
    expect(typeof createRes.body.jobId).toBe('string');
    expect(createRes.body.progress).toBeTruthy();
    expect(Array.isArray(createRes.body.progress.stages)).toBe(true);

    const jobId = createRes.body.jobId as string;
    let status = '';
    let latestBody: Record<string, unknown> = {};

    for (let i = 0; i < 20; i += 1) {
      const statusRes = await request(app.server).get(`/api/v1/diagnosis/jobs/${jobId}`);
      expect(statusRes.status).toBe(200);
      status = statusRes.body.status;
      latestBody = statusRes.body as Record<string, unknown>;
      if (status === 'completed' || status === 'failed') {
        break;
      }
    }

    expect(status).toBe('completed');
    expect(latestBody.result).toBeTruthy();
  });

  it('rejects invalid run request with too few tasks', async () => {
    const res = await request(app.server)
      .post('/api/v1/runs')
      .send({
        selectedTaskIds: [1, 2],
        categorySelections: [{ categoryId: 'cat-speed', count: 1 }],
        maxCases: 40,
      });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('creates run and serves report/question endpoints', async () => {
    const createRes = await request(app.server)
      .post('/api/v1/runs')
      .send({
        selectedTaskIds: [1, 3, 6],
        categorySelections: [
          { categoryId: 'cat-speed', count: 3 },
          { categoryId: 'cat-senior', count: 1 },
        ],
        maxCases: 40,
      });

    expect(createRes.status).toBe(200);
    expect(typeof createRes.body.runId).toBe('string');
    expect(Array.isArray(createRes.body.executions)).toBe(true);
    expect(createRes.body.executions.length).toBeLessThanOrEqual(40);

    const runId = createRes.body.runId as string;

    const reportRes = await request(app.server).post(`/api/v1/runs/${runId}/report`).send({});
    expect(reportRes.status).toBe(200);
    expect(Array.isArray(reportRes.body.quantitativeMetrics)).toBe(true);
    expect(reportRes.body.finalReportBundle).toBeTruthy();

    const questionRes = await request(app.server)
      .post(`/api/v1/runs/${runId}/questions`)
      .send({
        scope: 'global',
        question: '当前主要瓶颈是什么？',
      });

    expect(questionRes.status).toBe(200);
    expect(Array.isArray(questionRes.body.evidence)).toBe(true);
  });

  it('returns RUN_NOT_FOUND for missing run', async () => {
    const res = await request(app.server)
      .post('/api/v1/runs/run-missing/questions')
      .send({ scope: 'global', question: 'test' });

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('RUN_NOT_FOUND');
  });
});
