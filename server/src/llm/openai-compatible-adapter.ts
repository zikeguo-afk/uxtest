import type { LLMAdapter, LLMHealthReport, StageSummaryInput } from './adapter';
import type { ZodTypeAny } from 'zod';
import type {
  DiagnosisItem,
  LLMCrawlStageInput,
  LLMCrawlStageOutput,
  LLMRiskStageInput,
  LLMRiskStageOutput,
  LLMStageResult,
  LLMStructureStageInput,
  LLMStructureStageOutput,
  LLMTaskStageInput,
  LLMTaskStageOutput,
  LLMAnalysisInput,
  LLMAnalysisOutput,
  LLMEnhanceInput,
  LLMEnhanceOutput,
  LLMTaskProposal,
} from '../types/domain';
import {
  llmCrawlStageSchema,
  llmRiskStageSchema,
  llmStructureStageSchema,
  llmTaskStageSchema,
} from './stage-schemas';
import { LLM_STAGE_PROMPTS } from './prompts/diagnosis-stages';
import { loadPromptFromEnv } from './prompt-loader';

interface OpenAICompatibleAdapterOptions {
  baseUrl: string;
  apiKey: string;
  model: string;
  timeoutMs: number;
  temperature: number;
  stageRetryCount?: number;
  jsonRepairCount?: number;
}

interface ChatCompletionResponse {
  choices?: Array<{
    message?: {
      content?: string | null;
    };
  }>;
}

const RESPONSIBILITIES = [
  '按四阶段生成页面级可用性诊断（抓取说明/结构解析/风险检查/任务生成）。',
  '只增强 QA 的推断描述质量，不生成新的事实证据。',
  '严格基于输入 evidence，禁止编造 caseId/taskId/step。',
  '输出必须是中文，且保留“推断”标注语气。',
];

const SYSTEM_PROMPT = loadPromptFromEnv(
  'LLM_PROMPT_ENHANCE_PATH',
  [
  '你是 UXAgent 的推断润色器，只做答案增强，不做证据生成。',
  '硬性规则：',
  '1) 只可改写 draftAnswer，不得引入输入 evidence 之外的新事实。',
  '2) 不得虚构案例编号、任务编号、步骤号、指标数据。',
  '3) 保持中文，简洁，结论可执行。',
  '4) 返回 JSON：{"answer":"...","confidenceDelta":number}。',
  '5) confidenceDelta 仅允许 -0.15 到 0.15。',
].join('\n'),
);

const ANALYSIS_SYSTEM_PROMPT = loadPromptFromEnv(
  'LLM_PROMPT_ANALYSIS_PATH',
  [
  '你是 UXAgent 的可用性评测规划器。',
  '你的任务是基于页面结构摘要与任务目录，输出“诊断项 + 任务优先级 + 任务文案改写”。',
  '硬性规则：',
  '1) 只可依据输入信息输出，不可编造未给出的事实。',
  '2) 诊断项字段必须为 dimension/status/description，status 仅 success|warning|error。',
  '3) prioritizedTaskIds 只能从输入 taskCatalog 的 id 中选择，并尽量覆盖关键流程。',
  '4) 必须输出 taskProposals，且每个 proposal 的 id 仅能来自 taskCatalog。',
  '5) taskProposals 的 name/description 要结合页面实际特征改写，避免模板化文案。',
  '6) taskProposals 的描述必须尽可能引用页面上下文（如标题、入口缺失、关键元素缺失或存在）。',
  '7) 如果页面不支持某流程，name/description 要明确写出“验证失败路径/异常路径”。',
  '8) 至少给出 6 条诊断项，任务 id 给出优先级排序即可。',
  '9) taskProposals 需包含字段：id,name,description,difficulty,estimatedDuration,testScenario,operationSteps,successCriteria,tags,evidenceRefs,evidenceReason。',
  '10) operationSteps 至少 3 步，successCriteria 至少 2 条。',
  '11) evidenceRefs 必须逐项从 pageSummary.allowedEvidenceRefIds 中选择，不可伪造、不可改写。',
  '12) evidenceReason 必须解释该任务为什么由这些证据支持。',
  '13) taskProposals 必须输出 15 条，优先覆盖 prioritizedTaskIds 前列。',
  '14) task name 必须中文，表达用户操作任务，禁止使用 API/DOM/JSON/脚本 等代码术语命名。',
  '15) 若个别字段信息不足，可基于页面上下文做合理补全，但不要留空字段。',
  '16) 返回 JSON：{"diagnosisItems":[...],"prioritizedTaskIds":[...],"taskProposals":[{"id":1,"name":"用户完成...","description":"...","difficulty":"中等","estimatedDuration":"8-12分钟","testScenario":"...","operationSteps":["..."],"successCriteria":["..."],"tags":["..."],"evidenceRefs":["interaction:button-1"],"evidenceReason":"..."}]}。',
].join('\n'),
);

const TASK_PROPOSAL_SYSTEM_PROMPT = loadPromptFromEnv(
  'LLM_PROMPT_TASK_REWRITE_PATH',
  [
  '你是 UXAgent 的任务改写器。',
  '目标：基于页面上下文与诊断结果，重写 taskCatalog 的任务文案（保持 id 不变）。',
  '硬性规则：',
  '1) 只能使用输入 taskCatalog 中已有的 id，不得新增或删除 id。',
  '2) 优先覆盖 prioritizedTaskIds 前列，必须输出 15 条完整任务。',
  '3) name 和 description 必须结合当前页面上下文改写，避免模板化电商固定文案。',
  '4) 若某流程在页面上不存在，文案要明确写“验证缺失/异常路径”。',
  '5) 输出中文。',
  '6) 每个 taskProposals 必须包含：id,name,description,difficulty,estimatedDuration,testScenario,operationSteps,successCriteria,tags,evidenceRefs,evidenceReason。',
  '7) operationSteps 至少 3 步，successCriteria 至少 2 条。',
  '8) evidenceRefs 必须逐项从 pageSummary.allowedEvidenceRefIds 中选择。',
  '9) task name 必须是中文用户操作任务表达（如“用户完成...”），禁止代码术语命名。',
  '10) 若个别字段缺失，请按用户操作语境补全，不要留空。',
  '11) 返回 JSON：{"taskProposals":[{"id":1,"name":"用户完成...","description":"...","difficulty":"中等","estimatedDuration":"8-12分钟","testScenario":"...","operationSteps":["..."],"successCriteria":["..."],"tags":["..."],"evidenceRefs":["interaction:button-1"],"evidenceReason":"..."}]}。',
].join('\n'),
);

