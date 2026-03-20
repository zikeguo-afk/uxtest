import { defaultAgentCategories } from '@/data/mock/agentCategories';
import { executionTemplates, fallbackExecutionTemplate } from '@/data/mock/executionTemplates';
import { mockDiagnosis } from '@/data/mock/results';
import { defaultTasks } from '@/data/mock/tasks';
import { generateCohort } from '@/services/cohortGenerator';
import { sampleExecutionPairs } from '@/services/executionSampler';
import type { DiagnosisRequestOptions, UXAgentProvider } from '@/services/uxAgentProvider';
import type {
  AnalysisProgressStatus,
  AgentCategorySelection,
  AgentEmotion,
  CategoryReportItem,
  ExecutionJobProgress,
  ExecutionCaseRef,
  ExecutionRequest,
  ExecutionStep,
  GeneratedAgentPersona,
  QAEvidence,
  QARequest,
  QAResponse,
  QualitativeInsight,
  QuantitativeMetric,
  RepresentativeSample,
  TaskExecution,
  TaskStatus,
  TestRunSnapshot,
} from '@/types';

interface LastExecutionContext {
  plannedCountByCategory: Map<string, number>;
  generatedAgents: GeneratedAgentPersona[];
  latestSnapshot: TestRunSnapshot | null;
}

const DEFAULT_MAX_CASES = 40;
const taskMap = new Map(defaultTasks.map((task) => [task.id, task]));
const categoryMap = new Map(defaultAgentCategories.map((category) => [category.id, category]));

let lastExecutionContext: LastExecutionContext = {
  plannedCountByCategory: new Map<string, number>(),
  generatedAgents: [],
  latestSnapshot: null,
};
const mockExecutionJobs = new Map<
  string,
  {
    runId: string;
    progress: ExecutionJobProgress;
    snapshot: TestRunSnapshot | null;
    error: string | null;
  }
>();

function clone<T>(value: T): T {
  if (typeof globalThis.structuredClone === 'function') {
    return globalThis.structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value)) as T;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function randomUnit(): number {
  const cryptoRef = globalThis.crypto;
  if (cryptoRef && typeof cryptoRef.getRandomValues === 'function') {
    const arr = new Uint32Array(1);
    cryptoRef.getRandomValues(arr);
    return arr[0] / 0x100000000;
  }
  return Math.random();
}

function randomRange(min: number, max: number): number {
  return min + randomUnit() * (max - min);
}

function randomIdSuffix(): string {
  return Math.floor(randomUnit() * 1_000_000).toString().padStart(6, '0');
}

function buildRunId(): string {
  return `run-${Date.now()}-${randomIdSuffix()}`;
}

function pickOne<T>(items: T[]): T {
  return items[Math.floor(randomUnit() * items.length)];
}

function sanitizeCategorySelections(
  selections: AgentCategorySelection[],
): AgentCategorySelection[] {
  return selections
    .map((selection) => ({
      categoryId: selection.categoryId,
      count: clamp(Math.floor(selection.count), 0, 20),
    }))
    .filter((selection) => selection.count > 0 && categoryMap.has(selection.categoryId));
}

function emotionSeverity(emotionPeak: string): number {
  if (emotionPeak.includes('极高')) return 4;
  if (emotionPeak.includes('高')) return 3;
  if (emotionPeak.includes('中')) return 2;
  if (emotionPeak.includes('低')) return 1;
  return 0;
}

function formatEmotionPeak(emotion: AgentEmotion, emotionValue: number): string {
  const level = emotionValue >= 80 ? '极高' : emotionValue >= 60 ? '高' : emotionValue >= 40 ? '中' : '低';
  const label =
    emotion === 'angry'
      ? '愤怒'
      : emotion === 'frustrated'
        ? '沮丧'
        : emotion === 'anxious'
          ? '焦虑'
          : emotion === 'satisfied'
            ? '满意'
            : '平静';
  return level === '低' ? '低' : `${level} (${label})`;
}

function pickEmotion(agent: GeneratedAgentPersona, success: boolean, emotionValue: number): AgentEmotion {
  if (success) {
    return emotionValue >= 45 ? 'satisfied' : 'neutral';
  }
  if (agent.categoryId === 'cat-senior') {
    return 'anxious';
  }
  if (agent.traits.patience < 35 && emotionValue > 75) {
    return 'angry';
  }
  return 'frustrated';
}

