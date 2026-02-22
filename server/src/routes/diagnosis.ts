import { z } from 'zod';
import type { FastifyPluginAsync } from 'fastify';
import { mockDiagnosis } from '../data/diagnosis';
import { defaultTasks } from '../data/tasks';
import { buildLiveDiagnosis, inspectLiveUrl, type LiveUrlAnalysis } from '../domain/live-url-evaluator';
import { collectSourceBundle } from '../domain/source-collector';
import { validateDiagnosisTasks } from '../domain/task-evidence-validator';
import { packageCollectedCode } from '../llm/code-packager';
import type { LLMAdapter } from '../llm/adapter';
import { ApiError } from '../types/api-error';
import type {
  CollectedSourceBundle,
  DiagnosisItem,
  EvidenceRefItem,
  LLMRiskStageOutput,
  LLMStructureStageOutput,
  Task,
  TaskGenerationStatus,
} from '../types/domain';
import { parseOrThrow } from './_utils';

interface DiagnosisRouteOptions {
  evaluationMode: 'mock' | 'real' | 'auto';
  evaluatorTimeoutMs: number;
  evaluatorAllowInsecureTls: boolean;
  diagnosisPipelineMode: 'legacy' | 'llm-4stage';
  sourceCollectSameOriginOnly: boolean;
  sourceCollectMaxTotalBytes: number;
  llmChunkTokenBudget: number;
  strictTasks: boolean;
  taskBlacklist: string[];
  llmAdapter: LLMAdapter;
}

type DiagnosisSource = 'mock' | 'llm' | 'llm-4stage' | 'diagnosis-only';
type DiagnosisJobStatus = 'queued' | 'running' | 'completed' | 'failed';
type DiagnosisStageStatus = 'pending' | 'running' | 'done' | 'error';
type DiagnosisStageDetailSource = 'runtime-log' | 'llm-summary';

interface DiagnosisStage {
  id: 'crawl' | 'structure' | 'risk' | 'tasks';
  label: string;
  detail: string;
  status: DiagnosisStageStatus;
  detailSource?: DiagnosisStageDetailSource;
  detailRaw?: string;
}

interface DiagnosisProgress {
  percent: number;
  currentStageId: DiagnosisStage['id'] | null;
  stages: DiagnosisStage[];
  message: string;
  updatedAt: string;
}

interface DiagnosisResultPayload {
  items: DiagnosisItem[];
  tasks: Task[];
  taskGeneration: TaskGenerationStatus;
  source: DiagnosisSource;
}

interface DiagnosisJobRecord {
  jobId: string;
  targetUrl: string;
  createdAt: string;
  updatedAt: string;
  status: DiagnosisJobStatus;
  progress: DiagnosisProgress;
  result: DiagnosisResultPayload | null;
  error: string | null;
}

const diagnosisSchema = z.object({
  targetUrl: z.string().min(1),
});

const diagnosisJobParamsSchema = z.object({
  jobId: z.string().min(1),
});

const MAX_DIAGNOSIS_JOBS = 200;
const REQUIRED_TASK_SUGGESTION_COUNT = 15;
const USER_OPERATION_DIMENSIONS = [
  '入口定位',
  '首次上手',
  '主流程完成',
  '关键参数调整',
  '结果确认',
  '异常恢复',
  '中断后继续',
  '状态反馈理解',
  '页面导航切换',
  '筛选与查找',
  '帮助与说明使用',
  '批量处理',
  '导出与分享',
  '设置与个性化',
  '退出与收尾',
] as const;

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return '未知错误';
}

function cloneDefaultTasks(): Task[] {
  return defaultTasks.map((task) => ({ ...task, selected: false }));
}

const defaultTaskMap = new Map(defaultTasks.map((task) => [task.id, task]));

function cloneDiagnosisItems(items: DiagnosisItem[]): DiagnosisItem[] {
  return items.map((item) => ({ ...item }));
}

function cloneDiagnosisStages(stages: DiagnosisStage[]): DiagnosisStage[] {
  return stages.map((stage) => ({ ...stage }));
}

function flattenEvidenceRefs(analysis: LiveUrlAnalysis): EvidenceRefItem[] {
  return [
    ...analysis.evidenceIndex.dom,
    ...analysis.evidenceIndex.interactions,
    ...analysis.evidenceIndex.routesAndScripts,
    ...analysis.evidenceIndex.text,
  ];
}

function createTaskGenerationSuccess(
  candidateCount: number,
  acceptedCount: number,
  quality?: TaskGenerationStatus['quality'],
): TaskGenerationStatus {
  return {
    status: quality ? 'degraded' : 'success',
    code: 'TASK_GENERATION_OK',
    message: quality
      ? `任务已生成（自动补全模式），可继续流程（${acceptedCount}/${candidateCount}）。`
      : `任务生成成功，已通过质量门禁（${acceptedCount}/${candidateCount}）。`,
    blocked: false,
    candidateCount,
    acceptedCount,
    rejectedCount: Math.max(0, candidateCount - acceptedCount),
    quality,
  };
}

function createTaskGenerationDegraded(
  code: string,
  message: string,
  candidateCount: number,
  acceptedCount: number,
  quality: TaskGenerationStatus['quality'],
): TaskGenerationStatus {
  return {
    status: 'degraded',
    code,
    message,
    blocked: false,
    candidateCount,
    acceptedCount,
    rejectedCount: Math.max(0, candidateCount - acceptedCount),
    quality,
  };
}

function createTaskGenerationFailure(
  code: string,
  message: string,
  candidateCount = 0,
  acceptedCount = 0,
  rejectedCount = 0,
): TaskGenerationStatus {
  return {
    status: 'failed',
    code,
    message,
    blocked: true,
    candidateCount,
    acceptedCount,
    rejectedCount,
  };
}

function sortTasksByIds(
  prioritizedIds: number[],
  taskProposals: Array<Omit<Task, 'selected'>> = [],
  contextTitle = '',
): Task[] {
  const taskMap = new Map(defaultTasks.map((task) => [task.id, task]));
  const proposalMap = new Map(taskProposals.map((task) => [task.id, task]));
  const ordered: Task[] = [];
  const used = new Set<number>();

  for (const taskId of prioritizedIds) {
    if (used.has(taskId)) {
      continue;
    }
    const task = taskMap.get(taskId);
    if (!task) {
      continue;
    }
    const proposal = proposalMap.get(taskId);
    const contextualDescription = `基于页面「${contextTitle || '目标站点'}」检查：${task.description}`;
    ordered.push({
      ...task,
      selected: false,
      name: proposal?.name.trim() || `验证${task.name}路径`,
      description: proposal?.description.trim() || contextualDescription,
      difficulty: proposal?.difficulty,
      estimatedDuration: proposal?.estimatedDuration,
      testScenario: proposal?.testScenario,
      operationSteps: proposal?.operationSteps ? [...proposal.operationSteps] : undefined,
      successCriteria: proposal?.successCriteria ? [...proposal.successCriteria] : undefined,
      tags: proposal?.tags ? [...proposal.tags] : undefined,
      evidenceRefs: proposal?.evidenceRefs ? [...proposal.evidenceRefs] : undefined,
      evidenceReason: proposal?.evidenceReason,
    });
    used.add(taskId);
  }

  for (const task of defaultTasks) {
    if (used.has(task.id)) {
      continue;
    }
    const proposal = proposalMap.get(task.id);
    const contextualDescription = `基于页面「${contextTitle || '目标站点'}」检查：${task.description}`;
    ordered.push({
      ...task,
      selected: false,
      name: proposal?.name.trim() || `验证${task.name}路径`,
      description: proposal?.description.trim() || contextualDescription,
      difficulty: proposal?.difficulty,
      estimatedDuration: proposal?.estimatedDuration,
      testScenario: proposal?.testScenario,
      operationSteps: proposal?.operationSteps ? [...proposal.operationSteps] : undefined,
      successCriteria: proposal?.successCriteria ? [...proposal.successCriteria] : undefined,
      tags: proposal?.tags ? [...proposal.tags] : undefined,
      evidenceRefs: proposal?.evidenceRefs ? [...proposal.evidenceRefs] : undefined,
      evidenceReason: proposal?.evidenceReason,
    });
  }

  return ordered;
}

