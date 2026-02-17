import { defaultAgentCategories } from '../data/agent-categories';
import { executionTemplates, fallbackExecutionTemplate } from '../data/execution-templates';
import { defaultTasks } from '../data/tasks';
import { generateCohort } from './cohort-generator';
import { sampleExecutionPairs } from './execution-sampler';
import type {
  AgentCategorySelection,
  AgentEmotion,
  ExecutionCaseRef,
  ExecutionRequest,
  ExecutionStep,
  Task,
  TaskExecution,
  TaskStatus,
  TestRunSnapshot,
} from '../types/domain';

export const MAX_EXECUTION_CASES = 40;

const MAX_CATEGORY_COUNT = 20;
const defaultTaskMap = new Map(defaultTasks.map((task) => [task.id, task]));
const categoryMap = new Map(defaultAgentCategories.map((category) => [category.id, category]));

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
  return Math.floor(randomUnit() * 1_000_000)
    .toString()
    .padStart(6, '0');
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
      count: clamp(Math.floor(selection.count), 0, MAX_CATEGORY_COUNT),
    }))
    .filter((selection) => selection.count > 0 && categoryMap.has(selection.categoryId));
}

function resolveTaskCatalog(
  taskCatalog: ExecutionRequest['taskCatalog'],
): Map<number, Task> {
  const resolved = new Map<number, Task>();

  for (const task of defaultTasks) {
    resolved.set(task.id, { ...task });
  }

  for (const task of taskCatalog ?? []) {
    const name = task.name.trim();
    const description = task.description.trim();
    if (!name || !description || !Number.isInteger(task.id)) {
      continue;
    }

    const fallback = resolved.get(task.id);
    resolved.set(task.id, {
      id: task.id,
      selected: false,
      name,
      description,
      difficulty: task.difficulty ?? fallback?.difficulty,
      estimatedDuration: task.estimatedDuration ?? fallback?.estimatedDuration,
      testScenario: task.testScenario ?? fallback?.testScenario,
      operationSteps: task.operationSteps ? [...task.operationSteps] : fallback?.operationSteps,
      successCriteria: task.successCriteria ? [...task.successCriteria] : fallback?.successCriteria,
      tags: task.tags ? [...task.tags] : fallback?.tags,
    });
  }

  return resolved;
}

function sanitizeTaskIds(taskIds: number[], taskCatalog: Map<number, Task>): number[] {
  return Array.from(new Set(taskIds.filter((taskId) => taskCatalog.has(taskId))));
}

function sanitizeTargetUrl(targetUrl: string | undefined): string | undefined {
  if (!targetUrl) {
    return undefined;
  }
  const normalized = targetUrl.trim();
  return normalized.length > 0 ? normalized : undefined;
}

function buildRunId(): string {
  return `run-${Date.now()}-${randomIdSuffix()}`;
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

function pickEmotion(agentCategoryId: string, patience: number, success: boolean, emotionValue: number): AgentEmotion {
  if (success) {
    return emotionValue >= 45 ? 'satisfied' : 'neutral';
  }

  if (agentCategoryId === 'cat-senior') {
    return 'anxious';
  }

  if (patience < 35 && emotionValue > 75) {
    return 'angry';
  }

  return 'frustrated';
}

function parseEstimatedDurationSeconds(estimatedDuration: string | undefined): number | null {
  if (!estimatedDuration) {
    return null;
  }

  const matched = estimatedDuration.match(/(\d+)(?:\s*[-~]\s*(\d+))?\s*分钟/);
  if (!matched) {
    return null;
  }

  const min = Number.parseInt(matched[1], 10);
  const max = matched[2] ? Number.parseInt(matched[2], 10) : min;
  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    return null;
  }

  return Math.max(60, Math.round(((min + max) / 2) * 60));
}