function resolveCategoryId(execution: TaskExecution): string {
  return execution.agentCategoryId ?? 'category-unknown';
}

function resolveCategoryName(execution: TaskExecution): string {
  if (execution.agentCategoryName) {
    return execution.agentCategoryName;
  }
  if (execution.agentName.includes('-')) {
    return execution.agentName.split('-')[0];
  }
  return '未知类别';
}

function resolveCaseId(execution: TaskExecution, index: number): string {
  return execution.caseId ?? `case-${String(index + 1).padStart(3, '0')}`;
}

function createExecution(
  task: { id: number; name: string },
  agent: GeneratedAgentPersona,
  caseId: string,
): TaskExecution {
  const template = executionTemplates[task.id] ?? fallbackExecutionTemplate;
  const capability =
    agent.traits.techSavvy * 0.45 +
    agent.traits.attention * 0.35 +
    agent.traits.patience * 0.2;
  const successChance = clamp((capability - template.difficulty + 55) / 100, 0.12, 0.95);
  const success = randomUnit() < successChance;
  const status: TaskStatus = success ? 'success' : 'failed';
  const bottleneck = pickOne(template.bottlenecks);
  const emotionValue = success
    ? Math.round(randomRange(20, 55))
    : Math.round(randomRange(58, 95));
  const emotion = pickEmotion(agent, success, emotionValue);
  const emotionPeak = formatEmotionPeak(emotion, emotionValue);
  const baseDurationFactor = 1 + (100 - agent.traits.techSavvy) / 220;
  const duration = Math.max(
    20,
    Math.round(template.baseDuration * (baseDurationFactor + randomRange(-0.12, 0.25))),
  );

  const steps: ExecutionStep[] = [
    {
      step: 1,
      role: 'observer',
      content: `识别任务「${task.name}」关键入口，评估可达路径。`,
    },
    {
      step: 2,
      role: 'decider',
      content: `根据${agent.categoryName}偏好制定执行策略，优先满足「${agent.goal}」。`,
    },
    {
      step: 3,
      role: 'executor',
      content: '执行关键操作并提交，持续监控反馈状态。',
    },
    {
      step: 4,
      role: 'feedback',
      content: success
        ? `${template.successFeedback} 但发现风险点：${bottleneck}。`
        : `${template.failureFeedback} 主要阻塞：${bottleneck}。`,
      emotion,
      emotionValue,
    },
    {
      step: 5,
      role: 'decider',
      content: success
        ? '任务闭环完成，记录改进建议进入报告。'
        : '触发失败收敛策略，保留错误上下文供定位。',
    },
  ];

  if (!success) {
    steps.push({
      step: 6,
      role: 'executor',
      content: '执行一次受控重试，确认问题可复现后结束任务。',
    });
  }

  return {
    caseId,
    taskId: task.id,
    taskName: task.name,
    agentId: agent.id,
    agentName: agent.name,
    agentCategoryId: agent.categoryId,
    agentCategoryName: agent.categoryName,
    agentAvatar: agent.avatar,
    agentGoal: agent.goal,
    status,
    steps,
    duration,
    result: success ? template.successFeedback : template.failureFeedback,
    bottleneck,
    emotionPeak,
  };
}

function mode(values: string[]): string {
  if (values.length === 0) {
    return '-';
  }
  const countMap = new Map<string, number>();
  for (const value of values) {
    countMap.set(value, (countMap.get(value) ?? 0) + 1);
  }
  const sorted = [...countMap.entries()].sort((a, b) => b[1] - a[1]);
  return sorted[0][0];
}

function toCaseRefs(executions: TaskExecution[]): ExecutionCaseRef[] {
  return executions.map((execution, index) => ({
    caseId: resolveCaseId(execution, index),
    taskId: execution.taskId,
    taskName: execution.taskName,
    agentId: execution.agentId,
    agentName: execution.agentName,
    categoryId: resolveCategoryId(execution),
    categoryName: resolveCategoryName(execution),
    status: execution.status,
    emotionPeak: execution.emotionPeak ?? '低',
    bottleneck: execution.bottleneck ?? '交互反馈不足',
  }));
}