function sortStrictTasksByIds(
  prioritizedIds: number[],
  taskProposals: Array<Omit<Task, 'selected'>> = [],
): Task[] {
  const proposalMap = new Map(taskProposals.map((task) => [task.id, task]));
  const ordered: Task[] = [];
  const used = new Set<number>();

  for (const taskId of prioritizedIds) {
    const proposal = proposalMap.get(taskId);
    if (!proposal || used.has(taskId)) {
      continue;
    }
    ordered.push({
      ...proposal,
      selected: false,
      operationSteps: proposal.operationSteps ? [...proposal.operationSteps] : undefined,
      successCriteria: proposal.successCriteria ? [...proposal.successCriteria] : undefined,
      tags: proposal.tags ? [...proposal.tags] : undefined,
      evidenceRefs: proposal.evidenceRefs ? [...proposal.evidenceRefs] : undefined,
    });
    used.add(taskId);
  }

  for (const proposal of taskProposals) {
    if (used.has(proposal.id)) {
      continue;
    }
    ordered.push({
      ...proposal,
      selected: false,
      operationSteps: proposal.operationSteps ? [...proposal.operationSteps] : undefined,
      successCriteria: proposal.successCriteria ? [...proposal.successCriteria] : undefined,
      tags: proposal.tags ? [...proposal.tags] : undefined,
      evidenceRefs: proposal.evidenceRefs ? [...proposal.evidenceRefs] : undefined,
    });
  }

  return ordered;
}

function uniqueValues(values: string[], limit: number): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of values) {
    const value = raw.replace(/\s+/g, ' ').trim();
    if (!value || seen.has(value)) {
      continue;
    }
    seen.add(value);
    result.push(value);
    if (result.length >= limit) {
      break;
    }
  }
  return result;
}

function buildCapabilityCandidates(analysis: LiveUrlAnalysis): string[] {
  const hint = analysis.featureHints;
  const candidates = uniqueValues(
    [
      ...hint.codeCapabilities,
      ...hint.primaryButtons.map((item) => `按钮交互:${item}`),
      ...hint.primaryLinks.map((item) => `导航链接:${item}`),
      ...hint.primaryInputs.map((item) => `输入控件:${item}`),
      ...hint.headingsText.map((item) => `内容模块:${item}`),
    ],
    24,
  );

  if (candidates.length > 0) {
    return candidates;
  }

  return [
    '页面主流程入口可发现性',
    '关键交互反馈一致性',
    '任务闭环完成可确认性',
    '异常路径错误提示清晰度',
    '导航层级与信息架构可理解性',
    '输入表单与控件可操作性',
  ];
}

function buildCapabilityFallbackTask(
  task: Task,
  analysis: LiveUrlAnalysis,
  capabilityLabel: string,
  focusLabel: string,
): Task {
  const focusStepsMap: Record<string, string[]> = {
    入口发现性: [
      `定位与「${capabilityLabel}」相关的入口或控件`,
      '确认入口文案、位置、可点击状态是否明确',
      '从入口进入后判断是否进入预期页面或流程',
      '返回上一步并验证入口是否易于再次发现',
    ],
    主流程完成性: [
      `执行「${capabilityLabel}」对应的主线操作`,
      '完成关键输入并提交',
      '检查系统返回结果是否满足预期目标',
      '确认流程闭环（可继续后续任务）',
    ],
    异常恢复性: [
      `在「${capabilityLabel}」流程中制造异常输入或中断`,
      '观察报错信息是否清晰说明问题',
      '按提示进行修复或重试',
      '确认恢复后流程可继续推进',
    ],
    反馈可理解性: [
      `触发「${capabilityLabel}」关键操作`,
      '记录系统反馈（toast、状态、跳转）',
      '判断反馈内容是否清晰、及时、可执行',
      '核对反馈与实际结果是否一致',
    ],
    效率与负担: [
      `以最短路径完成「${capabilityLabel}」任务`,
      '统计关键点击/输入次数',
      '记录等待时长与认知负担点',
      '评估是否存在可优化的冗余步骤',
    ],
    一致性与可学习性: [
      `在「${capabilityLabel}」中尝试首次操作`,
      '切换到相近功能并比较交互规则',
      '判断命名、布局、操作手势是否一致',
      '验证新用户是否可在少量尝试后掌握流程',
    ],
  };

  const focusCriteriaMap: Record<string, string[]> = {
    入口发现性: [
      `可在短时间内找到「${capabilityLabel}」入口`,
      '入口文案和位置符合用户预期',
      '进入后到达正确功能上下文',
    ],
    主流程完成性: [
      `能够独立完成「${capabilityLabel}」主流程`,
      '流程中无阻断性错误',
      '结果可被用户确认并用于下一步',
    ],
    异常恢复性: [
      '异常提示可理解且指出可执行修复动作',
      '修复后可恢复到可继续状态',
      '不会造成数据丢失或流程重置混乱',
    ],
    反馈可理解性: [
      '关键反馈出现及时且语义明确',
      '反馈信息与系统真实状态一致',
      '用户可据反馈立即做出下一步决策',
    ],
    效率与负担: [
      '完成路径简洁，无明显冗余操作',
      '等待时间与操作复杂度可接受',
      '用户无需高强度记忆即可完成任务',
    ],
    一致性与可学习性: [
      '相似功能遵循统一交互模式',
      '首次使用者可快速形成操作心智模型',
      '术语与布局不会造成理解歧义',
    ],
  };

  const operationSteps =
    focusStepsMap[focusLabel] ??
    [
      `定位与「${capabilityLabel}」相关的入口或控件`,
      '执行关键操作并观察界面反馈',
      '在成功与失败路径下分别验证系统提示',
      '确认是否可返回并继续后续流程',
    ];

  const successCriteria =
    focusCriteriaMap[focusLabel] ??
    [
      `能够独立完成「${capabilityLabel}」相关操作`,
      '操作后有明确且可理解的系统反馈',
      '异常路径有可恢复的提示与下一步指引',
    ];

  return {
    ...task,
    selected: false,
    name: `验证能力：${capabilityLabel}（${focusLabel}）`,
    description: `基于页面「${analysis.title}」验证 ${capabilityLabel} 在「${focusLabel}」维度是否可达、可操作、可闭环。`,
    difficulty: '中等',
    estimatedDuration: '6-10分钟',
    testScenario: `你正在使用「${analysis.title}」，需要完成与「${capabilityLabel}」相关的核心交互，并重点验证「${focusLabel}」。`,
    operationSteps,
    successCriteria,
    tags: ['能力验证', `维度:${focusLabel}`, 'API实时生成'],
  };
}

function buildCapabilityDrivenTasks(analysis: LiveUrlAnalysis, baseTasks: Task[]): Task[] {
  const capabilityCandidates = buildCapabilityCandidates(analysis);
  const focusModes = [
    '入口发现性',
    '主流程完成性',
    '异常恢复性',
    '反馈可理解性',
    '效率与负担',
    '一致性与可学习性',
  ];
  return baseTasks.map((task, index) => {
    const capability = capabilityCandidates[index % capabilityCandidates.length] ?? `能力项-${index + 1}`;
    const focus = focusModes[Math.floor(index / Math.max(capabilityCandidates.length, 1)) % focusModes.length] ?? '主流程完成性';
    return buildCapabilityFallbackTask(task, analysis, capability, focus);
  });
}

function isTemplateLikeTask(task: Task): boolean {
  const defaultTask = defaultTaskMap.get(task.id);
  const hasScenario = Boolean(task.testScenario && task.testScenario.trim());
  const hasSteps = Boolean(task.operationSteps && task.operationSteps.length > 0);
  const hasCriteria = Boolean(task.successCriteria && task.successCriteria.length > 0);

  if (defaultTask && defaultTask.name === task.name && defaultTask.description === task.description) {
    return true;
  }

  const genericName = /^验证.+路径$/.test(task.name);
  const genericDescription = task.description.startsWith('基于页面「');
  if (genericName && genericDescription && !hasScenario && !hasSteps && !hasCriteria) {
    return true;
  }

  return !hasScenario && !hasSteps && !hasCriteria;
}

