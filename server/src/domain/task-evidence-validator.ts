import type { Task } from '../types/domain';
import type { LiveUrlAnalysis } from './live-url-evaluator';
import { resolveEvidenceRefs } from './evidence-ref-resolver';

const DEFAULT_BLACKLIST = ['购物车', '结账', '优惠券', '下单', '收货地址', 'sku', '订单', '支付'];
const TEMPLATE_TERMS = ['新用户注册', '加入购物车', '完成结账', '应用优惠券', '查看订单', '修改数量'];
const CODE_JARGON_TERMS = [
  'api',
  'sdk',
  'dom',
  'json',
  'schema',
  'endpoint',
  'http',
  'sql',
  'hook',
  'script',
  'route',
  '组件',
  '函数',
  '脚本',
  '代码',
  '接口',
  '路由',
];
const USER_ACTION_HINTS = [
  '点击',
  '输入',
  '选择',
  '打开',
  '查看',
  '提交',
  '上传',
  '下载',
  '切换',
  '返回',
  '确认',
  '保存',
  '创建',
  '搜索',
  '浏览',
  '编辑',
  '删除',
  '重试',
  '完成',
  '进入',
];

export interface TaskValidationIssue {
  taskId: number;
  code: string;
  reason: string;
}

export interface TaskValidationWarning {
  taskId: number;
  code: string;
  reason: string;
}

export interface TaskValidationOptions {
  blacklist?: string[];
  minValidTasks?: number;
  invalidRatioThreshold?: number;
  allowBlacklistWithEvidence?: boolean;
}

export interface TaskValidationResult {
  acceptedTasks: Task[];
  rejected: TaskValidationIssue[];
  warnings: TaskValidationWarning[];
  blocked: boolean;
  code: string;
  message: string;
  candidateCount: number;
  acceptedCount: number;
  rejectedCount: number;
  weakGateWarnings: number;
  repairedEvidenceRefCount: number;
  unresolvedEvidenceRefs: string[];
}

function uniqueTerms(values: string[]): string[] {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const value of values) {
    const normalized = value.trim().toLowerCase();
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    output.push(normalized);
  }
  return output;
}

function normalizeTaskText(task: Task): string {
  return [
    task.name,
    task.description,
    task.testScenario ?? '',
    task.operationSteps?.join(' ') ?? '',
    task.successCriteria?.join(' ') ?? '',
    task.evidenceReason ?? '',
  ]
    .join(' ')
    .toLowerCase();
}

function hasTemplateRisk(task: Task): boolean {
  const text = normalizeTaskText(task);
  const termHitCount = TEMPLATE_TERMS.filter((term) => text.includes(term.toLowerCase())).length;
  return termHitCount >= 2;
}

function hasChineseText(value: string): boolean {
  return /[\u4e00-\u9fff]/.test(value);
}

function hasCodeJargon(value: string): boolean {
  const lowered = value.toLowerCase();
  return CODE_JARGON_TERMS.some((term) => lowered.includes(term.toLowerCase()));
}

function hasUserOperationLanguage(task: Task): boolean {
  const text = [
    task.name,
    task.description,
    task.testScenario ?? '',
    task.operationSteps?.join(' ') ?? '',
    task.successCriteria?.join(' ') ?? '',
  ]
    .join(' ')
    .toLowerCase();
  return USER_ACTION_HINTS.some((verb) => text.includes(verb.toLowerCase()));
}

function collectEvidenceTextByRef(analysis: LiveUrlAnalysis): Map<string, string> {
  const map = new Map<string, string>();
  const refs = [
    ...analysis.evidenceIndex.dom,
    ...analysis.evidenceIndex.interactions,
    ...analysis.evidenceIndex.routesAndScripts,
    ...analysis.evidenceIndex.text,
  ];

  for (const ref of refs) {
    map.set(ref.refId, `${ref.label} ${ref.excerpt}`.toLowerCase());
  }

  return map;
}