function buildQuantitativeMetrics(executions: TaskExecution[]): QuantitativeMetric[] {
  const byTask = new Map<number, TaskExecution[]>();
  for (const execution of executions) {
    const list = byTask.get(execution.taskId) ?? [];
    list.push(execution);
    byTask.set(execution.taskId, list);
  }

  return [...byTask.entries()]
    .map(([taskId, list]) => {
      const successCount = list.filter((execution) => execution.status === 'success').length;
      const successRate = Math.round((successCount / list.length) * 100);
      const bottleneck = mode(list.map((execution) => execution.bottleneck ?? '交互反馈不足'));
      const emotionPeak =
        list
          .map((execution) => execution.emotionPeak ?? '低')
          .sort((a, b) => emotionSeverity(b) - emotionSeverity(a))[0] ?? '低';
      return {
        taskId,
        taskName: taskMap.get(taskId)?.name ?? `任务#${taskId}`,
        successRate,
        bottleneck,
        emotionPeak,
      };
    })
    .sort((a, b) => a.taskId - b.taskId);
}

function buildCategorySummary(executions: TaskExecution[]): CategoryReportItem[] {
  const executionByCategory = new Map<string, TaskExecution[]>();
  for (const execution of executions) {
    const categoryId = resolveCategoryId(execution);
    const list = executionByCategory.get(categoryId) ?? [];
    list.push(execution);
    executionByCategory.set(categoryId, list);
  }

  const generatedCountByCategory = new Map<string, number>();
  for (const agent of lastExecutionContext.generatedAgents) {
    generatedCountByCategory.set(
      agent.categoryId,
      (generatedCountByCategory.get(agent.categoryId) ?? 0) + 1,
    );
  }

  const categoriesInReport = new Set<string>([
    ...lastExecutionContext.plannedCountByCategory.keys(),
    ...executionByCategory.keys(),
  ]);

  return [...categoriesInReport].map((categoryId) => {
    const samples = executionByCategory.get(categoryId) ?? [];
    const successCount = samples.filter((item) => item.status === 'success').length;
    const successRate = samples.length > 0 ? Math.round((successCount / samples.length) * 100) : 0;
    const categoryName =
      (samples[0] ? resolveCategoryName(samples[0]) : undefined) ??
      categoryMap.get(categoryId)?.name ??
      categoryId;

    return {
      categoryId,
      categoryName,
      plannedCount: lastExecutionContext.plannedCountByCategory.get(categoryId) ?? 0,
      generatedCount: generatedCountByCategory.get(categoryId) ?? 0,
      sampledCases: samples.length,
      successRate,
      primaryBottleneck: mode(samples.map((item) => item.bottleneck ?? '交互反馈不足')),
      emotionPeak:
        samples
          .map((item) => item.emotionPeak ?? '低')
          .sort((a, b) => emotionSeverity(b) - emotionSeverity(a))[0] ?? '低',
    };
  });
}

function buildRepresentativeSamples(executions: TaskExecution[]): RepresentativeSample[] {
  const byCategory = new Map<string, TaskExecution[]>();
  for (const execution of executions) {
    const categoryId = resolveCategoryId(execution);
    const list = byCategory.get(categoryId) ?? [];
    list.push(execution);
    byCategory.set(categoryId, list);
  }

  const result: RepresentativeSample[] = [];

  for (const [categoryId, list] of byCategory) {
    const failures = list.filter((item) => item.status === 'failed');
    const successes = list
      .filter((item) => item.status === 'success')
      .sort((a, b) => a.duration - b.duration);

    const selected: TaskExecution[] = [];
    if (failures.length > 0) {
      selected.push(failures[0]);
    }
    if (successes.length > 0) {
      selected.push(successes[Math.floor(successes.length / 2)]);
    }

    for (const item of selected.slice(0, 2)) {
      result.push({
        caseId: item.caseId,
        categoryId,
        categoryName: resolveCategoryName(item),
        agentId: item.agentId,
        agentName: item.agentName,
        taskId: item.taskId,
        taskName: item.taskName,
        status: item.status,
        summary: `${item.result} 关键阻塞：${item.bottleneck ?? '交互反馈不足'}`,
        emotionPeak: item.emotionPeak ?? '低',
      });
    }
  }

  return result;
}

