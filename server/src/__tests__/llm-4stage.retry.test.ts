/** @vitest-environment node */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createOpenAICompatibleAdapter } from '../llm/openai-compatible-adapter';
import { createApp } from '../app';
import { RunStore } from '../store/run-store';
import type { LLMAdapter } from '../llm/adapter';
import type { CollectedSourceBundle, LLMTaskStageInput } from '../types/domain';

const collectSourceBundleMock = vi.fn();

vi.mock('../domain/source-collector', () => ({
  collectSourceBundle: (...args: unknown[]) => collectSourceBundleMock(...args),
}));

function createEnv() {
  return {
    apiPort: 8787,
    runTtlMs: 2 * 60 * 60 * 1000,
    runCacheSize: 200,
    runCleanupIntervalMs: 10 * 60 * 1000,
    corsOrigin: '*',
    evaluationMode: 'auto' as const,
    evaluatorTimeoutMs: 30_000,
    evaluatorAllowInsecureTls: true,
    llmProvider: 'openai-compatible' as const,
    llmApiBaseUrl: 'https://api.openai.com/v1',
    llmApiKey: 'test',
    llmModel: 'glm-4.7',
    llmTimeoutMs: 20_000,
    llmTemperature: 0.2,
    llmStageRetryCount: 2,
    llmJsonRepairCount: 1,
    llmChunkTokenBudget: 1_600,
    diagnosisPipelineMode: 'llm-4stage' as const,
    sourceCollectSameOriginOnly: true,
    sourceCollectMaxTotalBytes: 2_500_000,
    diagnosisStrictTasks: true,
    diagnosisTaskBlacklist: ['购物车', '结账', '优惠券', '下单', '收货地址', 'sku', '订单', '支付'],
  };
}

function createSourceBundleFixture(): CollectedSourceBundle {
  const html = '<html><head><title>Retry Demo</title></head><body><button>提交</button></body></html>';
  return {
    targetUrl: 'https://retry.example.com/',
    finalUrl: 'https://retry.example.com/',
    mainDocument: {
      artifactId: 'artifact-main-document',
      url: 'https://retry.example.com/',
      type: 'html',
      content: html,
      hash: 'hash-main',
      bytes: Buffer.byteLength(html, 'utf8'),
      status: 'fetched',
    },
    artifacts: [],
    stats: {
      artifactCount: 1,
      totalBytes: Buffer.byteLength(html, 'utf8'),
      durationMs: 180,
      failedArtifacts: [],
    },
  };
}

function createTaskStageInput(): LLMTaskStageInput {
  const sourceBundle = createSourceBundleFixture();
  return {
    targetUrl: sourceBundle.targetUrl,
    sourceBundle,
    packagedCode: {
      chunks: [
        {
          chunkId: 'chunk-1',
          artifactIds: [sourceBundle.mainDocument.artifactId],
          content: sourceBundle.mainDocument.content,
          bytes: sourceBundle.mainDocument.bytes,
          tokenEstimate: 120,
        },
      ],
      chunkCount: 1,
      artifactCount: 1,
      totalBytes: sourceBundle.mainDocument.bytes,
      totalTokenEstimate: 120,
    },
    crawl: {
      finalUrl: sourceBundle.finalUrl,
      statusCode: 200,
      loadTimeMs: 320,
      title: 'Retry Demo',
      language: 'zh-CN',
      summary: '抓取成功',
    },
    structure: {
      summary: '结构已解析',
      pageSummary: {
        finalUrl: sourceBundle.finalUrl,
        title: 'Retry Demo',
        language: 'zh-CN',
        statusCode: 200,
        loadTimeMs: 320,
        hasViewportMeta: true,
        hasMainLandmark: true,
        interactiveCount: 1,
        formsCount: 0,
        imagesCount: 0,
        imagesWithoutAlt: 0,
        headingsCount: 1,
        headingsText: ['Retry'],
        primaryLinks: [],
        primaryButtons: ['提交'],
        primaryInputs: [],
        bodyPreview: '测试页面',
        codeCapabilities: ['提交流程'],
        evidenceRefs: [
          {
            refId: 'text:body-1',
            source: 'text',
            label: '正文',
            excerpt: '测试页面',
          },
        ],
        allowedEvidenceRefIds: ['text:body-1'],
      },
    },
    risk: {
      summary: '风险较低',
      diagnosisItems: [
        {
          dimension: '流程可达',
          status: 'success',
          description: '路径清晰',
        },
      ],
    },
    taskCatalog: [{ id: 1, name: '提交流程验证', description: '验证提交路径' }],
  };
}

