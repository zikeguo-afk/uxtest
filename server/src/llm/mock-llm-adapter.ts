import type { LLMAdapter } from './adapter';

export const mockLLMAdapter: LLMAdapter = {
  kind: 'mock',
  generatePersonas(input) {
    return {
      profiles: Array.from({ length: input.count }, (_, index) => ({
        persona: `${input.categoryPersona}（样本${index + 1}）`,
        goal: input.categoryGoal,
        behaviorBias: index % 2 === 0 ? '谨慎操作' : '效率优先',
        languageStyle: index % 2 === 0 ? '简洁' : '详细',
        frictionSensitivity: Math.min(100, 45 + index * 3),
        traits: {
          patience: Math.max(0, Math.min(100, input.baseTraits.patience + (index % 3) - 1)),
          techSavvy: Math.max(0, Math.min(100, input.baseTraits.techSavvy + (index % 5) - 2)),
          attention: Math.max(0, Math.min(100, input.baseTraits.attention + (index % 4) - 1)),
        },
      })),
    };
  },
  planExecutionCase(input) {
    const plannedSteps = input.task.operationSteps && input.task.operationSteps.length > 0
      ? input.task.operationSteps.slice(0, 6)
      : ['打开页面并定位入口', '执行关键操作', '确认结果反馈'];

    return {
      summary: `mock 计划：${input.persona.name} 将完成「${input.task.name}」`,
      plannedSteps,
    };
  },
  decideExecutionStep(input) {
    const step = input.currentStepIndex;
    const hints = input.pageObservation.elementHints;
    if (step >= input.plannedSteps.length) {
      return {
        action: {
          type: 'finish',
          reason: '已完成计划步骤',
        },
      };
    }
    if (hints.length === 0) {
      return {
        action: {
          type: 'wait',
          waitMs: 800,
          reason: '等待页面加载交互元素',
        },
      };
    }

    const target = hints[step % hints.length];
    return {
      action: {
        type: 'click',
        selector: target.selector,
        reason: `执行步骤 ${step + 1}: ${input.plannedSteps[step]}`,
      },
    };
  },
  enhanceInference(input) {
    return {
      answer: input.draftAnswer,
      confidenceDelta: 0,
    };
  },
  generateDiagnosisAndTasks(input) {
    const evidenceRefs = input.pageSummary.evidenceRefs.map((item) => item.refId);
    return {
      diagnosisItems: input.heuristicDiagnosis,
      prioritizedTaskIds: input.taskCatalog.map((task) => task.id),
      taskProposals: input.taskCatalog.map((task) => ({
        id: task.id,
        name: task.name,
        description: task.description,
        difficulty: '中等',
        estimatedDuration: '8-12分钟',
        testScenario: `围绕「${task.name}」进行流程验证。`,
        operationSteps: ['定位入口', '执行核心操作', '确认系统反馈'],
        successCriteria: ['目标操作可完成', '反馈明确且可理解'],
        tags: ['mock'],
        evidenceRefs:
          evidenceRefs.length > 0 ? [evidenceRefs[(task.id - 1) % evidenceRefs.length]] : undefined,
        evidenceReason: 'mock 适配器：使用页面证据引用生成任务。',
      })),
    };
  },
  runCrawlStage(input) {
    const titleMatch = input.sourceBundle.mainDocument.content.match(/<title[^>]*>(.*?)<\/title>/i);
    return {
      output: {
        finalUrl: input.sourceBundle.finalUrl,
        statusCode: 200,
        loadTimeMs: Math.max(1, input.sourceBundle.stats.durationMs),
        title: titleMatch?.[1]?.trim() || '未检测到标题',
        language: 'unknown',
        summary: `mock 抓取：共 ${input.sourceBundle.stats.artifactCount} 个文本资源，约 ${input.sourceBundle.stats.totalBytes} bytes。`,
      },
      attempts: 1,
      repaired: false,
      rawSnippet: 'mock-crawl',
    };
  },
  runStructureStage(input) {
    const refs = input.sourceBundle.artifacts
      .slice(0, 6)
      .map((artifact, index) => ({
        refId: `text:artifact-${index + 1}`,
        source: 'text' as const,
        label: artifact.url,
        excerpt: artifact.content.slice(0, 120) || artifact.url,
      }));
    const allowedEvidenceRefIds = refs.map((ref) => ref.refId);
    return {
      output: {
        summary: `mock 结构解析：生成 ${refs.length} 条源码证据。`,
        pageSummary: {
          finalUrl: input.crawl.finalUrl,
          title: input.crawl.title,
          language: input.crawl.language,
          statusCode: input.crawl.statusCode,
          loadTimeMs: input.crawl.loadTimeMs,
          hasViewportMeta: /viewport/i.test(input.sourceBundle.mainDocument.content),
          hasMainLandmark: /<main[\s>]/i.test(input.sourceBundle.mainDocument.content),
          interactiveCount: 0,
          formsCount: 0,
          imagesCount: 0,
          imagesWithoutAlt: 0,
          headingsCount: 0,
          headingsText: [],
          primaryLinks: [],
          primaryButtons: [],
          primaryInputs: [],
          bodyPreview: input.sourceBundle.mainDocument.content.slice(0, 400),
          codeCapabilities: ['mock 能力'],
          evidenceRefs: refs.length > 0
            ? refs
            : [
                {
                  refId: 'text:artifact-1',
                  source: 'text' as const,
                  label: 'mock 证据',
                  excerpt: input.sourceBundle.mainDocument.content.slice(0, 120) || 'mock evidence',
                },
              ],
          allowedEvidenceRefIds:
            allowedEvidenceRefIds.length > 0 ? allowedEvidenceRefIds : ['text:artifact-1'],
        },
      },
      attempts: 1,
      repaired: false,
      rawSnippet: 'mock-structure',
    };
  },
  runRiskStage(input) {
    return {
      output: {
        summary: 'mock 风险检查：输出启发式风险。',
        diagnosisItems: input.structure.pageSummary.evidenceRefs.length > 0
          ? [
              {
                dimension: '页面可访问性',
                status: 'success' as const,
                description: 'mock 风险评估：页面可访问。',
              },
              {
                dimension: '信息结构',
                status: 'warning' as const,
                description: 'mock 风险评估：建议补充更多可见交互入口。',
              },
            ]
          : [
              {
                dimension: '页面可访问性',
                status: 'error' as const,
                description: 'mock 风险评估：证据不足。',
              },
            ],
      },
      attempts: 1,
      repaired: false,
      rawSnippet: 'mock-risk',
    };
  },
  runTaskStage(input) {
    const proposals = input.taskCatalog.slice(0, 15).map((task, index) => ({
      id: task.id,
      name: task.name,
      description: task.description,
      difficulty: '中等' as const,
      estimatedDuration: '8-12分钟',
      testScenario: `围绕「${task.name}」进行流程验证。`,
      operationSteps: ['定位入口', '执行核心操作', '确认系统反馈'],
      successCriteria: ['目标操作可完成', '反馈明确且可理解'],
      tags: ['mock'],
      evidenceRefs: [
        input.structure.pageSummary.allowedEvidenceRefIds[
          index % input.structure.pageSummary.allowedEvidenceRefIds.length
        ],
      ],
      evidenceReason: 'mock 四阶段任务生成：使用结构证据生成任务。',
    }));

    return {
      output: {
        summary: `mock 任务生成：输出 ${proposals.length} 条任务。`,
        prioritizedTaskIds: proposals.map((proposal) => proposal.id),
        taskProposals: proposals,
      },
      attempts: 1,
      repaired: false,
      rawSnippet: 'mock-task',
    };
  },
  summarizeStage(input) {
    return input.runtimeDetail;
  },
  getResponsibilities() {
    return [
      '仅润色 QA 引擎给出的推断回答草稿，不改动证据引用。',
      '不新增或伪造案例、任务、步骤证据。',
      '输出应保持中文、简洁、可执行建议导向。',
      '在 mock 模式下直接回显阶段日志，不调用外部大模型服务。',
    ];
  },
  healthCheck() {
    return {
      provider: 'mock',
      model: 'mock-llm-adapter',
      configured: true,
      reachable: true,
      message: '当前使用 mock 适配器，不会请求外部大模型 API。',
      checkedAt: new Date().toISOString(),
    };
  },
};