function buildQualitativeInsights(metrics: QuantitativeMetric[]): QualitativeInsight[] {
  const focus = [...metrics].sort((a, b) => a.successRate - b.successRate).slice(0, 3);
  if (focus.length === 0) {
    return [];
  }

  return focus.map((metric) => ({
    firstOrder: `任务「${metric.taskName}」成功率为 ${metric.successRate}% ，高频反馈集中在“${metric.bottleneck}”。`,
    secondOrder: `流程主题：${metric.bottleneck} 导致完成率下滑，情绪峰值达到 ${metric.emotionPeak}。`,
    aggregate: `聚合结论：优先治理「${metric.taskName}」路径上的 ${metric.bottleneck}。`,
  }));
}

function buildRecommendations(metrics: QuantitativeMetric[], categorySummary: CategoryReportItem[]): string[] {
  const worstTask = [...metrics].sort((a, b) => a.successRate - b.successRate)[0];
  const worstCategory = [...categorySummary].sort((a, b) => a.successRate - b.successRate)[0];

  const recommendations: string[] = [];
  if (worstTask) {
    recommendations.push(`高优先级: 优先修复任务「${worstTask.taskName}」中的「${worstTask.bottleneck}」问题。`);
  }
  if (worstCategory) {
    recommendations.push(`中优先级: 为「${worstCategory.categoryName}」补充更清晰的操作反馈，降低 ${worstCategory.emotionPeak} 情绪峰值。`);
  }
  if (metrics.length > 0) {
    recommendations.push('体验优化: 在关键步骤增加即时状态提示与可逆操作入口，降低重复点击成本。');
  }

  return recommendations.length > 0 ? recommendations : ['暂无可执行建议。'];
}

function buildSnapshot(request: ExecutionRequest): TestRunSnapshot {
  const runId = buildRunId();
  const targetUrl = request.targetUrl?.trim() || undefined;
  const requestTaskCatalog = (request.taskCatalog ?? []).map((task) => ({
    ...task,
    selected: false,
  }));
  const availableTaskMap =
    requestTaskCatalog.length > 0
      ? new Map(requestTaskCatalog.map((task) => [task.id, task]))
      : taskMap;
  const selectedTaskIds = Array.from(
    new Set(request.selectedTaskIds.filter((taskId) => availableTaskMap.has(taskId))),
  );
  const categorySelections = sanitizeCategorySelections(request.categorySelections);
  const createdAt = new Date().toISOString();

  if (selectedTaskIds.length === 0 || categorySelections.length === 0) {
    const emptySnapshot: TestRunSnapshot = {
      runId,
      createdAt,
      targetUrl,
      selectedTaskIds,
      taskCatalog: selectedTaskIds
        .map((taskId) => availableTaskMap.get(taskId))
        .filter((task): task is typeof requestTaskCatalog[number] => Boolean(task))
        .map((task) => ({ ...task })),
      categorySelections,
      generatedAgents: [],
      executions: [],
      caseRefs: [],
    };

    lastExecutionContext = {
      plannedCountByCategory: new Map<string, number>(),
      generatedAgents: [],
      latestSnapshot: emptySnapshot,
    };

    return emptySnapshot;
  }

  const maxCases = clamp(
    Number.isFinite(request.maxCases) ? Math.floor(request.maxCases) : DEFAULT_MAX_CASES,
    1,
    DEFAULT_MAX_CASES,
  );

  const generatedAgents = generateCohort(categorySelections, defaultAgentCategories);
  const sampledPairs = sampleExecutionPairs(selectedTaskIds, generatedAgents, maxCases);
  const agentMap = new Map(generatedAgents.map((agent) => [agent.id, agent]));

  const executions = sampledPairs
    .map((pair, index) => {
      const agent = agentMap.get(pair.generatedAgentId);
      const task = availableTaskMap.get(pair.taskId);
      if (!agent) {
        return null;
      }
      if (!task) {
        return null;
      }
      return createExecution(task, agent, `${runId}-case-${String(index + 1).padStart(3, '0')}`);
    })
    .filter((item): item is TaskExecution => item !== null);

  const snapshot: TestRunSnapshot = {
    runId,
    createdAt,
    targetUrl,
    selectedTaskIds,
    taskCatalog: selectedTaskIds
      .map((taskId) => availableTaskMap.get(taskId))
      .filter((task): task is typeof requestTaskCatalog[number] => Boolean(task))
      .map((task) => ({ ...task })),
    categorySelections,
    generatedAgents,
    executions,
    caseRefs: toCaseRefs(executions),
  };

  lastExecutionContext = {
    plannedCountByCategory: new Map(
      categorySelections.map((selection) => [selection.categoryId, selection.count]),
    ),
    generatedAgents,
    latestSnapshot: snapshot,
  };

  return snapshot;
}

