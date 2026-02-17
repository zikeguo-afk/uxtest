/** @vitest-environment node */
import { describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../app';
import { RunStore } from '../store/run-store';
import type { LLMAdapter } from '../llm/adapter';

const inspectLiveUrlMock = vi.fn();
const buildLiveDiagnosisMock = vi.fn();

vi.mock('../domain/live-url-evaluator', () => ({
  inspectLiveUrl: (...args: unknown[]) => inspectLiveUrlMock(...args),
  buildLiveDiagnosis: (...args: unknown[]) => buildLiveDiagnosisMock(...args),
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
    llmModel: 'test-model',
    llmTimeoutMs: 20_000,
    llmTemperature: 0.2,
    llmStageRetryCount: 2,
    llmJsonRepairCount: 1,
    llmChunkTokenBudget: 1_600,
    diagnosisPipelineMode: 'legacy' as const,
    sourceCollectSameOriginOnly: true,
    sourceCollectMaxTotalBytes: 2_500_000,
    diagnosisStrictTasks: true,
    diagnosisTaskBlacklist: ['购物车', '结账', '优惠券', '下单', '收货地址', 'sku', '订单', '支付'],
  };
}

function createAnalysisFixture() {
  return {
    normalizedUrl: 'https://example.com/',
    finalUrl: 'https://example.com/',
    statusCode: 200,
    loadTimeMs: 142,
    title: 'Example Console',
    htmlLang: 'zh-CN',
    hasViewportMeta: true,
    hasMainLandmark: true,
    counts: {
      links: 8,
      buttons: 6,
      inputs: 4,
      forms: 2,
      headings: 5,
      images: 2,
      imagesWithoutAlt: 0,
      interactive: 18,
    },
    featureHints: {
      headingsText: ['控制台首页', '用户管理', '支付中心'],
      primaryLinks: ['仪表盘', '订单中心', '帮助文档'],
      primaryButtons: ['创建用户', '支付对账', '导出报告'],
      primaryInputs: ['搜索用户', '筛选状态'],
      bodyPreview: '这是一个企业控制台，用于支付对账、订单查询和用户管理。',
      codeCapabilities: ['支付与订单', '报表与数据分析', '表单提交与校验'],
    },
    evidenceIndex: {
      dom: [
        {
          refId: 'dom:title-1',
          source: 'dom' as const,
          label: '页面标题',
          excerpt: 'Example Console',
        },
      ],
      interactions: [
        {
          refId: 'interaction:button-1',
          source: 'interaction' as const,
          label: '按钮:支付对账',
          excerpt: '支付对账',
        },
        {
          refId: 'interaction:input-1',
          source: 'interaction' as const,
          label: '输入:搜索用户',
          excerpt: '搜索用户',
        },
      ],
      routesAndScripts: [
        {
          refId: 'route-script:capability-1',
          source: 'route-script' as const,
          label: '支付与订单',
          excerpt: '支付与订单',
        },
      ],
      text: [
        {
          refId: 'text:body-1',
          source: 'text' as const,
          label: '正文片段1',
          excerpt: '该系统支持支付管理和订单流程。',
        },
      ],
    },
  };
}

function createUnusedStageMethods() {
  return {
    runCrawlStage: async () => ({
      output: {
        finalUrl: 'https://example.com/',
        statusCode: 200,
        loadTimeMs: 100,
        title: 'unused',
        language: 'zh-CN',
        summary: 'unused',
      },
      attempts: 1,
      repaired: false,
      rawSnippet: 'unused',
    }),
    runStructureStage: async () => ({
      output: {
        summary: 'unused',
        pageSummary: {
          finalUrl: 'https://example.com/',
          title: 'unused',
          language: 'zh-CN',
          statusCode: 200,
          loadTimeMs: 100,
          hasViewportMeta: true,
          hasMainLandmark: true,
          interactiveCount: 1,
          formsCount: 0,
          imagesCount: 0,
          imagesWithoutAlt: 0,
          headingsCount: 1,
          headingsText: [],
          primaryLinks: [],
          primaryButtons: [],
          primaryInputs: [],
          bodyPreview: '',
          codeCapabilities: [],
          evidenceRefs: [
            {
              refId: 'text:body-1',
              source: 'text' as const,
              label: 'unused',
              excerpt: 'unused',
            },
          ],
          allowedEvidenceRefIds: ['text:body-1'],
        },
      },
      attempts: 1,
      repaired: false,
      rawSnippet: 'unused',
    }),
    runRiskStage: async () => ({
      output: {
        summary: 'unused',
        diagnosisItems: [
          { dimension: '结构化导航', status: 'success' as const, description: '导航层级可理解。' },
        ],
      },
      attempts: 1,
      repaired: false,
      rawSnippet: 'unused',
    }),
    runTaskStage: async () => ({
      output: {
        summary: 'unused',
        prioritizedTaskIds: [1],
        taskProposals: [
          {
            id: 1,
            name: 'unused',
            description: 'unused',
            difficulty: '中等' as const,
            estimatedDuration: '8-12分钟',
            testScenario: 'unused',
            operationSteps: ['a', 'b', 'c'],
            successCriteria: ['x', 'y'],
            tags: ['unused'],
            evidenceRefs: ['text:body-1'],
            evidenceReason: 'unused',
          },
        ],
      },
      attempts: 1,
      repaired: false,
      rawSnippet: 'unused',
    }),
  } as const;
}

describe('Diagnosis progress detail', () => {
  it('returns dynamic stage details with source flags', async () => {
    inspectLiveUrlMock.mockResolvedValue(createAnalysisFixture());
    buildLiveDiagnosisMock.mockReturnValue([
      { dimension: '结构化导航', status: 'success' as const, description: '导航层级可理解。' },
    ]);

    const llmAdapter: LLMAdapter = {
      kind: 'test-llm',
      ...createUnusedStageMethods(),
      summarizeStage: async (input) => `[LLM] ${input.stageLabel}: ${input.runtimeDetail}`,
      generateDiagnosisAndTasks: async () => ({
        diagnosisItems: [
          { dimension: '结构化导航', status: 'success' as const, description: '导航层级可理解。' },
        ],
        prioritizedTaskIds: [1, 2, 3],
        taskProposals: [
          {
            id: 1,
            name: '支付对账流程验证',
            description: '验证支付对账流程可完成并可追溯。',
            difficulty: '中等',
            estimatedDuration: '8-12分钟',
            testScenario: '财务同学需要完成支付对账并导出结果。',
            operationSteps: ['进入支付中心', '执行对账', '导出报表'],
            successCriteria: ['对账成功', '导出结果可查看'],
            tags: ['支付', '对账'],
            evidenceRefs: ['interaction:button-1', 'route-script:capability-1'],
            evidenceReason: '页面存在支付按钮与支付能力证据。',
          },
          {
            id: 2,
            name: '订单查询流程验证',
            description: '验证订单查询和筛选路径。',
            difficulty: '中等',
            estimatedDuration: '6-10分钟',
            testScenario: '运营同学需要查询指定订单并筛选状态。',
            operationSteps: ['进入订单中心', '输入查询条件', '筛选并查看详情'],
            successCriteria: ['订单可查到', '筛选结果准确'],
            tags: ['订单', '查询'],
            evidenceRefs: ['text:body-1'],
            evidenceReason: '正文证据明确包含订单流程。',
          },
          {
            id: 3,
            name: '用户检索流程验证',
            description: '验证用户检索与信息查看流程。',
            difficulty: '简单',
            estimatedDuration: '5-8分钟',
            testScenario: '客服同学需要检索目标用户。',
            operationSteps: ['输入用户关键词', '执行检索', '查看用户详情'],
            successCriteria: ['检索成功', '结果反馈明确'],
            tags: ['检索'],
            evidenceRefs: ['interaction:input-1'],
            evidenceReason: '页面存在搜索用户输入框。',
          },
        ],
      }),
      enhanceInference: async (input) => ({ answer: input.draftAnswer }),
      getResponsibilities: () => ['progress detail test'],
    };

    const runStore = new RunStore({
      ttlMs: 2 * 60 * 60 * 1000,
      maxSize: 200,
      cleanupIntervalMs: 10 * 60 * 1000,
    });

    const app = await createApp({
      env: createEnv(),
      runStore,
      llmAdapter,
    });

    await app.ready();
    try {
      const createRes = await request(app.server)
        .post('/api/v1/diagnosis/jobs')
        .send({ targetUrl: 'https://example.com' });
      expect(createRes.status).toBe(200);

      const jobId = createRes.body.jobId as string;
      let latest = null as Record<string, unknown> | null;

      for (let i = 0; i < 15; i += 1) {
        const statusRes = await request(app.server).get(`/api/v1/diagnosis/jobs/${jobId}`);
        expect(statusRes.status).toBe(200);
        latest = statusRes.body as Record<string, unknown>;
        if (statusRes.body.status === 'completed') {
          break;
        }
      }

      expect(latest).not.toBeNull();
      expect((latest as { status: string }).status).toBe('completed');
      const progress = (latest as { progress: { stages: Array<Record<string, unknown>> } }).progress;
      expect(progress.stages).toHaveLength(4);
      for (const stage of progress.stages) {
        expect(typeof stage.detail).toBe('string');
        expect((stage.detail as string).length).toBeGreaterThan(0);
        expect(['runtime-log', 'llm-summary']).toContain(stage.detailSource);
      }
      const taskStage = progress.stages.find((stage) => stage.id === 'tasks');
      expect(taskStage).toBeTruthy();
      expect(String(taskStage?.detail)).toContain('[LLM]');
    } finally {
      runStore.close();
      await app.close();
    }
  });

  it('keeps tasks stage as error and exposes resolver stats when gate blocks tasks', async () => {
    inspectLiveUrlMock.mockResolvedValue(createAnalysisFixture());
    buildLiveDiagnosisMock.mockReturnValue([
      { dimension: '结构化导航', status: 'success' as const, description: '导航层级可理解。' },
    ]);

    const llmAdapter: LLMAdapter = {
      kind: 'test-llm',
      ...createUnusedStageMethods(),
      summarizeStage: async (input) => input.runtimeDetail,
      generateDiagnosisAndTasks: async () => ({
        diagnosisItems: [
          { dimension: '结构化导航', status: 'success' as const, description: '导航层级可理解。' },
        ],
        prioritizedTaskIds: [1, 2],
        taskProposals: [
          {
            id: 1,
            name: '支付对账流程验证',
            description: '验证支付对账流程可完成并可追溯。',
            difficulty: '中等',
            estimatedDuration: '8-12分钟',
            testScenario: '财务同学需要完成支付对账并导出结果。',
            operationSteps: ['进入支付中心', '执行对账', '导出报表'],
            successCriteria: ['对账成功', '导出结果可查看'],
            tags: ['支付', '对账'],
            evidenceRefs: ['interaction:button-1', 'route-script:capability-1'],
            evidenceReason: '页面存在支付按钮与支付能力证据。',
          },
          {
            id: 2,
            name: '模糊证据任务',
            description: '使用不完整证据引用，应该被门禁阻断。',
            difficulty: '中等',
            estimatedDuration: '6-10分钟',
            testScenario: '测试模糊证据引用。',
            operationSteps: ['进入页面', '触发流程', '检查反馈'],
            successCriteria: ['流程可触发', '反馈可见'],
            tags: ['校验'],
            evidenceRefs: ['route'],
            evidenceReason: '故意使用模糊引用。',
          },
        ],
      }),
      enhanceInference: async (input) => ({ answer: input.draftAnswer }),
      getResponsibilities: () => ['progress detail test'],
    };

    const runStore = new RunStore({
      ttlMs: 2 * 60 * 60 * 1000,
      maxSize: 200,
      cleanupIntervalMs: 10 * 60 * 1000,
    });

    const app = await createApp({
      env: createEnv(),
      runStore,
      llmAdapter,
    });

    await app.ready();
    try {
      const createRes = await request(app.server)
        .post('/api/v1/diagnosis/jobs')
        .send({ targetUrl: 'https://example.com' });
      expect(createRes.status).toBe(200);

      const jobId = createRes.body.jobId as string;
      let latest = null as Record<string, unknown> | null;

      for (let i = 0; i < 20; i += 1) {
        const statusRes = await request(app.server).get(`/api/v1/diagnosis/jobs/${jobId}`);
        expect(statusRes.status).toBe(200);
        latest = statusRes.body as Record<string, unknown>;
        if (statusRes.body.status === 'completed') {
          break;
        }
      }

      expect(latest).not.toBeNull();
      const progress = (latest as { progress: { stages: Array<Record<string, unknown>> } }).progress;
      const taskStage = progress.stages.find((stage) => stage.id === 'tasks');
      expect(taskStage).toBeTruthy();
      expect(taskStage?.status).toBe('done');

      const taskDetailRaw = String(taskStage?.detailRaw ?? '');
      const taskRaw = JSON.parse(taskDetailRaw) as {
        repairedEvidenceRefCount?: number;
        unresolvedEvidenceRefs?: string[];
        warningCount?: number;
        syntheticCount?: number;
      };
      expect(taskRaw.repairedEvidenceRefCount).toBeTypeOf('number');
      expect(Array.isArray(taskRaw.unresolvedEvidenceRefs)).toBe(true);
      expect(taskRaw.unresolvedEvidenceRefs).toContain('route');
      expect(taskRaw.warningCount).toBeTypeOf('number');
      expect(taskRaw.syntheticCount).toBeTypeOf('number');

      const result = (latest as { result?: { taskGeneration?: { status?: string }; tasks?: unknown[] } }).result;
      expect(result?.taskGeneration?.status).toBe('degraded');
      expect(Array.isArray(result?.tasks)).toBe(true);
      expect((result?.tasks ?? []).length).toBe(15);
    } finally {
      runStore.close();
      await app.close();
    }
  });
});
