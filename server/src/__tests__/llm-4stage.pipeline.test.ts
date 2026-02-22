/** @vitest-environment node */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../app';
import { RunStore } from '../store/run-store';
import type { LLMAdapter } from '../llm/adapter';
import type { CollectedSourceBundle } from '../types/domain';

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
  const mainContent = `
    <html lang="zh-CN">
      <head><title>Design Studio</title></head>
      <body>
        <button id="create-project">创建项目</button>
        <button id="render-views">生成渲染图</button>
      </body>
    </html>
  `;
  return {
    targetUrl: 'https://frbe2kpuvbfve.ok.kimi.link/',
    finalUrl: 'https://frbe2kpuvbfve.ok.kimi.link/',
    mainDocument: {
      artifactId: 'artifact-main-document',
      url: 'https://frbe2kpuvbfve.ok.kimi.link/',
      type: 'html',
      content: mainContent,
      hash: 'hash-main',
      bytes: Buffer.byteLength(mainContent, 'utf8'),
      status: 'fetched',
    },
    artifacts: [
      {
        artifactId: 'artifact-1',
        url: 'https://frbe2kpuvbfve.ok.kimi.link/assets/app.js',
        type: 'javascript',
        content: 'function createProject(){} function renderViews(){}',
        hash: 'hash-js',
        bytes: 48,
        status: 'fetched',
      },
    ],
    stats: {
      artifactCount: 2,
      totalBytes: 480,
      durationMs: 240,
      failedArtifacts: [],
    },
  };
}