function hasStrongKeywordEvidence(
  evidenceRefs: string[],
  keywords: string[],
  evidenceTextByRef: Map<string, string>,
): boolean {
  if (evidenceRefs.length === 0) {
    return false;
  }

  const evidenceCorpus = evidenceRefs
    .map((ref) => evidenceTextByRef.get(ref) ?? '')
    .join(' ')
    .toLowerCase();

  if (!evidenceCorpus.trim()) {
    return false;
  }

  return keywords.some((keyword) => evidenceCorpus.includes(keyword));
}

interface TaskIssueResult {
  issues: TaskValidationIssue[];
  warnings: TaskValidationWarning[];
  normalizedTask: Task;
  repairedCount: number;
  unresolvedRefs: string[];
}

function getTaskIssues(
  task: Task,
  blacklist: string[],
  allowedEvidenceRefs: string[],
  evidenceTextByRef: Map<string, string>,
  allowBlacklistWithEvidence: boolean,
): TaskIssueResult {
  const issues: TaskValidationIssue[] = [];
  const warnings: TaskValidationWarning[] = [];
  const resolvedEvidence = resolveEvidenceRefs(task.evidenceRefs, allowedEvidenceRefs);
  const normalizedTask: Task = {
    ...task,
    evidenceRefs: resolvedEvidence.normalizedRefs,
  };

  const testScenario = normalizedTask.testScenario?.trim() ?? '';
  const operationSteps = normalizedTask.operationSteps ?? [];
  const successCriteria = normalizedTask.successCriteria ?? [];
  const evidenceRefs = normalizedTask.evidenceRefs ?? [];
  const evidenceReason = normalizedTask.evidenceReason?.trim() ?? '';

  if (!testScenario || operationSteps.length < 3 || successCriteria.length < 2) {
    issues.push({
      taskId: task.id,
      code: 'MISSING_STRUCTURED_FIELDS',
      reason: '缺少完整的场景/步骤/成功标准。',
    });
  }

  if (evidenceRefs.length === 0 || !evidenceReason) {
    issues.push({
      taskId: task.id,
      code: 'MISSING_EVIDENCE',
      reason: '任务缺少证据引用或证据说明。',
    });
  }

  const invalidRefs = resolvedEvidence.unresolvedRefs.filter(
    (refId) => !evidenceTextByRef.has(refId),
  );
  if (invalidRefs.length > 0) {
    issues.push({
      taskId: task.id,
      code: 'INVALID_EVIDENCE_REF',
      reason: `存在无法回溯的证据引用: ${invalidRefs.join(', ')}`,
    });
  }

  if (task.description.trim().length < 12) {
    warnings.push({
      taskId: task.id,
      code: 'LOW_INFORMATION_DENSITY',
      reason: '任务描述信息密度过低。',
    });
  }

  if (!hasChineseText(normalizedTask.name) || /[a-z]{3,}/i.test(normalizedTask.name)) {
    warnings.push({
      taskId: task.id,
      code: 'NON_CHINESE_TASK_NAME',
      reason: '任务名称必须使用中文用户任务命名，不能使用英文或缩写主导命名。',
    });
  }

  if (hasCodeJargon(normalizedTask.name)) {
    warnings.push({
      taskId: task.id,
      code: 'CODE_JARGON_IN_NAME',
      reason: '任务名称包含代码术语，需改为用户操作任务表达。',
    });
  }

  if (!hasUserOperationLanguage(normalizedTask)) {
    warnings.push({
      taskId: task.id,
      code: 'NON_USER_OPERATION_LANGUAGE',
      reason: '任务内容缺少用户操作动作描述（如点击、输入、提交、查看）。',
    });
  }

  const taskText = normalizeTaskText(normalizedTask);
  const hitBlacklist = blacklist.filter((keyword) => taskText.includes(keyword));
  if (hitBlacklist.length > 0) {
    const hasEvidence = hasStrongKeywordEvidence(evidenceRefs, hitBlacklist, evidenceTextByRef);
    if (!allowBlacklistWithEvidence || !hasEvidence) {
      issues.push({
        taskId: task.id,
        code: 'BLACKLIST_WITHOUT_EVIDENCE',
        reason: `命中黑名单关键词但未发现强证据支撑: ${hitBlacklist.join('、')}`,
      });
    }
  }

  if (hasTemplateRisk(normalizedTask)) {
    warnings.push({
      taskId: task.id,
      code: 'TEMPLATE_LIKE',
      reason: '任务文本与历史模板特征过于接近。',
    });
  }

  return {
    issues,
    warnings,
    normalizedTask,
    repairedCount: resolvedEvidence.repairedCount,
    unresolvedRefs: resolvedEvidence.unresolvedRefs,
  };
}