const STAGE_SUMMARY_PROMPT = loadPromptFromEnv(
  'LLM_PROMPT_SUMMARY_PATH',
  [
  '你是 UXAgent 的阶段日志摘要器。',
  '请将 runtimeDetail 与 detailRaw 压缩成一句中文执行说明。',
  '要求：不得编造，不得抽象空话，要保留关键数值/对象。',
  '直接返回纯文本，不要返回 JSON。',
].join('\n'),
);

const REQUIRED_TASK_PROPOSAL_COUNT = 15;
const CODE_JARGON_HINTS = ['api', 'sdk', 'dom', 'json', 'schema', 'script', 'route', '接口', '脚本', '代码', '路由'];
const USER_ACTION_HINTS = [
  '点击',
  '输入',
  '选择',
  '打开',
  '查看',
  '提交',
  '切换',
  '确认',
  '保存',
  '创建',
  '完成',
  '进入',
  '使用',
  '上传',
  '下载',
];

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function safeParseJson(text: string): Record<string, unknown> | null {
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    // Attempt extraction from markdown code fence.
    const matched = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    if (!matched) {
      return null;
    }
    try {
      return JSON.parse(matched[1]) as Record<string, unknown>;
    } catch {
      return null;
    }
  }
}

function toEnhanceOutput(input: LLMEnhanceInput, payload: Record<string, unknown> | null): LLMEnhanceOutput {
  const answer =
    typeof payload?.answer === 'string' && payload.answer.trim().length > 0
      ? payload.answer.trim()
      : input.draftAnswer;

  const rawDelta = typeof payload?.confidenceDelta === 'number' ? payload.confidenceDelta : 0;
  const confidenceDelta = clamp(rawDelta, -0.15, 0.15);

  return {
    answer,
    confidenceDelta,
  };
}

function normalizeDiagnosisStatus(value: unknown): DiagnosisItem['status'] {
  if (value === 'success' || value === 'warning' || value === 'error') {
    return value;
  }
  return 'warning';
}

function normalizeDiagnosisItems(raw: unknown): DiagnosisItem[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  const output: DiagnosisItem[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') {
      continue;
    }
    const dimension = String((item as { dimension?: unknown }).dimension ?? '').trim();
    const description = String((item as { description?: unknown }).description ?? '').trim();
    if (!dimension || !description) {
      continue;
    }

    output.push({
      dimension,
      status: normalizeDiagnosisStatus((item as { status?: unknown }).status),
      description,
    });
  }

  return output.slice(0, 10);
}

function normalizeTaskIds(raw: unknown, allowedTaskIds: number[]): number[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  const allowed = new Set(allowedTaskIds);
  const unique = new Set<number>();

  for (const value of raw) {
    const taskId = Number(value);
    if (!Number.isInteger(taskId) || !allowed.has(taskId) || unique.has(taskId)) {
      continue;
    }
    unique.add(taskId);
  }

  return [...unique];
}

function normalizeDifficulty(value: unknown): '简单' | '中等' | '困难' {
  if (value === '简单' || value === '中等' || value === '困难') {
    return value;
  }
  return '中等';
}

function normalizeStringArray(raw: unknown, fallback: string[]): string[] {
  const values = normalizeStringList(raw, 8);

  return values.length > 0 ? values : fallback;
}

function normalizeStringList(raw: unknown, limit: number): string[] {
  if (Array.isArray(raw)) {
    return raw
      .map((item) => String(item ?? '').trim())
      .filter((item) => item.length > 0)
      .slice(0, limit);
  }

  if (typeof raw !== 'string') {
    return [];
  }

  const compact = raw
    .replace(/\r/g, '\n')
    .replace(/\t/g, ' ')
    .trim();
  if (!compact) {
    return [];
  }

  const byLine = compact
    .split(/\n+/)
    .map((item) => item.replace(/^\s*(?:[-*•]|\d+[.)、])\s*/g, '').trim())
    .filter((item) => item.length > 0);

  const candidates = byLine.length >= 2
    ? byLine
    : compact
      .split(/[；;。]+/g)
      .map((item) => item.replace(/^\s*(?:[-*•]|\d+[.)、])\s*/g, '').trim())
      .filter((item) => item.length > 0);

  return candidates.slice(0, limit);
}

function containsChineseText(value: string): boolean {
  return /[\u4e00-\u9fff]/.test(value);
}

function hasUserActionHint(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return USER_ACTION_HINTS.some((hint) => normalized.includes(hint.toLowerCase()));
}

function hasCodeJargon(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return CODE_JARGON_HINTS.some((hint) => normalized.includes(hint.toLowerCase()));
}

function sanitizeTaskName(inputName: string, fallbackName: string): { name: string; rewritten: boolean } {
  const source = inputName.trim();
  const fallback = fallbackName.trim() || '页面核心操作';
  const preferred = source || fallback;
  const isInvalid =
    !containsChineseText(preferred) ||
    hasCodeJargon(preferred) ||
    !hasUserActionHint(preferred);

  if (!isInvalid) {
    return { name: preferred, rewritten: false };
  }

  const core = fallback
    .replace(/^用户任务\d+[:：]?\s*/u, '')
    .replace(/^用户/u, '')
    .trim();

  return {
    name: `用户完成${core || '页面操作'}任务`,
    rewritten: true,
  };
}

function pickFallbackEvidenceRefs(
  allowedEvidenceRefIds: string[],
  indexSeed: number,
): string[] {
  if (allowedEvidenceRefIds.length === 0) {
    return [];
  }

  if (allowedEvidenceRefIds.length === 1) {
    return [allowedEvidenceRefIds[0]];
  }

  const first = allowedEvidenceRefIds[indexSeed % allowedEvidenceRefIds.length];
  const second = allowedEvidenceRefIds[(indexSeed + 1) % allowedEvidenceRefIds.length];
  return first === second ? [first] : [first, second];
}

function mergeListWithFallback(
  values: string[],
  fallback: string[],
  minCount: number,
): { list: string[]; autoFilledCount: number } {
  const output: string[] = [];
  const seen = new Set<string>();
  let autoFilledCount = 0;

  for (const value of values) {
    const normalized = value.trim();
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    output.push(normalized);
  }

  for (const value of fallback) {
    if (output.length >= minCount) {
      break;
    }
    const normalized = value.trim();
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    output.push(normalized);
    autoFilledCount += 1;
  }

  return {
    list: output.slice(0, Math.max(minCount, output.length)),
    autoFilledCount,
  };
}