function enforceCapabilityDrivenTasks(tasks: Task[], analysis: LiveUrlAnalysis): Task[] {
  const templateMatchCount = tasks.filter((task) => isTemplateLikeTask(task)).length;

  if (tasks.length === 0 || templateMatchCount < Math.ceil(tasks.length * 0.4)) {
    return tasks;
  }

  return buildCapabilityDrivenTasks(analysis, tasks);
}

function appendFallbackWarning(items: DiagnosisItem[], message: string): DiagnosisItem[] {
  return [
    ...items,
    {
      dimension: 'LLM 诊断状态',
      status: 'warning',
      description: message,
    },
  ];
}

function createInitialStages(): DiagnosisStage[] {
  return [
    {
      id: 'crawl',
      label: '页面抓取',
      detail: '等待开始抓取日志',
      status: 'pending',
      detailSource: 'runtime-log',
    },
    {
      id: 'structure',
      label: '结构解析',
      detail: '等待结构解析日志',
      status: 'pending',
      detailSource: 'runtime-log',
    },
    {
      id: 'risk',
      label: '风险检查',
      detail: '等待风险检查日志',
      status: 'pending',
      detailSource: 'runtime-log',
    },
    {
      id: 'tasks',
      label: '任务生成',
      detail: '等待任务生成日志',
      status: 'pending',
      detailSource: 'runtime-log',
    },
  ];
}

function createInitialProgress(): DiagnosisProgress {
  return {
    percent: 0,
    currentStageId: null,
    stages: createInitialStages(),
    message: '等待执行',
    updatedAt: new Date().toISOString(),
  };
}

function cloneProgress(progress: DiagnosisProgress): DiagnosisProgress {
  return {
    percent: progress.percent,
    currentStageId: progress.currentStageId,
    stages: cloneDiagnosisStages(progress.stages),
    message: progress.message,
    updatedAt: progress.updatedAt,
  };
}

function updateStageStatus(
  progress: DiagnosisProgress,
  stageId: DiagnosisStage['id'],
  status: DiagnosisStageStatus,
): void {
  progress.stages = progress.stages.map((stage) =>
    stage.id === stageId ? { ...stage, status } : stage,
  );
}

function updateStageDetail(
  progress: DiagnosisProgress,
  stageId: DiagnosisStage['id'],
  detail: string,
  detailSource: DiagnosisStageDetailSource,
  detailRaw?: string,
): void {
  progress.stages = progress.stages.map((stage) =>
    stage.id === stageId
      ? {
          ...stage,
          detail,
          detailSource,
          detailRaw,
        }
      : stage,
  );
}

function markStageRunning(
  progress: DiagnosisProgress,
  stageId: DiagnosisStage['id'],
  percent: number,
  message: string,
  detail?: string,
  detailSource: DiagnosisStageDetailSource = 'runtime-log',
  detailRaw?: string,
): void {
  updateStageStatus(progress, stageId, 'running');
  if (detail) {
    updateStageDetail(progress, stageId, detail, detailSource, detailRaw);
  }
  progress.currentStageId = stageId;
  progress.percent = Math.max(progress.percent, Math.min(99, percent));
  progress.message = message;
  progress.updatedAt = new Date().toISOString();
}

function markStageDone(
  progress: DiagnosisProgress,
  stageId: DiagnosisStage['id'],
  percent: number,
  message: string,
  detail?: string,
  detailSource: DiagnosisStageDetailSource = 'runtime-log',
  detailRaw?: string,
): void {
  updateStageStatus(progress, stageId, 'done');
  if (detail) {
    updateStageDetail(progress, stageId, detail, detailSource, detailRaw);
  }
  progress.currentStageId = stageId;
  progress.percent = Math.max(progress.percent, Math.min(100, percent));
  progress.message = message;
  progress.updatedAt = new Date().toISOString();
}

function markStageError(
  progress: DiagnosisProgress,
  stageId: DiagnosisStage['id'],
  message: string,
  detail?: string,
  detailSource: DiagnosisStageDetailSource = 'runtime-log',
  detailRaw?: string,
): void {
  updateStageStatus(progress, stageId, 'error');
  if (detail) {
    updateStageDetail(progress, stageId, detail, detailSource, detailRaw);
  }
  progress.currentStageId = stageId;
  progress.percent = Math.min(100, Math.max(progress.percent, 90));
  progress.message = message;
  progress.updatedAt = new Date().toISOString();
}

function markProgressCompleted(progress: DiagnosisProgress, message: string): void {
  progress.stages = progress.stages.map((stage) => {
    if (stage.status === 'pending' || stage.status === 'running') {
      return { ...stage, status: 'done' };
    }
    return stage;
  });
  progress.currentStageId = 'tasks';
  progress.percent = 100;
  progress.message = message;
  progress.updatedAt = new Date().toISOString();
}

function buildTaskCatalog() {
  return defaultTasks.map((task) => ({
    id: task.id,
    name: task.name,
    description: task.description,
  }));
}

function buildUserOperationTaskCatalog(capabilityCandidates: string[]) {
  const fallbackCapabilities = capabilityCandidates.length > 0 ? capabilityCandidates : ['核心流程操作'];

  const normalizeCapability = (input: string): string => {
    const normalized = input
      .replace(/^(按钮交互|导航链接|输入控件|内容模块)[:：]/u, '')
      .replace(/client[-\s]?side rendering/giu, '页面加载')
      .replace(/state management/giu, '状态设置')
      .replace(/graph visualization/giu, '图形视图')
      .replace(/image generation simulation/giu, '图片生成')
      .replace(/react|zustand|api|dom|json|schema|script|route|hook/giu, '')
      .replace(/接口|脚本|代码|路由|组件|函数/gu, '')
      .replace(/\s+/g, ' ')
      .trim();
    return normalized || '核心流程';
  };

  const buildTaskName = (dimension: string, capability: string): string => {
    const normalizedCapability = normalizeCapability(capability);
    const nameByDimension: Record<string, string> = {
      入口定位: `找到${normalizedCapability}入口`,
      首次上手: `完成首次${normalizedCapability}`,
      主流程完成: `完成${normalizedCapability}关键任务`,
      关键参数调整: `调整${normalizedCapability}并确认效果`,
      结果确认: `查看${normalizedCapability}结果`,
      异常恢复: `恢复${normalizedCapability}异常状态`,
      中断后继续: `恢复中断并继续${normalizedCapability}`,
      状态反馈理解: `确认${normalizedCapability}反馈提示`,
      页面导航切换: `切换${normalizedCapability}页面导航`,
      筛选与查找: `查找${normalizedCapability}内容`,
      帮助与说明使用: `查看${normalizedCapability}帮助说明`,
      批量处理: `批量处理${normalizedCapability}内容`,
      导出与分享: `导出${normalizedCapability}结果`,
      设置与个性化: `调整${normalizedCapability}显示设置`,
      退出与收尾: `完成${normalizedCapability}收尾操作`,
    };
    return nameByDimension[dimension] ?? `完成${normalizedCapability}操作`;
  };

  return Array.from({ length: REQUIRED_TASK_SUGGESTION_COUNT }, (_, index) => {
    const capability = fallbackCapabilities[index % fallbackCapabilities.length] ?? `核心能力-${index + 1}`;
    const dimension = USER_OPERATION_DIMENSIONS[index % USER_OPERATION_DIMENSIONS.length];
    const normalizedCapability = normalizeCapability(capability);
    return {
      id: index + 1,
      name: buildTaskName(dimension, normalizedCapability),
      description: `围绕「${normalizedCapability}」完成真实使用场景操作，确认入口可达、操作可完成、结果可看懂。`,
    };
  });
}

function buildDynamicTaskCatalog(analysis: LiveUrlAnalysis) {
  const capabilityCandidates = buildCapabilityCandidates(analysis);
  return buildUserOperationTaskCatalog(capabilityCandidates);
}