function createChatResponse(payload: Record<string, unknown>): Response {
  return new Response(
    JSON.stringify({
      choices: [
        {
          message: {
            content: JSON.stringify(payload),
          },
        },
      ],
    }),
    {
      status: 200,
      headers: { 'content-type': 'application/json' },
    },
  );
}

describe('llm-4stage retry behavior', () => {
  beforeEach(() => {
    collectSourceBundleMock.mockReset();
    collectSourceBundleMock.mockResolvedValue(createSourceBundleFixture());
  });

  afterEach(() => {
    collectSourceBundleMock.mockReset();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('recovers on retry when first task-stage payload misses required fields', async () => {
    const invalidPayload = {
      summary: 'first attempt invalid',
      prioritizedTaskIds: [1],
      taskProposals: [
        {
          id: 1,
          name: '提交流程验证',
          description: '验证提交路径',
          difficulty: '中等',
          estimatedDuration: '8-12分钟',
          testScenario: '用户提交一次请求',
          // operationSteps intentionally missing
          successCriteria: ['提交成功', '结果可确认'],
          tags: ['提交'],
          evidenceRefs: ['text:body-1'],
          evidenceReason: '页面正文可证明存在提交流程。',
        },
      ],
    };

    const validPayload = {
      summary: 'retry success',
      prioritizedTaskIds: [1],
      taskProposals: [
        {
          id: 1,
          name: '提交流程验证',
          description: '验证提交路径',
          difficulty: '中等',
          estimatedDuration: '8-12分钟',
          testScenario: '用户提交一次请求',
          operationSteps: ['进入页面', '执行提交动作', '确认返回结果'],
          successCriteria: ['提交成功', '结果可确认'],
          tags: ['提交'],
          evidenceRefs: ['text:body-1'],
          evidenceReason: '页面正文可证明存在提交流程。',
        },
      ],
    };

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(createChatResponse(invalidPayload))
      .mockResolvedValueOnce(createChatResponse(validPayload));
    vi.stubGlobal('fetch', fetchMock);

    const adapter = createOpenAICompatibleAdapter({
      baseUrl: 'https://api.openai.com/v1',
      apiKey: 'test-key',
      model: 'glm-4.7',
      timeoutMs: 10_000,
      temperature: 0.2,
      stageRetryCount: 2,
      jsonRepairCount: 0,
    });

    const result = await adapter.runTaskStage(createTaskStageInput());
    expect(result.attempts).toBe(2);
    expect(result.output.taskProposals[0]?.operationSteps?.length).toBeGreaterThanOrEqual(3);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('returns degraded task output after schema retries are exhausted', async () => {
    const invalidPayload = {
      summary: 'still invalid',
      prioritizedTaskIds: [1],
      taskProposals: [
        {
          id: 1,
          name: '提交流程验证',
          description: '验证提交路径',
          difficulty: '中等',
          estimatedDuration: '8-12分钟',
          testScenario: '用户提交一次请求',
          successCriteria: ['提交成功', '结果可确认'],
          tags: ['提交'],
          evidenceRefs: ['text:body-1'],
          evidenceReason: '页面正文可证明存在提交流程。',
        },
      ],
    };

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(createChatResponse(invalidPayload))
      .mockResolvedValueOnce(createChatResponse(invalidPayload))
      .mockResolvedValueOnce(createChatResponse(invalidPayload));
    vi.stubGlobal('fetch', fetchMock);

    const adapter = createOpenAICompatibleAdapter({
      baseUrl: 'https://api.openai.com/v1',
      apiKey: 'test-key',
      model: 'glm-4.7',
      timeoutMs: 10_000,
      temperature: 0.2,
      stageRetryCount: 2,
      jsonRepairCount: 0,
    });

    const result = await adapter.runTaskStage(createTaskStageInput());
    expect(result.degraded).toBe(true);
    expect(result.quality?.autoFilledCount ?? 0).toBeGreaterThan(0);
    expect(result.output.taskProposals.length).toBeGreaterThanOrEqual(1);
    expect(result.output.taskProposals[0]?.operationSteps?.length).toBeGreaterThanOrEqual(3);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('blocks diagnosis flow when task stage keeps failing after retries', async () => {
    const llmAdapter: LLMAdapter = {
      kind: 'test-llm',
      enhanceInference: async () => ({ answer: 'ok', confidenceDelta: 0 }),
      runCrawlStage: async () => ({
        output: {
          finalUrl: 'https://retry.example.com/',
          statusCode: 200,
          loadTimeMs: 500,
          title: 'Retry Demo',
          language: 'zh-CN',
          summary: 'crawl ok',
        },
        attempts: 1,
        repaired: false,
      }),
      runStructureStage: async () => ({
        output: {
          summary: 'structure ok',
          pageSummary: {
            finalUrl: 'https://retry.example.com/',
            title: 'Retry Demo',
            language: 'zh-CN',
            statusCode: 200,
            loadTimeMs: 500,
            hasViewportMeta: true,
            hasMainLandmark: true,
            interactiveCount: 1,
            formsCount: 0,
            imagesCount: 0,
            imagesWithoutAlt: 0,
            headingsCount: 1,
            headingsText: ['Retry'],
            primaryLinks: [],
            primaryButtons: ['提交'],
            primaryInputs: [],
            bodyPreview: '测试页面',
            codeCapabilities: ['提交流程'],
            evidenceRefs: [
              {
                refId: 'text:body-1',
                source: 'text',
                label: '正文',
                excerpt: '测试页面',
              },
            ],
            allowedEvidenceRefIds: ['text:body-1'],
          },
        },
        attempts: 1,
        repaired: false,
      }),
      runRiskStage: async () => ({
        output: {
          summary: 'risk ok',
          diagnosisItems: [
            {
              dimension: '流程可达',
              status: 'success',
              description: '路径清晰',
            },
          ],
        },
        attempts: 1,
        repaired: false,
      }),
      runTaskStage: async () => {
        throw new Error(
          'STAGE_SCHEMA_INVALID:tasks:LLM 输出缺少字段 operationSteps',
        );
      },
      summarizeStage: async (input) => input.runtimeDetail,
      generateDiagnosisAndTasks: async () => ({
        diagnosisItems: [],
        prioritizedTaskIds: [],
        taskProposals: [],
      }),
      getResponsibilities: () => ['test'],
    };

    const app = await createApp({
      env: createEnv(),
      runStore: new RunStore({
        ttlMs: 60_000,
        maxSize: 20,
        cleanupIntervalMs: 30_000,
      }),
      llmAdapter,
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/diagnosis',
      payload: { targetUrl: 'https://retry.example.com' },
    });
    const payload = response.json();

    expect(response.statusCode).toBe(200);
    expect(payload.source).toBe('diagnosis-only');
    expect(payload.tasks).toEqual([]);
    expect(payload.taskGeneration.status).toBe('failed');
    expect(payload.taskGeneration.blocked).toBe(true);
    expect(String(payload.taskGeneration.message)).toContain('STAGE_SCHEMA_INVALID');

    await app.close();
  });
});