function pickNumber(value: unknown): number | null {
  const numberValue = Number(value);
  return Number.isInteger(numberValue) ? numberValue : null;
}

function normalizeStringArrayStrict(
  raw: unknown,
  minCount: number,
  fieldName: string,
): string[] {
  const values = normalizeStringList(raw, 12);
  if (values.length === 0) {
    throw new Error(`LLM 输出缺少字段 ${fieldName}`);
  }

  if (values.length < minCount) {
    throw new Error(`LLM 输出字段 ${fieldName} 数量不足`);
  }

  return values;
}

function readPath(
  payload: Record<string, unknown> | null,
  path: string[],
): unknown {
  if (!payload) {
    return undefined;
  }

  let current: unknown = payload;
  for (const key of path) {
    if (!current || typeof current !== 'object') {
      return undefined;
    }
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

function pickFirstPath(
  payload: Record<string, unknown> | null,
  paths: string[][],
): unknown {
  for (const path of paths) {
    const value = readPath(payload, path);
    if (value !== undefined) {
      return value;
    }
  }
  return undefined;
}

function pickObjectField(
  source: Record<string, unknown>,
  keys: string[],
): unknown {
  for (const key of keys) {
    const value = source[key];
    if (value !== undefined) {
      return value;
    }
  }
  return undefined;
}

function normalizeTaskProposals(
  raw: unknown,
  fallbackCatalog: LLMAnalysisInput['taskCatalog'],
): LLMTaskProposal[] {
  if (!Array.isArray(raw)) {
    if (raw && typeof raw === 'object') {
      const keys = Object.keys(raw as Record<string, unknown>).slice(0, 8);
      throw new Error(`LLM taskProposals 不是数组（对象键: ${keys.join(',') || 'none'}）`);
    }
    throw new Error('LLM taskProposals 不是数组');
  }

  const fallbackMap = new Map(fallbackCatalog.map((item) => [item.id, item]));
  const output: LLMTaskProposal[] = [];
  const used = new Set<number>();
  const parseErrors: string[] = [];

  for (const item of raw) {
    if (!item || typeof item !== 'object') {
      continue;
    }
    const itemRecord = item as Record<string, unknown>;
    const id = Number(
      pickObjectField(itemRecord, ['id', 'taskId', 'task_id']),
    );
    if (!Number.isInteger(id) || !fallbackMap.has(id) || used.has(id)) {
      continue;
    }

    try {
      const name = String(pickObjectField(itemRecord, ['name', 'title']) ?? '').trim();
      const description = String(
        pickObjectField(itemRecord, ['description', 'desc']) ?? '',
      ).trim();
      const evidenceReasonRaw = String(
        pickObjectField(itemRecord, ['evidenceReason', 'evidence_reason', 'reason']) ?? '',
      ).trim();
      const estimatedDuration = String(
        pickObjectField(itemRecord, ['estimatedDuration', 'estimated_duration', 'duration']) ?? '',
      ).trim();
      const testScenario = String(
        pickObjectField(itemRecord, ['testScenario', 'test_scenario', 'scenario', 'context']) ?? '',
      ).trim();
      const operationSteps = normalizeStringArrayStrict(
        pickObjectField(itemRecord, ['operationSteps', 'operation_steps', 'steps', 'stepList']),
        3,
        'operationSteps',
      );
      const successCriteria = normalizeStringArrayStrict(
        pickObjectField(itemRecord, ['successCriteria', 'success_criteria', 'criteria', 'acceptanceCriteria']),
        2,
        'successCriteria',
      );
      const tags = normalizeStringArray(
        pickObjectField(itemRecord, ['tags', 'labels']),
        ['自动生成'],
      );
      const evidenceRefs = normalizeStringArrayStrict(
        pickObjectField(itemRecord, ['evidenceRefs', 'evidence_refs', 'refs', 'evidence']),
        1,
        'evidenceRefs',
      );
      const evidenceReason =
        evidenceReasonRaw.length > 0
          ? evidenceReasonRaw
          : `依据页面证据引用（${evidenceRefs.slice(0, 3).join('、')}）生成该任务。`;

      if (!name) {
        throw new Error(`LLM 任务 ${id} 缺少 name`);
      }
      if (!description) {
        throw new Error(`LLM 任务 ${id} 缺少 description`);
      }
      if (!testScenario) {
        throw new Error(`LLM 任务 ${id} 缺少 testScenario`);
      }

      output.push({
        id,
        name,
        description,
        difficulty: normalizeDifficulty(
          pickObjectField(itemRecord, ['difficulty', 'level']),
        ),
        estimatedDuration: estimatedDuration.length > 0 ? estimatedDuration : '8-12分钟',
        testScenario,
        operationSteps,
        successCriteria,
        tags,
        evidenceRefs,
        evidenceReason,
      });
      used.add(id);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown item parse error';
      parseErrors.push(`task:${id}:${message}`);
      continue;
    }
  }

  if (output.length === 0) {
    const reason = parseErrors.length > 0 ? `（${parseErrors[0]}）` : '';
    throw new Error(`LLM taskProposals 为空${reason}`);
  }

  return output;
}

interface LenientRecoveryQuality {
  autoFilledCount: number;
  syntheticCount: number;
  rewrittenNameCount: number;
}

interface LenientTaskRecoveryResult {
  output: LLMTaskStageOutput;
  quality: LenientRecoveryQuality;
}

function recoverLenientTaskStageOutput(
  rawText: string,
  fallbackCatalog: LLMAnalysisInput['taskCatalog'],
  allowedEvidenceRefIds: string[],
): LenientTaskRecoveryResult {
  const parsed = safeParseJson(rawText ?? '');
  const catalog = fallbackCatalog.slice(0, REQUIRED_TASK_PROPOSAL_COUNT);
  const catalogIds = catalog.map((item) => item.id);
  const allowedEvidenceSet = new Set(allowedEvidenceRefIds);
  const fallbackEvidence =
    allowedEvidenceRefIds.length > 0 ? [...allowedEvidenceRefIds] : ['text:bundle-1'];
  const proposalsRaw = pickFirstPath(parsed, [
    ['taskProposals'],
    ['task_proposals'],
    ['tasks'],
    ['taskSuggestions'],
    ['task_suggestions'],
    ['result', 'taskProposals'],
    ['result', 'tasks'],
    ['data', 'taskProposals'],
    ['data', 'tasks'],
  ]);

  const proposalArray = Array.isArray(proposalsRaw) ? proposalsRaw : [];
  const rawById = new Map<number, Record<string, unknown>>();
  const rawByOrder: Record<string, unknown>[] = [];
  for (const item of proposalArray) {
    if (!item || typeof item !== 'object') {
      continue;
    }
    const record = item as Record<string, unknown>;
    const taskId = pickNumber(
      pickObjectField(record, ['id', 'taskId', 'task_id']),
    );
    if (taskId && catalogIds.includes(taskId) && !rawById.has(taskId)) {
      rawById.set(taskId, record);
      continue;
    }
    rawByOrder.push(record);
  }

  const quality: LenientRecoveryQuality = {
    autoFilledCount: 0,
    syntheticCount: 0,
    rewrittenNameCount: 0,
  };

  let orderCursor = 0;
  const taskProposals: LLMTaskProposal[] = catalog.map((task, index) => {
    const rawItem = rawById.get(task.id) ?? rawByOrder[orderCursor];
    if (!rawById.has(task.id) && rawItem) {
      orderCursor += 1;
    }
    const isSynthetic = !rawItem;
    if (isSynthetic) {
      quality.syntheticCount += 1;
    }

    const rawName = String(
      pickObjectField(rawItem ?? {}, ['name', 'title']) ?? '',
    );
    const { name, rewritten } = sanitizeTaskName(rawName, task.name);
    if (rewritten) {
      quality.rewrittenNameCount += 1;
    }

    const descriptionRaw = String(
      pickObjectField(rawItem ?? {}, ['description', 'desc']) ?? '',
    ).trim();
    const description =
      descriptionRaw.length > 0
        ? descriptionRaw
        : `用户围绕「${name}」完成关键操作，观察流程是否顺畅并确认反馈。`;
    if (!descriptionRaw) {
      quality.autoFilledCount += 1;
    }

    const estimatedDurationRaw = String(
      pickObjectField(rawItem ?? {}, ['estimatedDuration', 'estimated_duration', 'duration']) ?? '',
    ).trim();
    const estimatedDuration = estimatedDurationRaw || '8-12分钟';
    if (!estimatedDurationRaw) {
      quality.autoFilledCount += 1;
    }

    const testScenarioRaw = String(
      pickObjectField(rawItem ?? {}, ['testScenario', 'test_scenario', 'scenario', 'context']) ?? '',
    ).trim();
    const testScenario =
      testScenarioRaw ||
      `你正在使用当前网站，需要完成「${name}」并确认是否达到预期结果。`;
    if (!testScenarioRaw) {
      quality.autoFilledCount += 1;
    }

    const defaultOperationSteps = [
      `打开与「${name}」相关的页面或入口`,
      `按页面提示完成「${name}」核心操作`,
      '查看系统反馈并确认任务结果',
    ];
    const rawOperationSteps = normalizeStringList(
      pickObjectField(rawItem ?? {}, ['operationSteps', 'operation_steps', 'steps', 'stepList']),
      12,
    );
    const mergedOperationSteps = mergeListWithFallback(rawOperationSteps, defaultOperationSteps, 3);
    quality.autoFilledCount += mergedOperationSteps.autoFilledCount;

    const defaultSuccessCriteria = [
      `用户可以独立完成「${name}」`,
      '系统反馈清晰且用户可理解',
    ];
    const rawSuccessCriteria = normalizeStringList(
      pickObjectField(rawItem ?? {}, ['successCriteria', 'success_criteria', 'criteria', 'acceptanceCriteria']),
      10,
    );
    const mergedSuccessCriteria = mergeListWithFallback(rawSuccessCriteria, defaultSuccessCriteria, 2);
    quality.autoFilledCount += mergedSuccessCriteria.autoFilledCount;

    const tagsRaw = normalizeStringList(
      pickObjectField(rawItem ?? {}, ['tags', 'labels']),
      8,
    );
    const tags = tagsRaw.length > 0 ? tagsRaw : ['用户任务', '自动补全'];
    if (tagsRaw.length === 0) {
      quality.autoFilledCount += 1;
    }

    const refsRaw = normalizeStringList(
      pickObjectField(rawItem ?? {}, ['evidenceRefs', 'evidence_refs', 'refs', 'evidence']),
      6,
    ).filter((refId) => allowedEvidenceSet.has(refId));
    const refs = refsRaw.length > 0 ? refsRaw : pickFallbackEvidenceRefs(fallbackEvidence, index + task.id);
    if (refsRaw.length === 0) {
      quality.autoFilledCount += 1;
    }

    const evidenceReasonRaw = String(
      pickObjectField(rawItem ?? {}, ['evidenceReason', 'evidence_reason', 'reason']) ?? '',
    ).trim();
    const evidenceReason =
      evidenceReasonRaw ||
      `基于当前页面已提取证据（${refs.slice(0, 2).join('、')}）自动补全该任务。`;
    if (!evidenceReasonRaw) {
      quality.autoFilledCount += 1;
    }

    return {
      id: task.id,
      name,
      description,
      difficulty: normalizeDifficulty(pickObjectField(rawItem ?? {}, ['difficulty', 'level'])),
      estimatedDuration,
      testScenario,
      operationSteps: mergedOperationSteps.list,
      successCriteria: mergedSuccessCriteria.list,
      tags,
      evidenceRefs: refs,
      evidenceReason,
    };
  });

  const prioritizedTaskIdsRaw = pickFirstPath(parsed, [
    ['prioritizedTaskIds'],
    ['prioritized_task_ids'],
    ['priorityTaskIds'],
    ['taskIds'],
    ['task_ids'],
    ['result', 'prioritizedTaskIds'],
    ['data', 'prioritizedTaskIds'],
  ]);
  const prioritizedTaskIds = normalizeTaskIds(prioritizedTaskIdsRaw, catalogIds);
  const completedPriority = [
    ...prioritizedTaskIds,
    ...catalogIds.filter((taskId) => !prioritizedTaskIds.includes(taskId)),
  ].slice(0, taskProposals.length);

  const summaryRaw = String(
    pickFirstPath(parsed, [['summary'], ['result', 'summary'], ['data', 'summary']]) ?? '',
  ).trim();

  return {
    output: {
      summary: summaryRaw || '任务阶段已启用自动补全恢复，返回固定15条用户操作任务。',
      prioritizedTaskIds: completedPriority.length > 0 ? completedPriority : taskProposals.map((task) => task.id),
      taskProposals,
    },
    quality,
  };
}

function toAnalysisOutput(
  input: LLMAnalysisInput,
  payload: Record<string, unknown> | null,
): LLMAnalysisOutput {
  const fallbackTaskIds = input.taskCatalog.map((task) => task.id);
  const diagnosisItemsRaw = pickFirstPath(payload, [
    ['diagnosisItems'],
    ['diagnosis_items'],
    ['diagnosis'],
    ['items'],
    ['result', 'diagnosisItems'],
    ['result', 'items'],
    ['data', 'diagnosisItems'],
    ['data', 'items'],
  ]);
  const prioritizedTaskIdsRaw = pickFirstPath(payload, [
    ['prioritizedTaskIds'],
    ['prioritized_task_ids'],
    ['priorityTaskIds'],
    ['taskIds'],
    ['task_ids'],
    ['result', 'prioritizedTaskIds'],
    ['data', 'prioritizedTaskIds'],
  ]);
  const taskProposalsRaw = pickFirstPath(payload, [
    ['taskProposals'],
    ['task_proposals'],
    ['tasks'],
    ['taskSuggestions'],
    ['task_suggestions'],
    ['result', 'taskProposals'],
    ['data', 'taskProposals'],
    ['data', 'tasks'],
  ]);

  const diagnosisItems = normalizeDiagnosisItems(diagnosisItemsRaw);
  const prioritizedTaskIds = normalizeTaskIds(prioritizedTaskIdsRaw, fallbackTaskIds);
  const completedTaskIds = [
    ...prioritizedTaskIds,
    ...fallbackTaskIds.filter((taskId) => !prioritizedTaskIds.includes(taskId)),
  ];

  const taskProposals = normalizeTaskProposals(taskProposalsRaw, input.taskCatalog);

  return {
    diagnosisItems:
      diagnosisItems.length > 0 ? diagnosisItems : input.heuristicDiagnosis,
    prioritizedTaskIds: completedTaskIds,
    taskProposals,
  };
}

function extractAnalysisBase(
  input: LLMAnalysisInput,
  payload: Record<string, unknown> | null,
): { diagnosisItems: DiagnosisItem[]; completedTaskIds: number[] } {
  const fallbackTaskIds = input.taskCatalog.map((task) => task.id);
  const diagnosisItemsRaw = pickFirstPath(payload, [
    ['diagnosisItems'],
    ['diagnosis_items'],
    ['diagnosis'],
    ['items'],
    ['result', 'diagnosisItems'],
    ['result', 'items'],
    ['data', 'diagnosisItems'],
    ['data', 'items'],
  ]);
  const prioritizedTaskIdsRaw = pickFirstPath(payload, [
    ['prioritizedTaskIds'],
    ['prioritized_task_ids'],
    ['priorityTaskIds'],
    ['taskIds'],
    ['task_ids'],
    ['result', 'prioritizedTaskIds'],
    ['data', 'prioritizedTaskIds'],
  ]);

  const diagnosisItems = normalizeDiagnosisItems(diagnosisItemsRaw);
  const prioritizedTaskIds = normalizeTaskIds(prioritizedTaskIdsRaw, fallbackTaskIds);
  const completedTaskIds = [
    ...prioritizedTaskIds,
    ...fallbackTaskIds.filter((taskId) => !prioritizedTaskIds.includes(taskId)),
  ];

  return {
    diagnosisItems: diagnosisItems.length > 0 ? diagnosisItems : input.heuristicDiagnosis,
    completedTaskIds,
  };
}

function withTimeoutSignal(timeoutMs: number): { signal: AbortSignal; cancel: () => void } {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(2_000, timeoutMs));
  return {
    signal: controller.signal,
    cancel: () => clearTimeout(timer),
  };
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, '');
}