function ensureFifteenTasks(
  tasks: Task[],
): {
  tasks: Task[];
  droppedCount: number;
  missingCount: number;
} {
  const used = new Set<number>();
  const ordered: Task[] = [];

  for (const task of tasks) {
    if (ordered.length >= REQUIRED_TASK_SUGGESTION_COUNT || used.has(task.id)) {
      continue;
    }
    used.add(task.id);
    ordered.push({
      ...task,
      selected: false,
      operationSteps: task.operationSteps ? [...task.operationSteps] : undefined,
      successCriteria: task.successCriteria ? [...task.successCriteria] : undefined,
      tags: task.tags ? [...task.tags] : undefined,
      evidenceRefs: task.evidenceRefs ? [...task.evidenceRefs] : undefined,
    });
  }

  const droppedCount = Math.max(0, tasks.length - ordered.length);
  const missingCount = Math.max(0, REQUIRED_TASK_SUGGESTION_COUNT - ordered.length);

  return {
    tasks: ordered.slice(0, REQUIRED_TASK_SUGGESTION_COUNT),
    droppedCount,
    missingCount,
  };
}

function summarizeTaskNameQuality(tasks: Task[]) {
  const jargonPattern =
    /(react|zustand|client-side rendering|state management|graph visualization|api|dom|json|route|hook|script|simulation|application|接口|脚本|代码|路由)/iu;

  let nameReadableCount = 0;
  let nameJargonRejectedCount = 0;
  let nameRewrittenCount = 0;

  for (const task of tasks) {
    const name = task.name.trim();
    const hasJargon = jargonPattern.test(name);
    const readable =
      /[\u4e00-\u9fff]/u.test(name) &&
      !hasJargon &&
      !/用户完成/u.test(name) &&
      !/执行.+流程/u.test(name);
    if (hasJargon) {
      nameJargonRejectedCount += 1;
    }
    if (readable) {
      nameReadableCount += 1;
    } else {
      nameRewrittenCount += 1;
    }
  }

  return {
    nameReadableCount,
    nameRewrittenCount,
    nameJargonRejectedCount,
  };
}

function toLLMPageSummary(analysis: LiveUrlAnalysis) {
  const evidenceRefs = flattenEvidenceRefs(analysis);
  return {
    finalUrl: analysis.finalUrl,
    title: analysis.title,
    language: analysis.htmlLang,
    statusCode: analysis.statusCode,
    loadTimeMs: analysis.loadTimeMs,
    hasViewportMeta: analysis.hasViewportMeta,
    hasMainLandmark: analysis.hasMainLandmark,
    interactiveCount: analysis.counts.interactive,
    formsCount: analysis.counts.forms,
    imagesCount: analysis.counts.images,
    imagesWithoutAlt: analysis.counts.imagesWithoutAlt,
    headingsCount: analysis.counts.headings,
    headingsText: analysis.featureHints.headingsText,
    primaryLinks: analysis.featureHints.primaryLinks,
    primaryButtons: analysis.featureHints.primaryButtons,
    primaryInputs: analysis.featureHints.primaryInputs,
    bodyPreview: analysis.featureHints.bodyPreview,
    codeCapabilities: analysis.featureHints.codeCapabilities,
    evidenceRefs,
    allowedEvidenceRefIds: evidenceRefs.map((ref) => ref.refId),
  };
}

function splitEvidenceBySource(evidenceRefs: EvidenceRefItem[]): LiveUrlAnalysis['evidenceIndex'] {
  return {
    dom: evidenceRefs.filter((ref) => ref.source === 'dom'),
    interactions: evidenceRefs.filter((ref) => ref.source === 'interaction'),
    routesAndScripts: evidenceRefs.filter((ref) => ref.source === 'route-script'),
    text: evidenceRefs.filter((ref) => ref.source === 'text'),
  };
}

function buildAnalysisFromStructure(
  sourceBundle: CollectedSourceBundle,
  structure: LLMStructureStageOutput,
): LiveUrlAnalysis {
  const summary = structure.pageSummary;
  const evidenceIndex = splitEvidenceBySource(summary.evidenceRefs);

  return {
    normalizedUrl: sourceBundle.targetUrl,
    finalUrl: summary.finalUrl || sourceBundle.finalUrl,
    statusCode: summary.statusCode,
    loadTimeMs: summary.loadTimeMs,
    title: summary.title,
    htmlLang: summary.language,
    hasViewportMeta: summary.hasViewportMeta,
    hasMainLandmark: summary.hasMainLandmark,
    counts: {
      links: summary.primaryLinks.length,
      buttons: summary.primaryButtons.length,
      inputs: summary.primaryInputs.length,
      forms: summary.formsCount,
      headings: summary.headingsCount,
      images: summary.imagesCount,
      imagesWithoutAlt: summary.imagesWithoutAlt,
      interactive: summary.interactiveCount,
    },
    featureHints: {
      headingsText: [...summary.headingsText],
      primaryLinks: [...summary.primaryLinks],
      primaryButtons: [...summary.primaryButtons],
      primaryInputs: [...summary.primaryInputs],
      bodyPreview: summary.bodyPreview,
      codeCapabilities: [...summary.codeCapabilities],
    },
    evidenceIndex,
  };
}

function buildTaskCatalogFromStructure(
  structure: LLMStructureStageOutput,
  strictTasks: boolean,
): Array<{ id: number; name: string; description: string }> {
  if (!strictTasks) {
    return buildUserOperationTaskCatalog(uniqueValues(structure.pageSummary.codeCapabilities, REQUIRED_TASK_SUGGESTION_COUNT));
  }

  const capabilities = uniqueValues(
    [
      ...structure.pageSummary.codeCapabilities,
      ...structure.pageSummary.primaryButtons,
      ...structure.pageSummary.primaryLinks,
      ...structure.pageSummary.primaryInputs,
    ],
    REQUIRED_TASK_SUGGESTION_COUNT,
  );
  return buildUserOperationTaskCatalog(capabilities);
}

function mergeRiskWithFallback(
  riskOutput: LLMRiskStageOutput,
  fallback: DiagnosisItem[],
): DiagnosisItem[] {
  if (!Array.isArray(riskOutput.diagnosisItems) || riskOutput.diagnosisItems.length === 0) {
    return fallback;
  }
  return cloneDiagnosisItems(riskOutput.diagnosisItems);
}

async function summarizeStageDetail(
  llmAdapter: LLMAdapter,
  stageId: DiagnosisStage['id'],
  stageLabel: string,
  runtimeDetail: string,
  detailRaw: string,
): Promise<{ detail: string; source: DiagnosisStageDetailSource }> {
  if (!llmAdapter.summarizeStage) {
    return {
      detail: runtimeDetail,
      source: 'runtime-log',
    };
  }

  try {
    const summary = await llmAdapter.summarizeStage({
      stageId,
      stageLabel,
      runtimeDetail,
      detailRaw,
    });
    const normalized = String(summary ?? '').trim();
    if (!normalized) {
      return {
        detail: runtimeDetail,
        source: 'runtime-log',
      };
    }
    return {
      detail: normalized,
      source: 'llm-summary',
    };
  } catch {
    return {
      detail: runtimeDetail,
      source: 'runtime-log',
    };
  }
}