function buildDynamicTemplate(task: Task, taskId: number) {
  const durationFromTask = parseEstimatedDurationSeconds(task.estimatedDuration);
  const difficulty =
    task.difficulty === '困难'
      ? 66
      : task.difficulty === '简单'
        ? 36
        : 50;

  const successFeedback =
    task.successCriteria?.[0] && task.successCriteria[0].trim().length > 0
      ? `达成成功标准：${task.successCriteria[0].trim()}`
      : `任务「${task.name}」达到预期目标。`;

  const failureFeedback =
    task.successCriteria?.[0] && task.successCriteria[0].trim().length > 0
      ? `未达成成功标准：${task.successCriteria[0].trim()}`
      : `任务「${task.name}」未完成，流程中断。`;

  const bottlenecks =
    task.tags && task.tags.length > 0
      ? task.tags.slice(0, 3).map((tag) => `${tag}相关阻塞`)
      : ['入口可发现性不足', '反馈状态不清晰', '流程闭环确认不足'];

  return {
    taskId,
    baseDuration: durationFromTask ?? fallbackExecutionTemplate.baseDuration,
    difficulty,
    successFeedback,
    failureFeedback,
    bottlenecks,
  };
}

function createExecution(
  taskId: number,
  caseId: string,
  generatedAgent: TestRunSnapshot['generatedAgents'][number],
  taskCatalog: Map<number, Task>,
): TaskExecution {
  const task = taskCatalog.get(taskId);
  if (!task) {
    throw new Error(`Task ${taskId} not found`);
  }

  const defaultTask = defaultTaskMap.get(taskId);
  const isCustomTask =
    !defaultTask ||
    defaultTask.name !== task.name ||
    defaultTask.description !== task.description ||
    Boolean(task.operationSteps?.length) ||
    Boolean(task.successCriteria?.length) ||
    Boolean(task.testScenario);

  const template = isCustomTask
    ? buildDynamicTemplate(task, taskId)
    : executionTemplates[taskId] ?? fallbackExecutionTemplate;

  const capability =
    generatedAgent.traits.techSavvy * 0.45 +
    generatedAgent.traits.attention * 0.35 +
    generatedAgent.traits.patience * 0.2;

  const successChance = clamp((capability - template.difficulty + 55) / 100, 0.12, 0.95);
  const success = randomUnit() < successChance;
  const status: TaskStatus = success ? 'success' : 'failed';
  const bottleneck = pickOne(template.bottlenecks);
  const emotionValue = success ? Math.round(randomRange(20, 55)) : Math.round(randomRange(58, 95));
  const emotion = pickEmotion(generatedAgent.categoryId, generatedAgent.traits.patience, success, emotionValue);
  const emotionPeak = formatEmotionPeak(emotion, emotionValue);
  const baseDurationFactor = 1 + (100 - generatedAgent.traits.techSavvy) / 220;
  const duration = Math.max(
    20,
    Math.round(template.baseDuration * (baseDurationFactor + randomRange(-0.12, 0.25))),
  );

  const standardOperationSteps =
    task.operationSteps && task.operationSteps.length > 0
      ? task.operationSteps.slice(0, 6)
      : ['定位功能入口', '执行关键操作', '验证系统反馈'];

  const failedOnStep =
    success || standardOperationSteps.length === 0
      ? -1
      : Math.min(
          standardOperationSteps.length - 1,
          Math.max(0, Math.floor(randomRange(0, standardOperationSteps.length))),
        );

  const steps: ExecutionStep[] = [
    {
      step: 1,
      role: 'observer',
      content: task.testScenario
        ? `测试场景：${task.testScenario}`
        : `识别任务「${task.name}」关键入口，评估可达路径。`,
    },
    {
      step: 2,
      role: 'decider',
      content: `根据${generatedAgent.categoryName}偏好制定执行策略，优先满足「${generatedAgent.goal}」。`,
    },
  ];

  for (let index = 0; index < standardOperationSteps.length; index += 1) {
    const stepText = standardOperationSteps[index];
    const isBlockedHere = !success && index === failedOnStep;
    const completionSummary = isBlockedHere
      ? `该用户在本步骤受阻：${bottleneck}。`
      : `该用户已完成此步骤，继续推进。`;
    steps.push({
      step: steps.length + 1,
      role: 'executor',
      content: `标准操作步骤 ${index + 1}：${stepText}。用户执行结果：${completionSummary}`,
    });
    if (isBlockedHere) {
      break;
    }
  }

  steps.push({
    step: steps.length + 1,
    role: 'feedback',
    content: success
      ? `${template.successFeedback} 但发现风险点：${bottleneck}。`
      : `${template.failureFeedback} 主要阻塞：${bottleneck}。`,
    emotion,
    emotionValue,
  });

  steps.push({
    step: steps.length + 1,
    role: 'decider',
    content: success
      ? '任务闭环完成，记录改进建议进入报告。'
      : '触发失败收敛策略，保留错误上下文供定位。',
  });

  if (!success) {
    steps.push({
      step: steps.length + 1,
      role: 'executor',
      content: '执行一次受控重试，确认问题可复现后结束任务。',
    });
  }

  return {
    caseId,
    taskId,
    taskName: task.name,
    agentId: generatedAgent.id,
    agentName: generatedAgent.name,
    agentCategoryId: generatedAgent.categoryId,
    agentCategoryName: generatedAgent.categoryName,
    agentAvatar: generatedAgent.avatar,
    agentGoal: generatedAgent.goal,
    status,
    steps,
    duration,
    result: success ? template.successFeedback : template.failureFeedback,
    bottleneck,
    emotionPeak,
  };
}