function normalizeQuestion(question: string): string {
  return question.trim().toLowerCase();
}

function extractTokens(question: string): string[] {
  const chunks = question.match(/[\u4e00-\u9fa5a-z0-9]{2,}/gi) ?? [];
  return Array.from(new Set(chunks.map((item) => item.toLowerCase())));
}

function includesAny(text: string, tokens: string[]): boolean {
  const normalized = text.toLowerCase();
  return tokens.some((token) => normalized.includes(token));
}

function shouldInfer(question: string): boolean {
  return ['为什么', '为何', '建议', '优化', '可能', '影响', '怎么改', '如何'].some((keyword) =>
    question.includes(keyword),
  );
}

function buildNoEvidenceResponse(snapshot: TestRunSnapshot): QAResponse {
  return {
    answer: '未找到直接证据。可以尝试缩小问题范围（任务/类别/状态）或选择具体案例继续追问。',
    mode: 'evidence',
    confidence: 0.2,
    evidence: [],
    relatedCases: snapshot.caseRefs.slice(0, 3),
  };
}

function filterExecutionsByRequest(request: QARequest, snapshot: TestRunSnapshot): TaskExecution[] {
  if (request.scope === 'case') {
    if (!request.caseId) {
      return [];
    }
    return snapshot.executions.filter((execution, index) => resolveCaseId(execution, index) === request.caseId);
  }

  const { filters } = request;
  return snapshot.executions.filter((execution) => {
    if (filters?.taskId !== undefined && execution.taskId !== filters.taskId) {
      return false;
    }
    if (filters?.categoryId !== undefined && resolveCategoryId(execution) !== filters.categoryId) {
      return false;
    }
    if (filters?.status !== undefined && execution.status !== filters.status) {
      return false;
    }
    if (filters?.emotion !== undefined && !execution.steps.some((step) => step.emotion === filters.emotion)) {
      return false;
    }
    return true;
  });
}

function scoreExecution(execution: TaskExecution, question: string, tokens: string[]): number {
  let score = 0;
  const statusKeyword = question.includes('失败')
    ? 'failed'
    : question.includes('成功')
      ? 'success'
      : null;

  if (statusKeyword === execution.status) {
    score += 4;
  }
  if (question.includes('情绪') && (execution.emotionPeak ?? '低') !== '低') {
    score += 3;
  }
  if (question.includes('瓶颈') && execution.bottleneck) {
    score += 3;
  }
  if (question.includes('步骤') || question.includes('过程')) {
    score += 2;
  }

  const searchableFields = [
    execution.taskName,
    execution.agentName,
    execution.agentCategoryName ?? '',
    execution.result,
    execution.bottleneck ?? '',
    execution.emotionPeak ?? '',
    ...execution.steps.map((step) => step.content),
  ];

  for (const field of searchableFields) {
    if (includesAny(field, tokens)) {
      score += 1;
    }
  }

  return score;
}

function pickEvidenceForExecution(
  execution: TaskExecution,
  index: number,
  tokens: string[],
): QAEvidence {
  const matchedStep =
    execution.steps.find((step) => includesAny(step.content, tokens)) ??
    execution.steps.find((step) => step.emotion !== undefined) ??
    execution.steps[execution.steps.length - 1];

  return {
    caseId: resolveCaseId(execution, index),
    taskId: execution.taskId,
    taskName: execution.taskName,
    step: matchedStep?.step ?? 1,
    excerpt: matchedStep?.content ?? execution.result,
  };
}