function createLlm4StageAdapter(): LLMAdapter {
  const prioritizedTaskIds = Array.from({ length: 15 }, (_, index) => index + 1);
  const generatedTaskProposals = prioritizedTaskIds.map((taskId) => ({
    id: taskId,
    name: `完成核心流程任务${taskId}`,
    description: `在真实页面中完成第${taskId}项核心流程操作，并确认结果反馈。`,
    difficulty: taskId % 3 === 0 ? ('困难' as const) : taskId % 2 === 0 ? ('中等' as const) : ('简单' as const),
    estimatedDuration: '8-12分钟',
    testScenario: `你是首次使用该页面的用户，需要完成第${taskId}项流程操作并确认输出是否正确。`,
    operationSteps: ['点击入口进入任务流程', '输入或选择关键参数并提交', '查看结果并确认是否完成目标'],
    successCriteria: ['用户可独立完成操作', '结果反馈清晰且与预期一致'],
    tags: ['用户任务', '操作流程'],
    evidenceRefs: taskId % 2 === 0 ? ['interaction:button-2', 'text:body-1'] : ['interaction:button-1', 'route-script:capability-1'],
    evidenceReason: '页面交互控件与脚本能力证据可支撑该用户操作任务。',
  }));

  return {
    kind: 'test-llm-4stage',
    enhanceInference: async () => ({
      answer: 'ok',
      confidenceDelta: 0,
    }),
    runCrawlStage: async () => ({
      output: {
        finalUrl: 'https://frbe2kpuvbfve.ok.kimi.link/',
        statusCode: 200,
        loadTimeMs: 927,
        title: 'Design Studio',
        language: 'zh-CN',
        summary: '抓取成功，资源2个，总代码字节约480。',
      },
      attempts: 1,
      repaired: false,
      rawSnippet: 'crawl-ok',
    }),
    runStructureStage: async () => ({
      output: {
        summary: '页面具备项目创建与多视角渲染关键路径。',
        pageSummary: {
          finalUrl: 'https://frbe2kpuvbfve.ok.kimi.link/',
          title: 'Design Studio',
          language: 'zh-CN',
          statusCode: 200,
          loadTimeMs: 927,
          hasViewportMeta: true,
          hasMainLandmark: true,
          interactiveCount: 8,
          formsCount: 1,
          imagesCount: 3,
          imagesWithoutAlt: 1,
          headingsCount: 4,
          headingsText: ['项目管理', '草图绘制', '渲染输出'],
          primaryLinks: ['项目中心', '帮助文档'],
          primaryButtons: ['创建项目', '生成渲染图'],
          primaryInputs: ['项目名称'],
          bodyPreview: '页面支持创建概念项目并生成多视角渲染图。',
          codeCapabilities: ['项目创建', '草图绘制', '多视角渲染'],
          evidenceRefs: [
            {
              refId: 'interaction:button-1',
              source: 'interaction',
              label: '按钮:创建项目',
              excerpt: 'create-project',
            },
            {
              refId: 'interaction:button-2',
              source: 'interaction',
              label: '按钮:生成渲染图',
              excerpt: 'render-views',
            },
            {
              refId: 'route-script:capability-1',
              source: 'route-script',
              label: '能力:项目创建',
              excerpt: 'function createProject',
            },
            {
              refId: 'text:body-1',
              source: 'text',
              label: '正文片段',
              excerpt: '创建项目并生成渲染图',
            },
          ],
          allowedEvidenceRefIds: [
            'interaction:button-1',
            'interaction:button-2',
            'route-script:capability-1',
            'text:body-1',
          ],
        },
      },
      attempts: 1,
      repaired: false,
      rawSnippet: 'structure-ok',
    }),
    runRiskStage: async () => ({
      output: {
        summary: '核心路径可达，但渲染结果反馈提示可加强。',
        diagnosisItems: [
          { dimension: '入口可发现性', status: 'success', description: '创建项目入口清晰。' },
          { dimension: '流程闭环', status: 'warning', description: '渲染完成反馈存在理解成本。' },
          { dimension: '可恢复性', status: 'warning', description: '异常重试路径提示较弱。' },
        ],
      },
      attempts: 1,
      repaired: false,
      rawSnippet: 'risk-ok',
    }),
    runTaskStage: async () => ({
      output: {
        summary: '已基于页面能力生成任务。',
        prioritizedTaskIds,
        taskProposals: generatedTaskProposals,
      },
      attempts: 1,
      repaired: false,
      rawSnippet: 'tasks-ok',
    }),
    summarizeStage: async (input) => `[摘要] ${input.runtimeDetail}`,
    generateDiagnosisAndTasks: async () => ({
      diagnosisItems: [],
      prioritizedTaskIds: [],
      taskProposals: [],
    }),
    getResponsibilities: () => ['test'],
  };
}

describe('llm-4stage diagnosis pipeline', () => {
  beforeEach(() => {
    collectSourceBundleMock.mockReset();
    collectSourceBundleMock.mockResolvedValue(createSourceBundleFixture());
  });

  afterEach(() => {
    collectSourceBundleMock.mockReset();
  });

  it('returns llm-4stage source and generated tasks when all stages succeed', async () => {
    const app = await createApp({
      env: createEnv(),
      runStore: new RunStore({
        ttlMs: 60_000,
        maxSize: 20,
        cleanupIntervalMs: 30_000,
      }),
      llmAdapter: createLlm4StageAdapter(),
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/diagnosis',
      payload: { targetUrl: 'https://frbe2kpuvbfve.ok.kimi.link' },
    });
    const payload = response.json();

    expect(response.statusCode).toBe(200);
    expect(payload.source).toBe('llm-4stage');
    expect(payload.taskGeneration.status).toBe('success');
    expect(payload.taskGeneration.blocked).toBe(false);
    expect(Array.isArray(payload.tasks)).toBe(true);
    expect(payload.tasks.length).toBe(15);
    expect(payload.tasks.every((task: { name: string }) => !/执行.+流程/u.test(task.name))).toBe(true);
    expect(payload.tasks.every((task: { name: string }) => !/react|zustand|state management/i.test(task.name))).toBe(true);
    expect(collectSourceBundleMock).toHaveBeenCalledTimes(1);

    await app.close();
  });
});