async function runDiagnosisPipelineLlm4Stage(
  targetUrl: string,
  options: DiagnosisRouteOptions,
  progress: DiagnosisProgress,
): Promise<DiagnosisResultPayload> {
  let sourceBundle: CollectedSourceBundle;
  try {
    sourceBundle = await collectSourceBundle(targetUrl, {
      timeoutMs: options.evaluatorTimeoutMs,
      allowInsecureTls: options.evaluatorAllowInsecureTls,
      sameOriginOnly: options.sourceCollectSameOriginOnly,
      maxTotalBytes: options.sourceCollectMaxTotalBytes,
    });
  } catch (error) {
    const message = getErrorMessage(error);
    markStageError(
      progress,
      'crawl',
      `源码抓取失败：${message}`,
      `源码抓取失败：${message}`,
      'runtime-log',
      JSON.stringify({ targetUrl, error: message }),
    );
    markStageDone(progress, 'structure', 55, '结构解析已跳过', '抓取失败，结构解析未执行。');
    markStageDone(progress, 'risk', 75, '风险检查已跳过', '抓取失败，风险检查未执行。');
    markStageError(progress, 'tasks', '任务生成失败', '抓取失败导致任务生成被阻断。');
    markProgressCompleted(progress, '分析完成（仅返回诊断，任务未生成）');
    return {
      items: [
        {
          dimension: '实时诊断状态',
          status: 'warning',
          description: `源码抓取失败（${message}），任务生成已阻断。`,
        },
      ],
      tasks: [],
      taskGeneration: createTaskGenerationFailure('CRAWL_FAILED', `抓取失败：${message}`),
      source: 'diagnosis-only',
    };
  }

  const packagedCode = packageCollectedCode(sourceBundle, options.llmChunkTokenBudget);

  try {
    const crawlStage = await options.llmAdapter.runCrawlStage({
      targetUrl,
      sourceBundle,
      packagedCode,
    });
    const crawlRaw = JSON.stringify({
      attempts: crawlStage.attempts,
      repaired: crawlStage.repaired,
      artifactCount: sourceBundle.stats.artifactCount,
      chunkCount: packagedCode.chunkCount,
      totalBytes: sourceBundle.stats.totalBytes,
      output: crawlStage.output,
      rawSnippet: crawlStage.rawSnippet,
    });
    const crawlRuntimeDetail = `源码抓取并LLM说明完成：资源 ${sourceBundle.stats.artifactCount} 个，代码分片 ${packagedCode.chunkCount} 个，耗时 ${sourceBundle.stats.durationMs}ms，LLM尝试 ${crawlStage.attempts} 次。`;
    const crawlSummary = await summarizeStageDetail(
      options.llmAdapter,
      'crawl',
      '页面抓取',
      crawlRuntimeDetail,
      crawlRaw,
    );
    markStageDone(
      progress,
      'crawl',
      32,
      '页面抓取完成',
      crawlSummary.detail,
      crawlSummary.source,
      crawlRaw,
    );

    markStageRunning(
      progress,
      'structure',
      45,
      '正在解析页面结构',
      `源码分片 ${packagedCode.chunkCount} 个，等待LLM结构解析。`,
      'runtime-log',
      JSON.stringify({ chunkCount: packagedCode.chunkCount }),
    );
    const structureStage = await options.llmAdapter.runStructureStage({
      targetUrl,
      sourceBundle,
      packagedCode,
      crawl: crawlStage.output,
    });
    const structureRaw = JSON.stringify({
      attempts: structureStage.attempts,
      repaired: structureStage.repaired,
      chunkCount: packagedCode.chunkCount,
      evidenceCount: structureStage.output.pageSummary.evidenceRefs.length,
      output: structureStage.output,
      rawSnippet: structureStage.rawSnippet,
    });
    const structureRuntimeDetail = `LLM结构解析完成：证据 ${structureStage.output.pageSummary.evidenceRefs.length} 条，chunk ${packagedCode.chunkCount}，LLM尝试 ${structureStage.attempts} 次。`;
    const structureSummary = await summarizeStageDetail(
      options.llmAdapter,
      'structure',
      '结构解析',
      structureRuntimeDetail,
      structureRaw,
    );
    markStageDone(
      progress,
      'structure',
      62,
      '结构解析完成',
      structureSummary.detail,
      structureSummary.source,
      structureRaw,
    );

    markStageRunning(progress, 'risk', 72, '正在汇总可用性风险');
    const riskStage = await options.llmAdapter.runRiskStage({
      targetUrl,
      sourceBundle,
      packagedCode,
      crawl: crawlStage.output,
      structure: structureStage.output,
    });
    const riskRaw = JSON.stringify({
      attempts: riskStage.attempts,
      repaired: riskStage.repaired,
      diagnosisCount: riskStage.output.diagnosisItems.length,
      output: riskStage.output,
      rawSnippet: riskStage.rawSnippet,
    });
    const riskStatusCount = riskStage.output.diagnosisItems.reduce(
      (acc, item) => {
        if (item.status === 'success') {
          acc.success += 1;
        } else if (item.status === 'warning') {
          acc.warning += 1;
        } else {
          acc.error += 1;
        }
        return acc;
      },
      { success: 0, warning: 0, error: 0 },
    );
    const riskRuntimeDetail = `LLM风险检查完成：success ${riskStatusCount.success}，warning ${riskStatusCount.warning}，error ${riskStatusCount.error}，LLM尝试 ${riskStage.attempts} 次。`;
    const riskSummary = await summarizeStageDetail(
      options.llmAdapter,
      'risk',
      '风险检查',
      riskRuntimeDetail,
      riskRaw,
    );
    markStageDone(
      progress,
      'risk',
      82,
      '风险检查完成',
      riskSummary.detail,
      riskSummary.source,
      riskRaw,
    );

    markStageRunning(progress, 'tasks', 90, '正在调用大模型生成任务建议');
    const taskCatalog = buildTaskCatalogFromStructure(structureStage.output, options.strictTasks);
    const taskStage = await options.llmAdapter.runTaskStage({
      targetUrl,
      sourceBundle,
      packagedCode,
      crawl: crawlStage.output,
      structure: structureStage.output,
      risk: riskStage.output,
      taskCatalog,
    });

    const analysis = buildAnalysisFromStructure(sourceBundle, structureStage.output);
    const fallbackRiskDiagnosis = buildLiveDiagnosis(analysis);
    const diagnosisItems = mergeRiskWithFallback(riskStage.output, fallbackRiskDiagnosis);
    const candidateTasks = sortTasksByIds(
      taskStage.output.prioritizedTaskIds,
      taskStage.output.taskProposals,
      structureStage.output.pageSummary.title,
    );
    const strictCandidateTasks = sortStrictTasksByIds(
      taskStage.output.prioritizedTaskIds,
      taskStage.output.taskProposals,
    );

    const gateCandidateTasks = options.strictTasks
      ? strictCandidateTasks
      : enforceCapabilityDrivenTasks(candidateTasks, analysis);
    const validation = validateDiagnosisTasks(gateCandidateTasks, analysis, {
      blacklist: options.taskBlacklist,
      minValidTasks: 1,
      invalidRatioThreshold: 0.92,
      allowBlacklistWithEvidence: true,
    });
    const acceptedBaseTasks =
      validation.acceptedTasks.length > 0 ? validation.acceptedTasks : gateCandidateTasks;
    const ensured = ensureFifteenTasks(acceptedBaseTasks);
    const nameQuality = summarizeTaskNameQuality(ensured.tasks);
    const quality = {
      autoFilledCount: taskStage.quality?.autoFilledCount ?? 0,
      syntheticCount: taskStage.quality?.syntheticCount ?? 0,
      rewrittenNameCount: taskStage.quality?.rewrittenNameCount ?? 0,
      nameRewrittenCount:
        taskStage.quality?.nameRewrittenCount ??
        taskStage.quality?.rewrittenNameCount ??
        nameQuality.nameRewrittenCount,
      nameReadableCount: taskStage.quality?.nameReadableCount ?? nameQuality.nameReadableCount,
      namePolishPasses: taskStage.quality?.namePolishPasses ?? 1,
      nameJargonRejectedCount:
        taskStage.quality?.nameJargonRejectedCount ?? nameQuality.nameJargonRejectedCount,
      weakGateWarnings: validation.weakGateWarnings,
      llmCompletionPasses: taskStage.quality?.llmCompletionPasses ?? 0,
      llmGeneratedCount: taskStage.quality?.llmGeneratedCount ?? ensured.tasks.length,
      nonLlmGeneratedCount: taskStage.quality?.nonLlmGeneratedCount ?? 0,
    };

    const gateRaw = JSON.stringify({
      attempts: taskStage.attempts,
      repaired: taskStage.repaired,
      degraded: Boolean(taskStage.degraded),
      chunkCount: packagedCode.chunkCount,
      candidateCount: validation.candidateCount,
      acceptedCount: validation.acceptedCount,
      returnedCount: ensured.tasks.length,
      rejectedCount: validation.rejectedCount,
      warningCount: validation.weakGateWarnings,
      repairedEvidenceRefCount: validation.repairedEvidenceRefCount,
      unresolvedEvidenceRefs: validation.unresolvedEvidenceRefs,
      autoFilledCount: quality.autoFilledCount,
      syntheticCount: quality.syntheticCount,
      rewrittenNameCount: quality.rewrittenNameCount,
      nameRewrittenCount: quality.nameRewrittenCount,
      nameReadableCount: quality.nameReadableCount,
      namePolishPasses: quality.namePolishPasses,
      nameJargonRejectedCount: quality.nameJargonRejectedCount,
      llmCompletionPasses: quality.llmCompletionPasses,
      llmGeneratedCount: quality.llmGeneratedCount,
      nonLlmGeneratedCount: quality.nonLlmGeneratedCount,
      droppedCount: ensured.droppedCount,
      missingCount: ensured.missingCount,
      blocked: validation.blocked,
      code: validation.code,
      reasons: validation.rejected.slice(0, 6),
      rawSnippet: taskStage.rawSnippet,
    });

    if (validation.blocked && validation.acceptedCount === 0) {
      const blockedRuntimeDetail = `任务门禁阻断：候选 ${validation.candidateCount}，通过 0，拒绝 ${validation.rejectedCount}。${validation.message}`;
      const blockedSummary = await summarizeStageDetail(
        options.llmAdapter,
        'tasks',
        '任务生成',
        blockedRuntimeDetail,
        gateRaw,
      );
      markStageError(
        progress,
        'tasks',
        '任务生成失败（无可用任务）',
        blockedSummary.detail,
        blockedSummary.source,
        gateRaw,
      );
      markProgressCompleted(progress, '分析完成（仅返回诊断，任务无可用结果）');
      return {
        items: appendFallbackWarning(diagnosisItems, `任务门禁阻断：${validation.message}`),
        tasks: [],
        taskGeneration: createTaskGenerationFailure(
          validation.code,
          validation.message,
          validation.candidateCount,
          0,
          validation.rejectedCount,
        ),
        source: 'diagnosis-only',
      };
    }

    if (ensured.missingCount > 0) {
      const blockedRuntimeDetail = `LLM 任务数量不足：候选 ${validation.candidateCount}，通过 ${validation.acceptedCount}，有效任务 ${ensured.tasks.length}/15，缺失 ${ensured.missingCount}。`;
      const blockedSummary = await summarizeStageDetail(
        options.llmAdapter,
        'tasks',
        '任务生成',
        blockedRuntimeDetail,
        gateRaw,
      );
      markStageError(
        progress,
        'tasks',
        '任务生成失败（LLM 输出数量不足）',
        blockedSummary.detail,
        blockedSummary.source,
        gateRaw,
      );
      markProgressCompleted(progress, '分析完成（仅返回诊断，任务数量不足）');
      return {
        items: appendFallbackWarning(diagnosisItems, blockedRuntimeDetail),
        tasks: [],
        taskGeneration: createTaskGenerationFailure(
          'INSUFFICIENT_LLM_TASKS',
          `LLM 输出任务数量不足：${ensured.tasks.length}/15。`,
          validation.candidateCount,
          ensured.tasks.length,
          Math.max(0, validation.candidateCount - ensured.tasks.length),
        ),
        source: 'diagnosis-only',
      };
    }

    const isDegraded =
      Boolean(taskStage.degraded) ||
      quality.syntheticCount > 0 ||
      quality.rewrittenNameCount > 0 ||
      quality.nameJargonRejectedCount > 0 ||
      quality.llmCompletionPasses > 0 ||
      quality.weakGateWarnings > 0 ||
      validation.rejectedCount > 0;
    const taskRuntimeDetail = isDegraded
      ? `任务生成完成（LLM 补全模式）：候选 ${validation.candidateCount}，通过 ${validation.acceptedCount}，最终输出 ${ensured.tasks.length}/15，LLM 补全轮次 ${quality.llmCompletionPasses}，二轮补齐 ${quality.syntheticCount}。`
      : `任务生成完成：候选 ${validation.candidateCount}，通过 ${validation.acceptedCount}，固定输出 ${ensured.tasks.length}/15。`;
    const taskSummary = await summarizeStageDetail(
      options.llmAdapter,
      'tasks',
      '任务生成',
      taskRuntimeDetail,
      gateRaw,
    );
    markStageDone(
      progress,
      'tasks',
      98,
      '大模型任务生成完成',
      taskSummary.detail,
      taskSummary.source,
      gateRaw,
    );
    markProgressCompleted(progress, '分析完成（LLM 已生成诊断与任务）');

    return {
      items: diagnosisItems,
      tasks: ensured.tasks,
      taskGeneration: isDegraded
        ? createTaskGenerationDegraded(
            'TASK_GENERATION_DEGRADED',
            `任务已生成并由 LLM 补全到 ${REQUIRED_TASK_SUGGESTION_COUNT} 条，可继续下一步。`,
            validation.candidateCount,
            ensured.tasks.length,
            quality,
          )
        : createTaskGenerationSuccess(validation.candidateCount, ensured.tasks.length),
      source: 'llm-4stage',
    };
  } catch (error) {
    const message = getErrorMessage(error);
    markStageError(
      progress,
      progress.currentStageId ?? 'tasks',
      `LLM 阶段失败：${message}`,
      `LLM 四阶段执行失败：${message}`,
      'runtime-log',
      JSON.stringify({
        stage: progress.currentStageId ?? 'unknown',
        error: message,
      }),
    );
    markProgressCompleted(progress, '分析完成（仅返回诊断，任务生成失败）');
    return {
      items: [
        {
          dimension: 'LLM 阶段状态',
          status: 'warning',
          description: `LLM 四阶段执行失败（${message}），任务区已阻断，不再展示模板任务。`,
        },
      ],
      tasks: [],
      taskGeneration: createTaskGenerationFailure('LLM_ERROR', `LLM 阶段失败：${message}`),
      source: 'diagnosis-only',
    };
  }
}