export function resolveCaseId(execution: TaskExecution, index: number): string {
  return execution.caseId ?? `case-${String(index + 1).padStart(3, '0')}`;
}

export function resolveCategoryId(execution: TaskExecution): string {
  return execution.agentCategoryId ?? 'category-unknown';
}

export function resolveCategoryName(execution: TaskExecution): string {
  if (execution.agentCategoryName) {
    return execution.agentCategoryName;
  }
  if (execution.agentName.includes('-')) {
    return execution.agentName.split('-')[0] ?? '未知类别';
  }
  return '未知类别';
}

export function toCaseRefs(executions: TaskExecution[]): ExecutionCaseRef[] {
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

export function buildRunSnapshot(input: ExecutionRequest): TestRunSnapshot {
  const runId = buildRunId();
  const createdAt = new Date().toISOString();
  const targetUrl = sanitizeTargetUrl(input.targetUrl);
  const taskCatalog = resolveTaskCatalog(input.taskCatalog);
  const selectedTaskIds = sanitizeTaskIds(input.selectedTaskIds, taskCatalog);
  const categorySelections = sanitizeCategorySelections(input.categorySelections);

  if (selectedTaskIds.length === 0 || categorySelections.length === 0) {
    return {
      runId,
      createdAt,
      targetUrl,
      selectedTaskIds,
      taskCatalog: selectedTaskIds
        .map((taskId) => taskCatalog.get(taskId))
        .filter((task): task is Task => task !== undefined)
        .map((task) => ({ ...task })),
      categorySelections,
      generatedAgents: [],
      executions: [],
      caseRefs: [],
    };
  }

  const maxCases = clamp(
    Number.isFinite(input.maxCases) ? Math.floor(input.maxCases) : MAX_EXECUTION_CASES,
    1,
    MAX_EXECUTION_CASES,
  );

  const generatedAgents = generateCohort(categorySelections, defaultAgentCategories);
  const sampledPairs = sampleExecutionPairs(selectedTaskIds, generatedAgents, maxCases);
  const agentMap = new Map(generatedAgents.map((agent) => [agent.id, agent]));

  const executions = sampledPairs
    .map((pair, index) => {
      const agent = agentMap.get(pair.generatedAgentId);
      if (!agent) {
        return null;
      }
      const caseId = `${runId}-case-${String(index + 1).padStart(3, '0')}`;
      return createExecution(pair.taskId, caseId, agent, taskCatalog);
    })
    .filter((item): item is TaskExecution => item !== null);

  return {
    runId,
    createdAt,
    targetUrl,
    selectedTaskIds,
    taskCatalog: selectedTaskIds
      .map((taskId) => taskCatalog.get(taskId))
      .filter((task): task is Task => task !== undefined)
      .map((task) => ({ ...task })),
    categorySelections,
    generatedAgents,
    executions,
    caseRefs: toCaseRefs(executions),
  };
}