export function validateDiagnosisTasks(
  tasks: Task[],
  analysis: LiveUrlAnalysis,
  options: TaskValidationOptions = {},
): TaskValidationResult {
  const blacklist = uniqueTerms(options.blacklist ?? DEFAULT_BLACKLIST);
  const minValidTasks = options.minValidTasks ?? 3;
  const invalidRatioThreshold = options.invalidRatioThreshold ?? 0.9;
  const allowBlacklistWithEvidence = options.allowBlacklistWithEvidence ?? true;
  const evidenceTextByRef = collectEvidenceTextByRef(analysis);
  const allowedEvidenceRefs = [...evidenceTextByRef.keys()];

  const acceptedTasks: Task[] = [];
  const rejected: TaskValidationIssue[] = [];
  const warnings: TaskValidationWarning[] = [];
  const unresolvedEvidenceRefs = new Set<string>();
  let repairedEvidenceRefCount = 0;

  for (const task of tasks) {
    const result = getTaskIssues(
      task,
      blacklist,
      allowedEvidenceRefs,
      evidenceTextByRef,
      allowBlacklistWithEvidence,
    );
    repairedEvidenceRefCount += result.repairedCount;
    warnings.push(...result.warnings);
    for (const unresolvedRef of result.unresolvedRefs) {
      unresolvedEvidenceRefs.add(unresolvedRef);
    }
    if (result.issues.length === 0) {
      acceptedTasks.push(result.normalizedTask);
      continue;
    }
    rejected.push(...result.issues);
  }

  const candidateCount = tasks.length;
  const acceptedCount = acceptedTasks.length;
  const rejectedCount = Math.max(0, candidateCount - acceptedCount);
  const severeCodes = new Set(['BLACKLIST_WITHOUT_EVIDENCE', 'INVALID_EVIDENCE_REF']);
  const severeRejectedTasks = new Set(
    rejected.filter((issue) => severeCodes.has(issue.code)).map((issue) => issue.taskId),
  );
  const severeRejectedRatio =
    candidateCount === 0 ? 1 : severeRejectedTasks.size / Math.max(candidateCount, 1);
  const blocked =
    acceptedCount < minValidTasks ||
    (acceptedCount === 0 && candidateCount > 0) ||
    severeRejectedRatio > invalidRatioThreshold;
  const weakGateWarnings = warnings.length;

  if (!blocked) {
    const warningHint =
      weakGateWarnings > 0 ? `（弱门禁告警 ${weakGateWarnings} 条，已允许通过）` : '';
    return {
      acceptedTasks,
      rejected,
      warnings,
      blocked,
      code: 'TASK_GATE_PASSED',
      message: `任务质量校验通过${warningHint}。`,
      candidateCount,
      acceptedCount,
      rejectedCount,
      weakGateWarnings,
      repairedEvidenceRefCount,
      unresolvedEvidenceRefs: [...unresolvedEvidenceRefs],
    };
  }

  const topReasons = uniqueTerms(rejected.map((issue) => issue.reason)).slice(0, 3);
  const blockedByInsufficient = acceptedCount < minValidTasks || acceptedCount === 0;
  return {
    acceptedTasks,
    rejected,
    warnings,
    blocked: true,
    code: blockedByInsufficient ? 'INSUFFICIENT_VALID_TASKS' : 'OFF_TOPIC_RATIO_TOO_HIGH',
    message:
      blockedByInsufficient
        ? `任务有效数量不足（${acceptedCount}/${candidateCount}）。${topReasons.join('；')}`
        : `明显离题任务占比过高（${severeRejectedTasks.size}/${candidateCount}）。${topReasons.join('；')}`,
    candidateCount,
    acceptedCount,
    rejectedCount,
    weakGateWarnings,
    repairedEvidenceRefCount,
    unresolvedEvidenceRefs: [...unresolvedEvidenceRefs],
  };
}