async function runDiagnosisPipeline(
  targetUrl: string,
  options: DiagnosisRouteOptions,
  progress: DiagnosisProgress,
): Promise<DiagnosisResultPayload> {
  markStageRunning(
    progress,
    'crawl',
    8,
    '正在抓取目标页面',
    `准备抓取目标页面：${targetUrl}`,
    'runtime-log',
    JSON.stringify({ targetUrl }),
  );

  if (options.evaluationMode === 'mock') {
    markStageDone(progress, 'crawl', 30, '页面抓取完成（mock）', 'mock 模式未执行真实页面抓取。');
    markStageDone(progress, 'structure', 55, '结构解析完成（mock）', 'mock 模式未执行真实结构解析。');
    markStageDone(progress, 'risk', 75, '风险检查完成（mock）', 'mock 模式未执行真实风险计算。');
    markStageDone(progress, 'tasks', 95, '任务生成完成（mock）', 'mock 模式任务仅用于调试。');
    markProgressCompleted(progress, '分析完成（mock 数据）');
    return {
      items: cloneDiagnosisItems(mockDiagnosis),
      tasks: cloneDefaultTasks(),
      taskGeneration: createTaskGenerationSuccess(defaultTasks.length, defaultTasks.length),
      source: 'mock',
    };
  }

  if (options.diagnosisPipelineMode === 'llm-4stage') {
    return runDiagnosisPipelineLlm4Stage(targetUrl, options, progress);
  }

  let analysis: LiveUrlAnalysis;
  try {
    analysis = await inspectLiveUrl(
      targetUrl,
      options.evaluatorTimeoutMs,
      options.evaluatorAllowInsecureTls,
    );
    const crawlRaw = JSON.stringify({
      requestedUrl: targetUrl,
      finalUrl: analysis.finalUrl,
      statusCode: analysis.statusCode,
      loadTimeMs: analysis.loadTimeMs,
      interactiveCount: analysis.counts.interactive,
      formsCount: analysis.counts.forms,
      evidenceRefCount: flattenEvidenceRefs(analysis).length,
    });
    const crawlRuntimeDetail = `抓取 ${analysis.finalUrl} 成功，状态 ${analysis.statusCode}，耗时 ${analysis.loadTimeMs}ms，交互元素 ${analysis.counts.interactive}，证据引用 ${flattenEvidenceRefs(analysis).length} 条。`;
    const crawlSummary = await summarizeStageDetail(
      options.llmAdapter,
      'crawl',
      '页面抓取',
      crawlRuntimeDetail,
      crawlRaw,
    );
    markStageDone(
      progress,
      'crawl',
      32,
      '页面抓取完成',
      crawlSummary.detail,
      crawlSummary.source,
      crawlRaw,
    );
  } catch (error) {
    const errorMessage = getErrorMessage(error);
    const crawlRuntimeDetail = `页面抓取失败：${errorMessage}`;
    markStageError(
      progress,
      'crawl',
      `页面抓取失败：${errorMessage}`,
      crawlRuntimeDetail,
      'runtime-log',
      JSON.stringify({ targetUrl, error: errorMessage }),
    );
    markStageDone(progress, 'structure', 55, '结构解析已跳过', '抓取失败，结构解析未执行。');
    markStageDone(progress, 'risk', 75, '风险检查已跳过', '抓取失败，风险检查未执行。');
    markStageError(
      progress,
      'tasks',
      '任务生成失败',
      '抓取失败导致任务生成被阻断。',
      'runtime-log',
      JSON.stringify({ blockedBy: 'crawl', error: errorMessage }),
    );
    markProgressCompleted(progress, '分析完成（仅返回诊断，任务未生成）');

    return {
      items: [
        {
          dimension: '实时诊断状态',
          status: 'warning',
          description: `实时抓取失败（${errorMessage}），仅返回诊断信息，任务生成已阻断。`,
        },
      ],
      tasks: [],
      taskGeneration: createTaskGenerationFailure(
        'CRAWL_FAILED',
        `抓取失败：${errorMessage}`,
      ),
      source: 'diagnosis-only',
    };
  }

  markStageRunning(
    progress,
    'structure',
    45,
    '正在解析页面结构',
    `开始结构解析：标题 ${analysis.title}，heading ${analysis.counts.headings}，forms ${analysis.counts.forms}。`,
  );
  const heuristicDiagnosis = buildLiveDiagnosis(analysis);
  const structureRaw = JSON.stringify({
    title: analysis.title,
    htmlLang: analysis.htmlLang,
    hasViewportMeta: analysis.hasViewportMeta,
    hasMainLandmark: analysis.hasMainLandmark,
    counts: analysis.counts,
    featureHints: analysis.featureHints,
    evidenceIndexSize: {
      dom: analysis.evidenceIndex.dom.length,
      interactions: analysis.evidenceIndex.interactions.length,
      routesAndScripts: analysis.evidenceIndex.routesAndScripts.length,
      text: analysis.evidenceIndex.text.length,
    },
  });
  const structureRuntimeDetail = `结构解析完成：DOM 证据 ${analysis.evidenceIndex.dom.length} 条，交互证据 ${analysis.evidenceIndex.interactions.length} 条，路由/脚本证据 ${analysis.evidenceIndex.routesAndScripts.length} 条，文本证据 ${analysis.evidenceIndex.text.length} 条。`;
  const structureSummary = await summarizeStageDetail(
    options.llmAdapter,
    'structure',
    '结构解析',
    structureRuntimeDetail,
    structureRaw,
  );
  markStageDone(
    progress,
    'structure',
    62,
    '结构解析完成',
    structureSummary.detail,
    structureSummary.source,
    structureRaw,
  );

  markStageRunning(progress, 'risk', 72, '正在汇总可用性风险');
  const riskStatusCount = heuristicDiagnosis.reduce(
    (acc, item) => {
      if (item.status === 'success') {
        acc.success += 1;
      } else if (item.status === 'warning') {
        acc.warning += 1;
      } else {
        acc.error += 1;
      }
      return acc;
    },
    { success: 0, warning: 0, error: 0 },
  );
  const riskRaw = JSON.stringify({
    riskStatusCount,
    diagnosisItems: heuristicDiagnosis,
  });
  const riskRuntimeDetail = `风险检查完成：success ${riskStatusCount.success}，warning ${riskStatusCount.warning}，error ${riskStatusCount.error}。`;
  const riskSummary = await summarizeStageDetail(
    options.llmAdapter,
    'risk',
    '风险检查',
    riskRuntimeDetail,
    riskRaw,
  );
  markStageDone(
    progress,
    'risk',
    82,
    '风险检查完成',
    riskSummary.detail,
    riskSummary.source,
    riskRaw,
  );

  markStageRunning(progress, 'tasks', 90, '正在调用大模型生成任务建议');
  try {
    const llmResult = await options.llmAdapter.generateDiagnosisAndTasks({
      targetUrl,
      pageSummary: toLLMPageSummary(analysis),
      heuristicDiagnosis,
      taskCatalog: options.strictTasks ? buildDynamicTaskCatalog(analysis) : buildTaskCatalog(),
    });

    const diagnosisItems = cloneDiagnosisItems(
      llmResult.diagnosisItems.length > 0 ? llmResult.diagnosisItems : heuristicDiagnosis,
    );
    const candidateTasks = sortTasksByIds(
      llmResult.prioritizedTaskIds,
      llmResult.taskProposals,
      analysis.title,
    );
    const strictCandidateTasks = sortStrictTasksByIds(
      llmResult.prioritizedTaskIds,
      llmResult.taskProposals,
    );

    const gateCandidateTasks = options.strictTasks
      ? strictCandidateTasks
      : enforceCapabilityDrivenTasks(candidateTasks, analysis);
    const validation = validateDiagnosisTasks(gateCandidateTasks, analysis, {
      blacklist: options.taskBlacklist,
      minValidTasks: 1,
      invalidRatioThreshold: 0.92,
      allowBlacklistWithEvidence: true,
    });
    const acceptedBaseTasks =
      validation.acceptedTasks.length > 0 ? validation.acceptedTasks : gateCandidateTasks;
    const ensured = ensureFifteenTasks(acceptedBaseTasks);
    const nameQuality = summarizeTaskNameQuality(ensured.tasks);
    const quality = {
      autoFilledCount: 0,
      syntheticCount: 0,
      rewrittenNameCount: 0,
      nameRewrittenCount: nameQuality.nameRewrittenCount,
      nameReadableCount: nameQuality.nameReadableCount,
      namePolishPasses: 1,
      nameJargonRejectedCount: nameQuality.nameJargonRejectedCount,
      weakGateWarnings: validation.weakGateWarnings,
      llmCompletionPasses: 0,
      llmGeneratedCount: ensured.tasks.length,
      nonLlmGeneratedCount: 0,
    };

    const gateRaw = JSON.stringify({
      candidateCount: validation.candidateCount,
      acceptedCount: validation.acceptedCount,
      returnedCount: ensured.tasks.length,
      rejectedCount: validation.rejectedCount,
      warningCount: validation.weakGateWarnings,
      repairedEvidenceRefCount: validation.repairedEvidenceRefCount,
      unresolvedEvidenceRefs: validation.unresolvedEvidenceRefs,
      syntheticCount: quality.syntheticCount,
      nameRewrittenCount: quality.nameRewrittenCount,
      nameReadableCount: quality.nameReadableCount,
      namePolishPasses: quality.namePolishPasses,
      nameJargonRejectedCount: quality.nameJargonRejectedCount,
      llmCompletionPasses: quality.llmCompletionPasses,
      llmGeneratedCount: quality.llmGeneratedCount,
      nonLlmGeneratedCount: quality.nonLlmGeneratedCount,
      droppedCount: ensured.droppedCount,
      missingCount: ensured.missingCount,
      blocked: validation.blocked,
      code: validation.code,
      reasons: validation.rejected.slice(0, 6),
    });

    if (validation.blocked && validation.acceptedCount === 0) {
      const blockedRuntimeDetail = `任务门禁阻断：候选 ${validation.candidateCount}，通过 0，拒绝 ${validation.rejectedCount}。${validation.message}`;
      const blockedSummary = await summarizeStageDetail(
        options.llmAdapter,
        'tasks',
        '任务生成',
        blockedRuntimeDetail,
        gateRaw,
      );
      markStageError(
        progress,
        'tasks',
        '任务生成失败（无可用任务）',
        blockedSummary.detail,
        blockedSummary.source,
        gateRaw,
      );
      markProgressCompleted(progress, '分析完成（仅返回诊断，任务无可用结果）');
      return {
        items: appendFallbackWarning(diagnosisItems, `任务门禁阻断：${validation.message}`),
        tasks: [],
        taskGeneration: createTaskGenerationFailure(
          validation.code,
          validation.message,
          validation.candidateCount,
          0,
          validation.rejectedCount,
        ),
        source: 'diagnosis-only',
      };
    }

    if (ensured.missingCount > 0) {
      const blockedRuntimeDetail = `LLM 任务数量不足：候选 ${validation.candidateCount}，通过 ${validation.acceptedCount}，有效任务 ${ensured.tasks.length}/15，缺失 ${ensured.missingCount}。`;
      const blockedSummary = await summarizeStageDetail(
        options.llmAdapter,
        'tasks',
        '任务生成',
        blockedRuntimeDetail,
        gateRaw,
      );
      markStageError(
        progress,
        'tasks',
        '任务生成失败（LLM 输出数量不足）',
        blockedSummary.detail,
        blockedSummary.source,
        gateRaw,
      );
      markProgressCompleted(progress, '分析完成（仅返回诊断，任务数量不足）');
      return {
        items: appendFallbackWarning(diagnosisItems, blockedRuntimeDetail),
        tasks: [],
        taskGeneration: createTaskGenerationFailure(
          'INSUFFICIENT_LLM_TASKS',
          `LLM 输出任务数量不足：${ensured.tasks.length}/15。`,
          validation.candidateCount,
          ensured.tasks.length,
          Math.max(0, validation.candidateCount - ensured.tasks.length),
        ),
        source: 'diagnosis-only',
      };
    }

    const isDegraded =
      quality.nameRewrittenCount > 0 ||
      quality.nameJargonRejectedCount > 0 ||
      quality.llmCompletionPasses > 0 ||
      quality.weakGateWarnings > 0 ||
      validation.rejectedCount > 0;
    const taskRuntimeDetail = isDegraded
      ? `任务生成完成（LLM 补全模式）：候选 ${validation.candidateCount}，通过 ${validation.acceptedCount}，最终输出 ${ensured.tasks.length}/15，LLM 补全轮次 ${quality.llmCompletionPasses}。`
      : `任务生成完成：候选 ${validation.candidateCount}，通过 ${validation.acceptedCount}，固定输出 ${ensured.tasks.length}/15。`;
    const taskSummary = await summarizeStageDetail(
      options.llmAdapter,
      'tasks',
      '任务生成',
      taskRuntimeDetail,
      gateRaw,
    );
    markStageDone(
      progress,
      'tasks',
      98,
      '大模型任务生成完成',
      taskSummary.detail,
      taskSummary.source,
      gateRaw,
    );
    markProgressCompleted(progress, '分析完成（LLM 已生成诊断与任务）');

    return {
      items: diagnosisItems,
      tasks: ensured.tasks,
      taskGeneration: isDegraded
        ? createTaskGenerationDegraded(
            'TASK_GENERATION_DEGRADED',
            `任务已生成并由 LLM 补全到 ${REQUIRED_TASK_SUGGESTION_COUNT} 条，可继续下一步。`,
            validation.candidateCount,
            ensured.tasks.length,
            quality,
          )
        : createTaskGenerationSuccess(validation.candidateCount, ensured.tasks.length),
      source: 'llm',
    };
  } catch (llmError) {
    const llmMessage = getErrorMessage(llmError);
    const llmFailureRaw = JSON.stringify({
      error: llmMessage,
      model: options.llmAdapter.kind,
      targetUrl,
    });
    const llmFailureRuntimeDetail = `LLM 任务生成失败：${llmMessage}`;
    const llmFailureSummary = await summarizeStageDetail(
      options.llmAdapter,
      'tasks',
      '任务生成',
      llmFailureRuntimeDetail,
      llmFailureRaw,
    );
    markStageError(
      progress,
      'tasks',
      `LLM 任务生成失败：${llmMessage}`,
      llmFailureSummary.detail,
      llmFailureSummary.source,
      llmFailureRaw,
    );
    markProgressCompleted(progress, '分析完成（仅返回诊断，任务生成失败）');

    return {
      items: appendFallbackWarning(
        cloneDiagnosisItems(heuristicDiagnosis),
        `LLM 生成失败（${llmMessage}），任务区已阻断，不再展示模板任务。`,
      ),
      tasks: [],
      taskGeneration: createTaskGenerationFailure(
        'LLM_ERROR',
        `LLM 任务生成失败：${llmMessage}`,
      ),
      source: 'diagnosis-only',
    };
  }
}