function summarizeCase(execution: TaskExecution, caseId: string): string {
  const statusLabel = execution.status === 'success' ? '成功' : '失败';
  return `案例 ${caseId} 在任务「${execution.taskName}」中${statusLabel}。主要瓶颈：${execution.bottleneck ?? '交互反馈不足'}；情绪峰值：${execution.emotionPeak ?? '低'}。`;
}

function summarizeGlobal(executions: TaskExecution[]): {
  summary: string;
  successRate: number;
  topBottleneck: string;
} {
  const successCount = executions.filter((execution) => execution.status === 'success').length;
  const successRate = executions.length > 0 ? Math.round((successCount / executions.length) * 100) : 0;
  const topBottleneck = mode(executions.map((execution) => execution.bottleneck ?? '交互反馈不足'));
  const topEmotion =
    executions
      .map((execution) => execution.emotionPeak ?? '低')
      .sort((a, b) => emotionSeverity(b) - emotionSeverity(a))[0] ?? '低';

  return {
    summary: `当前筛选命中 ${executions.length} 条样本，成功率约 ${successRate}%；主要瓶颈集中在「${topBottleneck}」，情绪峰值以「${topEmotion}」为主。`,
    successRate,
    topBottleneck,
  };
}

function buildMockDiagnosisProgress(): AnalysisProgressStatus {
  return {
    jobId: `mock-diagnosis-${Date.now()}`,
    status: 'completed',
    percent: 100,
    currentStageId: 'tasks',
    message: '分析完成（mock）',
    updatedAt: new Date().toISOString(),
    stages: [
      {
        id: 'crawl',
        label: '页面抓取',
        detail: 'mock 模式：未执行真实页面抓取。',
        status: 'done',
        detailSource: 'runtime-log',
      },
      {
        id: 'structure',
        label: '结构解析',
        detail: 'mock 模式：未执行真实结构解析。',
        status: 'done',
        detailSource: 'runtime-log',
      },
      {
        id: 'risk',
        label: '风险检查',
        detail: 'mock 模式：未执行真实风险检查。',
        status: 'done',
        detailSource: 'runtime-log',
      },
      {
        id: 'tasks',
        label: '任务生成',
        detail: 'mock 模式：任务为本地预设，仅用于测试。',
        status: 'done',
        detailSource: 'runtime-log',
      },
    ],
  };
}

