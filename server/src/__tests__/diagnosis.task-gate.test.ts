/** @vitest-environment node */
import { describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import type { FastifyInstance } from 'fastify';
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
    executionJobTtlMs: 2 * 60 * 60 * 1000,
    executionJobCacheSize: 200,
    executionJobCleanupIntervalMs: 10 * 60 * 1000,
    corsOrigin: '*',
    evaluationMode: 'auto' as const,
    evaluatorTimeoutMs: 30_000,
    evaluatorAllowInsecureTls: true,
    liveRunnerEnabled: false,
    playwrightHeadless: true,
    playwrightConcurrency: 2,
    caseMaxSteps: 12,
    caseTimeoutMs: 90_000,
    stepTimeoutMs: 10_000,
    liveRunnerScreenshotEnabled: false,
    liveRunnerArtifactDir: 'server/.artifacts/live-runs-test',
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
    loadTimeMs: 128,
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

function createDiagnosisFixture() {
  return [
    {
      dimension: '结构化导航',
      status: 'success' as const,
      description: '导航层级可理解。',
    },
  ];
}

function createFifteenUserTaskProposals() {
  return Array.from({ length: 15 }, (_, index) => {
    const taskId = index + 1;
    return {
      id: taskId,
      name: `完成页面流程任务${taskId}`,
      description: `执行第${taskId}项页面操作流程并确认反馈是否清晰。`,
      difficulty: taskId % 3 === 0 ? ('困难' as const) : taskId % 2 === 0 ? ('中等' as const) : ('简单' as const),
      estimatedDuration: '8-12分钟',
      testScenario: `你是业务用户，需要在页面中完成第${taskId}项操作并确认结果。`,
      operationSteps: ['点击对应入口开始任务', '输入或选择关键内容并提交', '查看结果反馈并确认完成'],
      successCriteria: ['用户可独立完成该任务', '结果反馈明确且可继续下一步'],
      tags: ['用户任务', '流程验证'],
      evidenceRefs:
        taskId % 3 === 0
          ? ['interaction:input-1']
          : taskId % 2 === 0
            ? ['text:body-1']
            : ['interaction:button-1', 'route-script:capability-1-extra'],
      evidenceReason: '页面现有交互和文本证据可支持该用户操作任务。',
    };
  });
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
        diagnosisItems: createDiagnosisFixture(),
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

async function withApp(llmAdapter: LLMAdapter, run: (app: FastifyInstance) => Promise<void>) {
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
    await run(app);
  } finally {
    runStore.close();
    await app.close();
  }
}

describe('Diagnosis task quality gate', () => {
  it('blocks shopping-like tasks without evidence and returns diagnosis only', async () => {
    inspectLiveUrlMock.mockResolvedValue(createAnalysisFixture());
    buildLiveDiagnosisMock.mockReturnValue(createDiagnosisFixture());

    const llmAdapter: LLMAdapter = {
      kind: 'test-llm',
      ...createUnusedStageMethods(),
      generateDiagnosisAndTasks: async () => ({
        diagnosisItems: createDiagnosisFixture(),
        prioritizedTaskIds: [1, 2, 3],
        taskProposals: [
          { id: 1, name: '加入购物车', description: '将商品加入购物车' },
          { id: 2, name: '完成结账', description: '提交订单并支付' },
          { id: 3, name: '应用优惠券', description: '输入优惠券并结算' },
        ],
      }),
      enhanceInference: async (input) => ({ answer: input.draftAnswer }),
      getResponsibilities: () => ['task gate test'],
    };

    await withApp(llmAdapter, async (app) => {
      const res = await request(app.server)
        .post('/api/v1/diagnosis')
        .send({ targetUrl: 'https://example.com' });

      expect(res.status).toBe(200);
      expect(res.body.source).toBe('diagnosis-only');
      expect(Array.isArray(res.body.items)).toBe(true);
      expect(Array.isArray(res.body.tasks)).toBe(true);
      expect(res.body.tasks).toHaveLength(0);
      expect(res.body.taskGeneration.status).toBe('failed');
      expect(res.body.taskGeneration.blocked).toBe(true);
    });
  });

  it('allows blacklist terms when strong evidence exists', async () => {
    inspectLiveUrlMock.mockResolvedValue(createAnalysisFixture());
    buildLiveDiagnosisMock.mockReturnValue(createDiagnosisFixture());

    const llmAdapter: LLMAdapter = {
      kind: 'test-llm',
      ...createUnusedStageMethods(),
      generateDiagnosisAndTasks: async () => ({
        diagnosisItems: createDiagnosisFixture(),
        prioritizedTaskIds: Array.from({ length: 15 }, (_, index) => index + 1),
        taskProposals: createFifteenUserTaskProposals(),
      }),
      enhanceInference: async (input) => ({ answer: input.draftAnswer }),
      getResponsibilities: () => ['task gate test'],
    };

    await withApp(llmAdapter, async (app) => {
      const res = await request(app.server)
        .post('/api/v1/diagnosis')
        .send({ targetUrl: 'https://example.com' });

      expect(res.status).toBe(200);
      expect(res.body.source).toBe('llm');
      expect(res.body.taskGeneration.status).toBe('success');
      expect(res.body.taskGeneration.blocked).toBe(false);
      expect(res.body.tasks.length).toBe(15);
      expect(res.body.tasks[0].evidenceRefs).toContain('route-script:capability-1');
      expect(String(res.body.tasks[0].name)).not.toContain('用户完成');
      expect(String(res.body.tasks[0].name)).not.toMatch(/执行.+流程/u);
      expect(String(res.body.tasks[0].name)).not.toMatch(/react|zustand|state management/i);
    });
  });

  it('blocks when accepted tasks are fewer than required 15 and no local fill is allowed', async () => {
    inspectLiveUrlMock.mockResolvedValue(createAnalysisFixture());
    buildLiveDiagnosisMock.mockReturnValue(createDiagnosisFixture());

    const llmAdapter: LLMAdapter = {
      kind: 'test-llm',
      ...createUnusedStageMethods(),
      generateDiagnosisAndTasks: async () => ({
        diagnosisItems: createDiagnosisFixture(),
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
      getResponsibilities: () => ['task gate test'],
    };

    await withApp(llmAdapter, async (app) => {
      const res = await request(app.server)
        .post('/api/v1/diagnosis')
        .send({ targetUrl: 'https://example.com' });

      expect(res.status).toBe(200);
      expect(res.body.source).toBe('diagnosis-only');
      expect(res.body.taskGeneration.status).toBe('failed');
      expect(res.body.taskGeneration.blocked).toBe(true);
      expect(res.body.taskGeneration.code).toBe('INSUFFICIENT_LLM_TASKS');
      expect(res.body.tasks).toHaveLength(0);
    });
  });

  it('fails when task fields miss scenario/steps/criteria/evidence', async () => {
    inspectLiveUrlMock.mockResolvedValue(createAnalysisFixture());
    buildLiveDiagnosisMock.mockReturnValue(createDiagnosisFixture());

    const llmAdapter: LLMAdapter = {
      kind: 'test-llm',
      ...createUnusedStageMethods(),
      generateDiagnosisAndTasks: async () => ({
        diagnosisItems: createDiagnosisFixture(),
        prioritizedTaskIds: [1, 2, 3],
        taskProposals: [
          {
            id: 1,
            name: '用户流程验证',
            description: '验证用户流程。',
            testScenario: '',
            operationSteps: [],
            successCriteria: [],
            evidenceRefs: [],
            evidenceReason: '',
          },
        ],
      }),
      enhanceInference: async (input) => ({ answer: input.draftAnswer }),
      getResponsibilities: () => ['task gate test'],
    };

    await withApp(llmAdapter, async (app) => {
      const res = await request(app.server)
        .post('/api/v1/diagnosis')
        .send({ targetUrl: 'https://example.com' });

      expect(res.status).toBe(200);
      expect(res.body.source).toBe('diagnosis-only');
      expect(res.body.tasks).toHaveLength(0);
      expect(res.body.taskGeneration.status).toBe('failed');
      expect(res.body.taskGeneration.blocked).toBe(true);
    });
  });
});