function cloneResult(result: DiagnosisResultPayload | null): DiagnosisResultPayload | null {
  if (!result) {
    return null;
  }
  return {
    items: cloneDiagnosisItems(result.items),
    tasks: result.tasks.map((task) => ({ ...task })),
    taskGeneration: { ...result.taskGeneration },
    source: result.source,
  };
}

export const diagnosisRoutes: FastifyPluginAsync<DiagnosisRouteOptions> = async (app, options) => {
  const diagnosisJobs = new Map<string, DiagnosisJobRecord>();
  const diagnosisJobOrder: string[] = [];

  function saveJob(job: DiagnosisJobRecord): void {
    diagnosisJobs.set(job.jobId, job);
    diagnosisJobOrder.push(job.jobId);

    while (diagnosisJobOrder.length > MAX_DIAGNOSIS_JOBS) {
      const staleId = diagnosisJobOrder.shift();
      if (!staleId) {
        break;
      }
      diagnosisJobs.delete(staleId);
    }
  }

  app.post('/diagnosis', async (request) => {
    const { targetUrl } = parseOrThrow(diagnosisSchema, request.body);
    const progress = createInitialProgress();
    const result = await runDiagnosisPipeline(targetUrl, options, progress);
    return {
      items: cloneDiagnosisItems(result.items),
      tasks: result.tasks.map((task) => ({ ...task })),
      taskGeneration: { ...result.taskGeneration },
      source: result.source,
    };
  });

  app.post('/diagnosis/jobs', async (request) => {
    const { targetUrl } = parseOrThrow(diagnosisSchema, request.body);

    const jobId = `diagnosis-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
    const createdAt = new Date().toISOString();
    const job: DiagnosisJobRecord = {
      jobId,
      targetUrl,
      createdAt,
      updatedAt: createdAt,
      status: 'queued',
      progress: createInitialProgress(),
      result: null,
      error: null,
    };

    saveJob(job);

    void (async () => {
      job.status = 'running';
      job.updatedAt = new Date().toISOString();
      job.progress.message = '任务已启动';
      job.progress.updatedAt = job.updatedAt;

      try {
        const result = await runDiagnosisPipeline(targetUrl, options, job.progress);
        job.result = result;
        job.status = 'completed';
        job.updatedAt = new Date().toISOString();
        job.progress.updatedAt = job.updatedAt;
      } catch (error) {
        job.status = 'failed';
        job.updatedAt = new Date().toISOString();
        job.error = getErrorMessage(error);
        job.progress.message = `任务失败：${job.error}`;
        job.progress.updatedAt = job.updatedAt;
      }
    })();

    return {
      jobId: job.jobId,
      status: job.status,
      progress: cloneProgress(job.progress),
      createdAt: job.createdAt,
    };
  });

  app.get('/diagnosis/jobs/:jobId', async (request) => {
    const { jobId } = parseOrThrow(diagnosisJobParamsSchema, request.params);
    const job = diagnosisJobs.get(jobId);
    if (!job) {
      throw new ApiError('RUN_NOT_FOUND', `诊断任务不存在: ${jobId}`, 404, { jobId });
    }

    return {
      jobId: job.jobId,
      status: job.status,
      progress: cloneProgress(job.progress),
      result: cloneResult(job.result),
      error: job.error,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
    };
  });
};