export const mockProvider: UXAgentProvider = {
  getDiagnosis(_targetUrl, options?: DiagnosisRequestOptions) {
    options?.onProgress?.(buildMockDiagnosisProgress());
    return {
      items: clone(mockDiagnosis),
      tasks: clone(defaultTasks),
      taskGeneration: {
        status: 'success',
        code: 'MOCK_TASKS',
        message: 'mock 模式任务生成成功。',
        blocked: false,
        candidateCount: defaultTasks.length,
        acceptedCount: defaultTasks.length,
        rejectedCount: 0,
      },
      source: 'mock',
    } as const;
  },
  createRunSnapshot(request: ExecutionRequest) {
    const snapshot = buildSnapshot(request);
    lastExecutionContext = {
      ...lastExecutionContext,
      latestSnapshot: snapshot,
    };
    return clone(snapshot);
  },
  getExecutions(request: ExecutionRequest) {
    const snapshot = buildSnapshot(request);
    lastExecutionContext = {
      ...lastExecutionContext,
      latestSnapshot: snapshot,
    };
    return clone(snapshot.executions);
  },
  startExecutionJob(runId: string) {
    const snapshot = lastExecutionContext.latestSnapshot;
    const jobId = `mock-job-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
    const executions = snapshot?.runId === runId ? snapshot.executions : [];
    const progress: ExecutionJobProgress = {
      jobId,
      runId,
      status: 'completed',
      totalCases: executions.length,
      finishedCases: executions.length,
      currentCaseId: null,
      cases: (snapshot?.caseRefs ?? []).map((item) => ({
        caseId: item.caseId,
        taskId: item.taskId,
        taskName: item.taskName,
        agentId: item.agentId,
        agentName: item.agentName,
        status: item.status,
        stepCount:
          snapshot?.executions.find((execution) => execution.caseId === item.caseId)?.steps.length ?? 0,
        lastStepPreview:
          snapshot?.executions
            .find((execution) => execution.caseId === item.caseId)
            ?.steps.slice(-1)[0]?.content ?? '',
      })),
      message: 'mock 执行已完成',
      updatedAt: new Date().toISOString(),
    };

    mockExecutionJobs.set(jobId, {
      runId,
      progress,
      snapshot: snapshot?.runId === runId ? snapshot : null,
      error: null,
    });
    return { jobId };
  },
  getExecutionJobStatus(runId: string, jobId: string) {
    const job = mockExecutionJobs.get(jobId);
    if (!job || job.runId !== runId) {
      return {
        status: 'failed' as const,
        progress: {
          jobId,
          runId,
          status: 'failed',
          totalCases: 0,
          finishedCases: 0,
          currentCaseId: null,
          cases: [],
          message: 'mock job 不存在',
          updatedAt: new Date().toISOString(),
        },
        snapshot: null,
        error: 'mock job 不存在',
      };
    }

    return {
      status: job.progress.status,
      progress: clone(job.progress),
      snapshot: clone(job.snapshot),
      error: job.error,
    };
  },
  askQuestion(request: QARequest, snapshot: TestRunSnapshot) {
    if (request.runId !== snapshot.runId) {
      return buildNoEvidenceResponse(snapshot);
    }

    const normalizedQuestion = normalizeQuestion(request.question);
    const tokens = extractTokens(normalizedQuestion);
    const candidates = filterExecutionsByRequest(request, snapshot);

    if (candidates.length === 0) {
      return buildNoEvidenceResponse(snapshot);
    }

    const ranked = [...candidates]
      .map((execution, index) => ({
        execution,
        index: snapshot.executions.findIndex(
          (item, i) => resolveCaseId(item, i) === resolveCaseId(execution, index),
        ),
        score: scoreExecution(execution, normalizedQuestion, tokens),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);

    const evidence = ranked.map(({ execution, index }) =>
      pickEvidenceForExecution(execution, index >= 0 ? index : 0, tokens),
    );

    const relatedCases = ranked
      .map(({ execution, index }) => {
        const caseId = resolveCaseId(execution, index >= 0 ? index : 0);
        return snapshot.caseRefs.find((item) => item.caseId === caseId);
      })
      .filter((item): item is ExecutionCaseRef => item !== undefined);

    const infer = shouldInfer(request.question);

    if (request.scope === 'case') {
      const focus = ranked[0];
      const caseId = resolveCaseId(focus.execution, focus.index >= 0 ? focus.index : 0);
      const evidenceSummary = summarizeCase(focus.execution, caseId);
      const answer = infer
        ? `${evidenceSummary} 推断：该问题更可能由「${focus.execution.bottleneck ?? '交互反馈不足'}」触发，可优先补强该环节反馈。`
        : evidenceSummary;

      return {
        answer,
        mode: infer ? 'inference' : 'evidence',
        confidence: infer ? 0.72 : 0.86,
        evidence: evidence.slice(0, 2),
        relatedCases,
      };
    }

    const globalSummary = summarizeGlobal(ranked.map((item) => item.execution));
    const answer = infer
      ? `${globalSummary.summary} 推断：优先修复「${globalSummary.topBottleneck}」可最快改善该筛选范围下的完成率。`
      : globalSummary.summary;

    return {
      answer,
      mode: infer ? 'inference' : 'evidence',
      confidence: infer ? 0.68 : 0.82,
      evidence,
      relatedCases,
    };
  },
  getReport(executions: TaskExecution[]) {
    const quantitativeMetrics = buildQuantitativeMetrics(executions);
    const categorySummary = buildCategorySummary(executions);
    const representativeSamples = buildRepresentativeSamples(executions);
    const qualitativeInsights = buildQualitativeInsights(quantitativeMetrics);
    const recommendations = buildRecommendations(quantitativeMetrics, categorySummary);

    return {
      quantitativeMetrics: clone(quantitativeMetrics),
      qualitativeInsights: clone(qualitativeInsights),
      categorySummary: clone(categorySummary),
      representativeSamples: clone(representativeSamples),
      recommendations: clone(recommendations),
    };
  },
};
