/** @vitest-environment node */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createOpenAICompatibleAdapter } from '../llm/openai-compatible-adapter';
import type { LLMTaskStageInput } from '../types/domain';

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

function createTaskStageInput(): LLMTaskStageInput {
  return {
    targetUrl: 'https://example.com',
    sourceBundle: {
      targetUrl: 'https://example.com',
      finalUrl: 'https://example.com/',
      mainDocument: {
        artifactId: 'artifact-main',
        url: 'https://example.com/',
        type: 'html',
        content: '<html><head><title>Example</title></head><body><button>开始</button></body></html>',
        hash: 'hash-main',
        bytes: 128,
        status: 'fetched',
      },
      artifacts: [],
      stats: {
        artifactCount: 1,
        totalBytes: 128,
        durationMs: 300,
        failedArtifacts: [],
      },
    },
    packagedCode: {
      chunks: [
        {
          chunkId: 'chunk-1',
          artifactIds: ['artifact-main'],
          content: 'button:开始',
          bytes: 24,
          tokenEstimate: 12,
        },
      ],
      chunkCount: 1,
      artifactCount: 1,
      totalBytes: 24,
      totalTokenEstimate: 12,
    },
    crawl: {
      finalUrl: 'https://example.com/',
      statusCode: 200,
      loadTimeMs: 300,
      title: 'Example',
      language: 'zh-CN',
      summary: 'crawl ok',
    },
    structure: {
      summary: 'structure ok',
      pageSummary: {
        finalUrl: 'https://example.com/',
        title: 'Example',
        language: 'zh-CN',
        statusCode: 200,
        loadTimeMs: 300,
        hasViewportMeta: true,
        hasMainLandmark: true,
        interactiveCount: 1,
        formsCount: 0,
        imagesCount: 0,
        imagesWithoutAlt: 0,
        headingsCount: 1,
        headingsText: ['Example'],
        primaryLinks: [],
        primaryButtons: ['开始'],
        primaryInputs: [],
        bodyPreview: '示例页面',
        codeCapabilities: ['主流程'],
        evidenceRefs: [
          {
            refId: 'interaction:button-1',
            source: 'interaction',
            label: '按钮：开始',
            excerpt: '开始',
          },
        ],
        allowedEvidenceRefIds: ['interaction:button-1'],
      },
    },
    risk: {
      summary: 'risk ok',
      diagnosisItems: [{ dimension: '流程可达', status: 'success', description: '路径可达' }],
    },
    taskCatalog: Array.from({ length: 15 }, (_, index) => ({
      id: index + 1,
      name: `用户任务${index + 1}：主流程验证`,
      description: `用户完成第 ${index + 1} 项主流程操作`,
    })),
  };
}

describe('diagnosis lenient task recovery', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('auto-fills missing fields and returns fixed 15 tasks in degraded mode', async () => {
    const invalidPayload = {
      summary: 'partial payload',
      prioritizedTaskIds: [1, 2, 3],
      taskProposals: [
        {
          id: 1,
          name: 'main-flow-task',
          description: '验证主流程',
          testScenario: '用户尝试完成流程',
          // operationSteps missing
          // successCriteria missing
          evidenceRefs: ['interaction:button-1'],
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
    expect(result.output.taskProposals).toHaveLength(15);
    expect(result.output.taskProposals[0]?.name).toMatch(/用户/);
    expect(result.output.taskProposals[0]?.operationSteps?.length).toBeGreaterThanOrEqual(3);
    expect(result.output.taskProposals[0]?.successCriteria?.length).toBeGreaterThanOrEqual(2);
    expect(result.quality?.autoFilledCount ?? 0).toBeGreaterThan(0);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});