function isBigModelProvider(options: OpenAICompatibleAdapterOptions): boolean {
  return normalizeBaseUrl(options.baseUrl).includes('bigmodel.cn');
}

function applyProviderRequestOverrides(
  options: OpenAICompatibleAdapterOptions,
  body: Record<string, unknown>,
): Record<string, unknown> {
  if (isBigModelProvider(options) && options.model.toLowerCase().startsWith('glm-')) {
    return {
      ...body,
      thinking: { type: 'disabled' },
    };
  }
  return body;
}

function shouldRetryWithoutResponseFormat(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  const message = error.message.toLowerCase();
  return message.includes('http 400') || message.includes('response_format');
}

async function requestChatContent(
  options: OpenAICompatibleAdapterOptions,
  body: Record<string, unknown>,
  timeout: { signal: AbortSignal },
): Promise<string> {
  const requestBody = applyProviderRequestOverrides(options, body);
  const response = await fetch(`${normalizeBaseUrl(options.baseUrl)}/chat/completions`, {
    method: 'POST',
    signal: timeout.signal,
    headers: {
      authorization: `Bearer ${options.apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`LLM API 请求失败: ${response.status} ${text.slice(0, 200)}`);
  }

  const payload = (await response.json()) as ChatCompletionResponse;
  return payload.choices?.[0]?.message?.content ?? '';
}

function extractRawSnippet(raw: string, limit = 420): string {
  return String(raw ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, limit);
}

async function repairJsonOutput(
  options: OpenAICompatibleAdapterOptions,
  stage: 'crawl' | 'structure' | 'risk' | 'tasks',
  rawText: string,
  errorMessage: string,
  timeout: { signal: AbortSignal },
): Promise<string> {
  const body = {
    model: options.model,
    temperature: 0,
    max_tokens: 1200,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: LLM_STAGE_PROMPTS.repair },
      {
        role: 'user',
        content: JSON.stringify(
          {
            stage,
            errorMessage,
            rawText,
          },
          null,
          2,
        ),
      },
    ],
  };
  return requestChatContent(options, body, timeout);
}

async function callStructuredStage<T>({
  options,
  stage,
  schema,
  input,
  systemPrompt,
  maxTokens = 2000,
}: {
  options: OpenAICompatibleAdapterOptions;
  stage: 'crawl' | 'structure' | 'risk' | 'tasks';
  schema: ZodTypeAny;
  input: unknown;
  systemPrompt: string;
  maxTokens?: number;
}): Promise<LLMStageResult<T>> {
  const maxAttempts = Math.max(1, (options.stageRetryCount ?? 2) + 1);
  const maxRepairAttempts = Math.max(0, options.jsonRepairCount ?? 1);
  let lastError = 'unknown';
  let lastRaw = '';
  let lastCode: 'STAGE_SCHEMA_INVALID' | 'STAGE_TIMEOUT' | 'STAGE_PROVIDER_ERROR' =
    'STAGE_SCHEMA_INVALID';

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const timeout = withTimeoutSignal(options.timeoutMs);
    try {
        const body = {
          model: options.model,
          temperature: Math.min(Math.max(options.temperature, 0), 0.5),
          max_tokens: maxTokens,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: systemPrompt },
            {
              role: 'user',
              content: [
                '以下是后端已抓取并切片后的输入 JSON。',
                '不要联网，不要访问 URL；只能基于该 JSON 分析并返回结果。',
                JSON.stringify(input, null, 2),
              ].join('\n\n'),
            },
          ],
        };
      const raw = await requestChatContent(options, body, timeout);
      lastRaw = raw;
      const parsed = safeParseJson(raw);
      const validated = schema.safeParse(parsed);
      if (validated.success) {
        return {
          output: validated.data as T,
          attempts: attempt,
          repaired: false,
          rawSnippet: extractRawSnippet(raw),
        };
      }

      let repairedRaw = raw;
      let repairedOutput: T | null = null;
      for (let repairAttempt = 0; repairAttempt < maxRepairAttempts; repairAttempt += 1) {
        repairedRaw = await repairJsonOutput(
          options,
          stage,
          repairedRaw,
          validated.error.issues[0]?.message ?? 'schema invalid',
          timeout,
        );
        const repairedParsed = safeParseJson(repairedRaw);
        const repairedValidated = schema.safeParse(repairedParsed);
        if (repairedValidated.success) {
          repairedOutput = repairedValidated.data as T;
          break;
        }
        lastError = repairedValidated.error.issues[0]?.message ?? 'schema invalid';
        lastCode = 'STAGE_SCHEMA_INVALID';
      }

      if (repairedOutput) {
        return {
          output: repairedOutput,
          attempts: attempt,
          repaired: true,
          rawSnippet: extractRawSnippet(repairedRaw),
        };
      }
      lastError = validated.error.issues[0]?.message ?? 'schema invalid';
      lastCode = 'STAGE_SCHEMA_INVALID';
    } catch (error) {
      lastError = getErrorText(error);
      lastCode = classifyStageErrorCode(error);
    } finally {
      timeout.cancel();
    }
  }

  throw new Error(
    `${lastCode}:${stage}:${lastError}; raw=${extractRawSnippet(lastRaw) || 'empty'}`,
  );
}

function getErrorText(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return 'unknown error';
}

function classifyStageErrorCode(
  error: unknown,
): 'STAGE_SCHEMA_INVALID' | 'STAGE_TIMEOUT' | 'STAGE_PROVIDER_ERROR' {
  if (!(error instanceof Error)) {
    return 'STAGE_PROVIDER_ERROR';
  }

  const message = `${error.name}:${error.message}`.toLowerCase();
  if (
    error.name === 'AbortError' ||
    message.includes('abort') ||
    message.includes('timeout')
  ) {
    return 'STAGE_TIMEOUT';
  }

  if (message.includes('schema') || message.includes('json')) {
    return 'STAGE_SCHEMA_INVALID';
  }

  if (message.includes('llm api 请求失败') || message.includes('http ')) {
    return 'STAGE_PROVIDER_ERROR';
  }

  return 'STAGE_PROVIDER_ERROR';
}

function isSchemaStageErrorMessage(message: string): boolean {
  const normalized = message.toLowerCase();
  return normalized.includes('stage_schema_invalid') || normalized.includes('schema');
}

function extractStageErrorRawPayload(message: string): string {
  const matched = message.match(/raw=([\s\S]*)$/i);
  if (!matched) {
    return '';
  }
  return matched[1]?.trim() ?? '';
}

async function callChatCompletion(
  options: OpenAICompatibleAdapterOptions,
  input: LLMEnhanceInput,
): Promise<LLMEnhanceOutput> {
  const bodyWithJsonFormat = {
    model: options.model,
    temperature: options.temperature,
    max_tokens: 120,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: JSON.stringify(
          {
            question: input.question,
            scope: input.scope,
            draftAnswer: input.draftAnswer,
            evidence: input.evidence,
          },
          null,
          2,
        ),
      },
    ],
  };

  const timeout = withTimeoutSignal(options.timeoutMs);
  try {
    let content = '';
    try {
      content = await requestChatContent(options, bodyWithJsonFormat, timeout);
    } catch (error) {
      if (!shouldRetryWithoutResponseFormat(error)) {
        throw error;
      }
      const bodyWithoutJsonFormat = { ...bodyWithJsonFormat, response_format: undefined };
      content = await requestChatContent(options, bodyWithoutJsonFormat, timeout);
    }
    return toEnhanceOutput(input, safeParseJson(content ?? ''));
  } finally {
    timeout.cancel();
  }
}

async function callAnalysisCompletion(
  options: OpenAICompatibleAdapterOptions,
  input: LLMAnalysisInput,
): Promise<LLMAnalysisOutput> {
  const bodyWithJsonFormat = {
    model: options.model,
    temperature: Math.min(options.temperature, 0.35),
    max_tokens: 1400,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: ANALYSIS_SYSTEM_PROMPT },
      {
        role: 'user',
        content: JSON.stringify(input, null, 2),
      },
    ],
  };

  const timeout = withTimeoutSignal(options.timeoutMs);
  try {
    let content = '';
    try {
      content = await requestChatContent(options, bodyWithJsonFormat, timeout);
    } catch (error) {
      if (!shouldRetryWithoutResponseFormat(error)) {
        throw error;
      }
      const bodyWithoutJsonFormat = { ...bodyWithJsonFormat, response_format: undefined };
      content = await requestChatContent(options, bodyWithoutJsonFormat, timeout);
    }
    const parsedPayload = safeParseJson(content ?? '');
    const base = extractAnalysisBase(input, parsedPayload);
    let output: LLMAnalysisOutput;
    let shouldRunRewritePass = true;
    try {
      output = toAnalysisOutput(input, parsedPayload);
    } catch (error) {
      const baseMessage = error instanceof Error ? error.message : 'LLM 解析失败';
      try {
        const rewrittenTaskProposals = await callTaskProposalCompletion(
          options,
          input,
          base.completedTaskIds,
          base.diagnosisItems,
        );
        output = {
          diagnosisItems: base.diagnosisItems,
          prioritizedTaskIds: base.completedTaskIds,
          taskProposals: rewrittenTaskProposals,
        };
        shouldRunRewritePass = false;
      } catch (rewriteError) {
        const snippet = String(content ?? '')
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, 420);
        const rewriteMessage =
          rewriteError instanceof Error ? rewriteError.message : 'rewrite failed';
        throw new Error(`${baseMessage}; rewrite=${rewriteMessage}; raw=${snippet || 'empty'}`);
      }
    }

    if (shouldRunRewritePass) {
      try {
        const rewrittenTaskProposals = await callTaskProposalCompletion(
          options,
          input,
          output.prioritizedTaskIds,
          output.diagnosisItems,
        );
        output.taskProposals = rewrittenTaskProposals;
      } catch {
        // Keep first valid output when rewrite call fails.
      }
    }

    return output;
  } finally {
    timeout.cancel();
  }
}

async function callTaskProposalCompletion(
  options: OpenAICompatibleAdapterOptions,
  input: LLMAnalysisInput,
  prioritizedTaskIds: number[],
  diagnosisItems: DiagnosisItem[],
): Promise<LLMTaskProposal[]> {
  const prioritizedTopIds = prioritizedTaskIds.slice(0, 10);
  const prioritizedSet = new Set(prioritizedTopIds);
  const rewriteCatalog =
    prioritizedSet.size > 0
      ? input.taskCatalog.filter((task) => prioritizedSet.has(task.id))
      : input.taskCatalog.slice(0, 10);
  const effectiveCatalog = rewriteCatalog.length > 0 ? rewriteCatalog : input.taskCatalog.slice(0, 10);

  const bodyWithJsonFormat = {
    model: options.model,
    temperature: Math.min(Math.max(options.temperature, 0.15), 0.45),
    max_tokens: 1600,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: TASK_PROPOSAL_SYSTEM_PROMPT },
      {
        role: 'user',
        content: JSON.stringify(
          {
            targetUrl: input.targetUrl,
            pageSummary: input.pageSummary,
            diagnosisItems,
            prioritizedTaskIds,
            taskCatalog: effectiveCatalog,
          },
          null,
          2,
        ),
      },
    ],
  };

  const timeout = withTimeoutSignal(options.timeoutMs);
  try {
    let content = '';
    try {
      content = await requestChatContent(options, bodyWithJsonFormat, timeout);
    } catch (error) {
      if (!shouldRetryWithoutResponseFormat(error)) {
        throw error;
      }
      const bodyWithoutJsonFormat = { ...bodyWithJsonFormat, response_format: undefined };
      content = await requestChatContent(options, bodyWithoutJsonFormat, timeout);
    }

    const payload = safeParseJson(content ?? '');
    return normalizeTaskProposals(payload?.taskProposals, effectiveCatalog);
  } finally {
    timeout.cancel();
  }
}

async function callStageSummaryCompletion(
  options: OpenAICompatibleAdapterOptions,
  input: StageSummaryInput,
): Promise<string> {
  const bodyWithJsonFormat = {
    model: options.model,
    temperature: Math.min(Math.max(options.temperature, 0), 0.4),
    max_tokens: 160,
    messages: [
      { role: 'system', content: STAGE_SUMMARY_PROMPT },
      {
        role: 'user',
        content: JSON.stringify(input, null, 2),
      },
    ],
  };

  const timeout = withTimeoutSignal(options.timeoutMs);
  try {
    const content = await requestChatContent(options, bodyWithJsonFormat, timeout);
    const summary = String(content ?? '').replace(/\s+/g, ' ').trim();
    if (!summary) {
      throw new Error('empty stage summary');
    }
    return summary.slice(0, 220);
  } finally {
    timeout.cancel();
  }
}

function toSourcePayloadForLLM(input: {
  targetUrl: string;
  sourceBundle: LLMCrawlStageInput['sourceBundle'];
  packagedCode: LLMCrawlStageInput['packagedCode'];
}): Record<string, unknown> {
  const mainPreview = input.sourceBundle.mainDocument.content.slice(0, 2_000);
  return {
    targetUrl: input.targetUrl,
    sourceBundle: {
      targetUrl: input.sourceBundle.targetUrl,
      finalUrl: input.sourceBundle.finalUrl,
      stats: input.sourceBundle.stats,
      mainDocument: {
        artifactId: input.sourceBundle.mainDocument.artifactId,
        url: input.sourceBundle.mainDocument.url,
        type: input.sourceBundle.mainDocument.type,
        hash: input.sourceBundle.mainDocument.hash,
        bytes: input.sourceBundle.mainDocument.bytes,
        preview: mainPreview,
      },
      artifacts: input.sourceBundle.artifacts.map((artifact) => ({
        artifactId: artifact.artifactId,
        url: artifact.url,
        type: artifact.type,
        hash: artifact.hash,
        bytes: artifact.bytes,
        status: artifact.status,
      })),
    },
    packagedCode: input.packagedCode,
  };
}

async function callCrawlStageCompletion(
  options: OpenAICompatibleAdapterOptions,
  input: LLMCrawlStageInput,
): Promise<LLMStageResult<LLMCrawlStageOutput>> {
  return callStructuredStage<LLMCrawlStageOutput>({
    options,
    stage: 'crawl',
    schema: llmCrawlStageSchema,
    input: toSourcePayloadForLLM(input),
    systemPrompt: LLM_STAGE_PROMPTS.crawl,
    maxTokens: 1200,
  });
}

async function callStructureStageCompletion(
  options: OpenAICompatibleAdapterOptions,
  input: LLMStructureStageInput,
): Promise<LLMStageResult<LLMStructureStageOutput>> {
  return callStructuredStage<LLMStructureStageOutput>({
    options,
    stage: 'structure',
    schema: llmStructureStageSchema,
    input: {
      ...toSourcePayloadForLLM(input),
      crawl: input.crawl,
    },
    systemPrompt: LLM_STAGE_PROMPTS.structure,
    maxTokens: 2600,
  });
}

async function callRiskStageCompletion(
  options: OpenAICompatibleAdapterOptions,
  input: LLMRiskStageInput,
): Promise<LLMStageResult<LLMRiskStageOutput>> {
  return callStructuredStage<LLMRiskStageOutput>({
    options,
    stage: 'risk',
    schema: llmRiskStageSchema,
    input: {
      targetUrl: input.targetUrl,
      crawl: input.crawl,
      structure: input.structure,
      packagedStats: {
        chunkCount: input.packagedCode.chunkCount,
        artifactCount: input.packagedCode.artifactCount,
        totalBytes: input.packagedCode.totalBytes,
        totalTokenEstimate: input.packagedCode.totalTokenEstimate,
      },
      sourceStats: input.sourceBundle.stats,
    },
    systemPrompt: LLM_STAGE_PROMPTS.risk,
    maxTokens: 1800,
  });
}

async function callTaskStageCompletion(
  options: OpenAICompatibleAdapterOptions,
  input: LLMTaskStageInput,
): Promise<LLMStageResult<LLMTaskStageOutput>> {
  try {
    return await callStructuredStage<LLMTaskStageOutput>({
      options,
      stage: 'tasks',
      schema: llmTaskStageSchema,
      input: {
        targetUrl: input.targetUrl,
        crawl: input.crawl,
        structure: input.structure,
        risk: input.risk,
        taskCatalog: input.taskCatalog,
        allowedEvidenceRefIds: input.structure.pageSummary.allowedEvidenceRefIds,
        sourceStats: input.sourceBundle.stats,
      },
      systemPrompt: LLM_STAGE_PROMPTS.tasks,
      maxTokens: 2800,
    });
  } catch (error) {
    const message = getErrorText(error);
    if (!isSchemaStageErrorMessage(message)) {
      throw error;
    }

    const recovered = recoverLenientTaskStageOutput(
      extractStageErrorRawPayload(message),
      input.taskCatalog,
      input.structure.pageSummary.allowedEvidenceRefIds,
    );

    return {
      output: recovered.output,
      attempts: Math.max(1, (options.stageRetryCount ?? 2) + 1),
      repaired: true,
      degraded: true,
      quality: {
        autoFilledCount: recovered.quality.autoFilledCount,
        syntheticCount: recovered.quality.syntheticCount,
        rewrittenNameCount: recovered.quality.rewrittenNameCount,
      },
      rawSnippet: extractRawSnippet(message),
    };
  }
}

async function probeChatCompletion(options: OpenAICompatibleAdapterOptions): Promise<void> {
  const body = {
    model: options.model,
    temperature: 0,
    max_tokens: 5,
    messages: [
      { role: 'system', content: 'Reply with exactly: pong' },
      { role: 'user', content: 'ping' },
    ],
  };

  const timeout = withTimeoutSignal(options.timeoutMs);
  try {
    const response = await fetch(`${normalizeBaseUrl(options.baseUrl)}/chat/completions`, {
      method: 'POST',
      signal: timeout.signal,
      headers: {
        authorization: `Bearer ${options.apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`chat probe failed: HTTP ${response.status} ${text.slice(0, 180)}`);
    }
  } finally {
    timeout.cancel();
  }
}

export function createOpenAICompatibleAdapter(
  options: OpenAICompatibleAdapterOptions,
): LLMAdapter {
  const normalizedOptions: OpenAICompatibleAdapterOptions = {
    baseUrl: normalizeBaseUrl(options.baseUrl),
    apiKey: options.apiKey.trim(),
    model: options.model.trim(),
    timeoutMs: Math.max(2_000, options.timeoutMs),
    temperature: clamp(options.temperature, 0, 1),
    stageRetryCount: Math.max(0, options.stageRetryCount ?? 2),
    jsonRepairCount: Math.max(0, options.jsonRepairCount ?? 1),
  };

  return {
    kind: 'openai-compatible',
    async runCrawlStage(input: LLMCrawlStageInput): Promise<LLMStageResult<LLMCrawlStageOutput>> {
      return callCrawlStageCompletion(normalizedOptions, input);
    },
    async runStructureStage(input: LLMStructureStageInput): Promise<LLMStageResult<LLMStructureStageOutput>> {
      return callStructureStageCompletion(normalizedOptions, input);
    },
    async runRiskStage(input: LLMRiskStageInput): Promise<LLMStageResult<LLMRiskStageOutput>> {
      return callRiskStageCompletion(normalizedOptions, input);
    },
    async runTaskStage(input: LLMTaskStageInput): Promise<LLMStageResult<LLMTaskStageOutput>> {
      return callTaskStageCompletion(normalizedOptions, input);
    },
    async generateDiagnosisAndTasks(input: LLMAnalysisInput): Promise<LLMAnalysisOutput> {
      return callAnalysisCompletion(normalizedOptions, input);
    },
    async summarizeStage(input: StageSummaryInput): Promise<string> {
      return callStageSummaryCompletion(normalizedOptions, input);
    },
    async enhanceInference(input: LLMEnhanceInput): Promise<LLMEnhanceOutput> {
      return callChatCompletion(normalizedOptions, input);
    },
    getResponsibilities() {
      return [...RESPONSIBILITIES];
    },
    async healthCheck(probe = false): Promise<LLMHealthReport> {
      const checkedAt = new Date().toISOString();
      if (!normalizedOptions.apiKey || !normalizedOptions.model || !normalizedOptions.baseUrl) {
        return {
          provider: 'openai-compatible',
          model: normalizedOptions.model || 'unknown',
          configured: false,
          reachable: false,
          message: 'LLM 配置不完整，请检查 LLM_API_KEY / LLM_MODEL / LLM_API_BASE_URL。',
          checkedAt,
        };
      }

      if (!probe) {
        return {
          provider: 'openai-compatible',
          model: normalizedOptions.model,
          configured: true,
          reachable: false,
          message: '配置已加载。可使用 ?probe=1 执行真实连通性探测。',
          checkedAt,
        };
      }

      try {
        await probeChatCompletion(normalizedOptions);

        return {
          provider: 'openai-compatible',
          model: normalizedOptions.model,
          configured: true,
          reachable: true,
          message: '大模型 API 探测成功，可用于诊断任务生成与推断增强。',
          checkedAt,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'unknown error';
        return {
          provider: 'openai-compatible',
          model: normalizedOptions.model,
          configured: true,
          reachable: false,
          message: `探测异常: ${message}`,
          checkedAt,
        };
      }
    },
  };
}
