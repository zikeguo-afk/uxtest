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
  LLMPersonaGenerationInput,
  LLMPersonaGenerationOutput,
  LLMExecutionPlanInput,
  LLMExecutionPlanOutput,
  LLMStepDecisionInput,
  LLMStepDecisionOutput,
} from '../types/domain';
import {
  llmCrawlStageSchema,
  llmRiskStageSchema,
  llmStructureStageSchema,
  llmTaskStageLenientSchema,
} from './stage-schemas';
import { LLM_STAGE_PROMPTS } from './prompts/diagnosis-stages';
import { loadPromptFromEnv } from './prompt-loader';
import { EXECUTION_PLANNER_SYSTEM_PROMPT } from './prompts/execution-planner';
import { STEP_POLICY_SYSTEM_PROMPT } from './prompts/step-policy';

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
  '14) 先识别页面功能集合，再映射任务；步骤必须体现“访问入口->执行操作->确认成功”。',
  '15) task name 必须是中文“目标结果名”，优先使用页面可见词，示例：“完成首次页面加载”“保存并导出草图”“查看分析结果”。',
  '16) 严禁技术实现命名：不要出现 React/Zustand/Client-side Rendering/DOM/API/JSON/Hook/Route/State Management 等词，除非它们是页面可见产品词。',
  '17) 若个别字段信息不足，可基于页面上下文做合理补全，但不要留空字段。',
  '18) 返回 JSON：{"diagnosisItems":[...],"prioritizedTaskIds":[...],"taskProposals":[{"id":1,"name":"完成首次页面加载","description":"...","difficulty":"中等","estimatedDuration":"8-12分钟","testScenario":"...","operationSteps":["进入功能入口","完成关键操作","确认结果反馈"],"successCriteria":["...","..."],"tags":["..."],"evidenceRefs":["interaction:button-1"],"evidenceReason":"..."}]}。',
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
  '9) task name 必须是中文“目标结果名”（如“完成首次页面加载”“保存并导出草图”），禁止“用户完成”前缀与技术实现命名。',
  '10) 仅保留页面可见产品词；不要出现 React/Zustand/Client-side Rendering/DOM/API/JSON/Hook/Route 等实现术语。',
  '11) 操作步骤必须体现“访问入口->执行操作->确认成功”。',
  '12) 若个别字段缺失，请按用户操作语境补全，不要留空。',
  '13) 返回 JSON：{"taskProposals":[{"id":1,"name":"保存并导出草图","description":"...","difficulty":"中等","estimatedDuration":"8-12分钟","testScenario":"...","operationSteps":["进入导出入口","执行导出操作","确认文件可用"],"successCriteria":["...","..."],"tags":["..."],"evidenceRefs":["interaction:button-1"],"evidenceReason":"..."}]}。',
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
const CODE_JARGON_HINTS = [
  'api',
  'sdk',
  'dom',
  'json',
  'schema',
  'script',
  'route',
  'hook',
  'react',
  'zustand',
  'client-side rendering',
  'state management',
  'graph visualization',
  'simulation',
  'application',
  '接口',
  '脚本',
  '代码',
  '路由',
  '渲染',
  '状态管理',
  '图可视化',
];
const RESULT_PREFIX_HINTS = ['完成', '确认', '查看', '保存', '导出', '恢复', '提交', '切换', '创建', '进入', '开始', '继续', '找到'];
const TASK_NAME_REWRITE_RULES: Array<{ pattern: RegExp; replacement: string }> = [
  { pattern: /client[-\s]?side rendering/giu, replacement: '页面加载' },
  { pattern: /state management/giu, replacement: '状态设置' },
  { pattern: /graph visualization/giu, replacement: '图形视图' },
  { pattern: /image generation simulation/giu, replacement: '图片生成' },
  { pattern: /application/giu, replacement: '页面' },
  { pattern: /simulation/giu, replacement: '操作' },
  { pattern: /react/giu, replacement: '' },
  { pattern: /zustand/giu, replacement: '' },
  { pattern: /api|dom|json|schema|script|route|hook|sdk/giu, replacement: '' },
  { pattern: /接口|脚本|代码|路由|组件|函数/gu, replacement: '' },
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

function toVisibleTokens(text: string): string[] {
  const source = text.trim();
  if (!source) {
    return [];
  }

  const chinese = source.match(/[\u4e00-\u9fff]{2,}/g) ?? [];
  const english = source.match(/[a-z][a-z0-9-]{1,}/gi) ?? [];
  return [...chinese, ...english, source];
}

function buildVisibleTermSet(input: {
  title?: string;
  headingsText?: string[];
  primaryButtons?: string[];
  primaryLinks?: string[];
  primaryInputs?: string[];
}): Set<string> {
  const visible = new Set<string>();
  const feed = [
    input.title ?? '',
    ...(input.headingsText ?? []),
    ...(input.primaryButtons ?? []),
    ...(input.primaryLinks ?? []),
    ...(input.primaryInputs ?? []),
  ];

  for (const text of feed) {
    for (const token of toVisibleTokens(String(text))) {
      const normalized = token.trim().toLowerCase();
      if (normalized) {
        visible.add(normalized);
      }
    }
  }

  return visible;
}

function isVisibleTermAllowed(token: string, visibleTermSet: Set<string>): boolean {
  const normalized = token.trim().toLowerCase();
  if (!normalized) {
    return false;
  }
  if (visibleTermSet.has(normalized)) {
    return true;
  }

  const parts = normalized.split(/[\s:/_-]+/g).filter(Boolean);
  if (parts.length === 0) {
    return false;
  }
  return parts.every((part) => visibleTermSet.has(part));
}

function replaceNameJargon(
  value: string,
  visibleTermSet: Set<string>,
): { normalized: string; jargonRejectedCount: number } {
  let normalized = value;
  let jargonRejectedCount = 0;

  for (const rule of TASK_NAME_REWRITE_RULES) {
    normalized = normalized.replace(rule.pattern, (matched) => {
      if (isVisibleTermAllowed(matched, visibleTermSet)) {
        return matched;
      }
      jargonRejectedCount += 1;
      return rule.replacement;
    });
  }

  return {
    normalized,
    jargonRejectedCount,
  };
}

function normalizeNameText(value: string): string {
  return value
    .replace(/^用户任务\d+[:：]?\s*/u, '')
    .replace(/^用户(?:进行|执行|完成)?/u, '')
    .replace(/^(执行|进行|实现)/u, '')
    .replace(/(流程|步骤|操作路径|任务流程)$/u, '')
    .replace(/[【】[\]{}()（）<>]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function hasCodeJargon(value: string, visibleTermSet: Set<string>): boolean {
  const normalized = value.trim().toLowerCase();
  return CODE_JARGON_HINTS.some(
    (hint) => normalized.includes(hint.toLowerCase()) && !isVisibleTermAllowed(hint, visibleTermSet),
  );
}

function ensureResultNameStyle(value: string): string {
  const normalized = value.trim();
  if (!normalized) {
    return '完成关键操作并确认结果';
  }
  if (RESULT_PREFIX_HINTS.some((prefix) => normalized.startsWith(prefix))) {
    return normalized;
  }
  return `完成${normalized}`;
}

function extractReadableCoreFromHints(
  fallbackName: string,
  hints: {
    description?: string;
    testScenario?: string;
    operationSteps?: string[];
    successCriteria?: string[];
  },
): string {
  const candidates = [
    ...(hints.successCriteria ?? []),
    ...(hints.operationSteps ?? []).slice(-2),
    hints.testScenario ?? '',
    hints.description ?? '',
    fallbackName,
  ]
    .map((item) => normalizeNameText(String(item ?? '')))
    .filter((item) => item.length > 0);

  for (const candidate of candidates) {
    const picked = candidate
      .replace(/^(?:请|需|需要|用户|在|将)/u, '')
      .replace(/(?:成功|能够|可以|是否|并验证|并确认|验证|检查)$/u, '')
      .trim();
    if (picked.length >= 4 && containsChineseText(picked)) {
      return picked;
    }
  }

  return '关键操作并确认结果';
}

function isReadableTaskName(value: string, visibleTermSet: Set<string>): boolean {
  if (!containsChineseText(value)) {
    return false;
  }
  if (hasCodeJargon(value, visibleTermSet)) {
    return false;
  }
  if (/(执行.+流程|application|simulation|state management)/iu.test(value)) {
    return false;
  }
  return value.trim().length >= 4;
}

function sanitizeTaskName(
  inputName: string,
  fallbackName: string,
  options: {
    visibleTermSet: Set<string>;
    description?: string;
    testScenario?: string;
    operationSteps?: string[];
    successCriteria?: string[];
  },
): { name: string; rewritten: boolean; jargonRejectedCount: number; readable: boolean } {
  const source = normalizeNameText(inputName);
  const fallback = normalizeNameText(fallbackName) || '关键操作并确认结果';
  const preferred = source || fallback;
  const firstPass = replaceNameJargon(preferred, options.visibleTermSet);
  let candidate = ensureResultNameStyle(normalizeNameText(firstPass.normalized));

  if (!isReadableTaskName(candidate, options.visibleTermSet)) {
    const readableCore = extractReadableCoreFromHints(fallback, options);
    const secondPass = replaceNameJargon(readableCore, options.visibleTermSet);
    candidate = ensureResultNameStyle(normalizeNameText(secondPass.normalized));
    return {
      name: candidate || '完成关键操作并确认结果',
      rewritten: candidate !== inputName.trim(),
      jargonRejectedCount: firstPass.jargonRejectedCount + secondPass.jargonRejectedCount,
      readable: isReadableTaskName(candidate, options.visibleTermSet),
    };
  }

  return {
    name: candidate,
    rewritten: candidate !== inputName.trim(),
    jargonRejectedCount: firstPass.jargonRejectedCount,
    readable: isReadableTaskName(candidate, options.visibleTermSet),
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
  llmCompletionPasses: number;
  llmGeneratedCount: number;
  nonLlmGeneratedCount: number;
  nameRewrittenCount: number;
  nameReadableCount: number;
  namePolishPasses: number;
  nameJargonRejectedCount: number;
}

interface LenientTaskRecoveryResult {
  summary: string;
  prioritizedTaskIds: number[];
  taskProposals: LLMTaskProposal[];
  missingTaskCount: number;
  missingFieldMap: Array<{ id: number; missingFields: string[] }>;
  quality: LenientRecoveryQuality;
}

function recoverLenientTaskStageOutput(
  rawText: string,
  fallbackCatalog: LLMAnalysisInput['taskCatalog'],
  allowedEvidenceRefIds: string[],
  visibleTermSet: Set<string>,
): LenientTaskRecoveryResult {
  const parsed = safeParseJson(rawText ?? '');
  const catalog = fallbackCatalog.slice(0, REQUIRED_TASK_PROPOSAL_COUNT);
  const catalogIds = catalog.map((item) => item.id);
  const allowedEvidenceSet = new Set(allowedEvidenceRefIds);
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
    llmCompletionPasses: 0,
    llmGeneratedCount: 0,
    nonLlmGeneratedCount: 0,
    nameRewrittenCount: 0,
    nameReadableCount: 0,
    namePolishPasses: 1,
    nameJargonRejectedCount: 0,
  };

  const recovered: LLMTaskProposal[] = [];
  const missingFieldMap: Array<{ id: number; missingFields: string[] }> = [];

  let orderCursor = 0;
  const seen = new Set<number>();
  for (const task of catalog) {
    const rawItem = rawById.get(task.id) ?? rawByOrder[orderCursor];
    if (!rawById.has(task.id) && rawItem) {
      orderCursor += 1;
    }
    if (!rawItem || seen.has(task.id)) {
      continue;
    }
    seen.add(task.id);

    const rawName = String(
      pickObjectField(rawItem ?? {}, ['name', 'title']) ?? '',
    );
    const { name, rewritten, readable, jargonRejectedCount } = sanitizeTaskName(rawName, task.name, {
      visibleTermSet,
      description: String(
        pickObjectField(rawItem ?? {}, ['description', 'desc']) ?? task.description,
      ),
      testScenario: String(
        pickObjectField(rawItem ?? {}, ['testScenario', 'test_scenario', 'scenario', 'context']) ?? '',
      ),
      operationSteps: normalizeStringList(
        pickObjectField(rawItem ?? {}, ['operationSteps', 'operation_steps', 'steps', 'stepList']),
        12,
      ),
      successCriteria: normalizeStringList(
        pickObjectField(rawItem ?? {}, ['successCriteria', 'success_criteria', 'criteria', 'acceptanceCriteria']),
        10,
      ),
    });
    if (rewritten) {
      quality.rewrittenNameCount += 1;
      quality.nameRewrittenCount += 1;
    }
    if (readable) {
      quality.nameReadableCount += 1;
    }
    quality.nameJargonRejectedCount += jargonRejectedCount;

    const descriptionRaw = String(
      pickObjectField(rawItem ?? {}, ['description', 'desc']) ?? '',
    ).trim();
    const description = descriptionRaw || task.description;

    const estimatedDurationRaw = String(
      pickObjectField(rawItem ?? {}, ['estimatedDuration', 'estimated_duration', 'duration']) ?? '',
    ).trim();
    const estimatedDuration = estimatedDurationRaw || undefined;

    const testScenarioRaw = String(
      pickObjectField(rawItem ?? {}, ['testScenario', 'test_scenario', 'scenario', 'context']) ?? '',
    ).trim();
    const rawOperationSteps = normalizeStringList(
      pickObjectField(rawItem ?? {}, ['operationSteps', 'operation_steps', 'steps', 'stepList']),
      12,
    );
    const rawSuccessCriteria = normalizeStringList(
      pickObjectField(rawItem ?? {}, ['successCriteria', 'success_criteria', 'criteria', 'acceptanceCriteria']),
      10,
    );

    const tagsRaw = normalizeStringList(
      pickObjectField(rawItem ?? {}, ['tags', 'labels']),
      8,
    );
    const tags = tagsRaw.length > 0 ? tagsRaw : undefined;

    const refsRaw = normalizeStringList(
      pickObjectField(rawItem ?? {}, ['evidenceRefs', 'evidence_refs', 'refs', 'evidence']),
      6,
    ).filter((refId) => allowedEvidenceSet.has(refId));
    const refs = refsRaw.length > 0 ? refsRaw : undefined;

    const evidenceReasonRaw = String(
      pickObjectField(rawItem ?? {}, ['evidenceReason', 'evidence_reason', 'reason']) ?? '',
    ).trim();
    const evidenceReason = evidenceReasonRaw || undefined;

    const proposal: LLMTaskProposal = {
      id: task.id,
      name,
      description,
      difficulty: normalizeDifficulty(pickObjectField(rawItem ?? {}, ['difficulty', 'level'])),
      estimatedDuration,
      testScenario: testScenarioRaw || undefined,
      operationSteps: rawOperationSteps.length > 0 ? rawOperationSteps : undefined,
      successCriteria: rawSuccessCriteria.length > 0 ? rawSuccessCriteria : undefined,
      tags,
      evidenceRefs: refs,
      evidenceReason,
    };

    const missingFields: string[] = [];
    if (!proposal.testScenario) {
      missingFields.push('testScenario');
    }
    if ((proposal.operationSteps?.length ?? 0) < 3) {
      missingFields.push('operationSteps');
    }
    if ((proposal.successCriteria?.length ?? 0) < 2) {
      missingFields.push('successCriteria');
    }
    if ((proposal.evidenceRefs?.length ?? 0) < 1) {
      missingFields.push('evidenceRefs');
    }
    if (!proposal.evidenceReason) {
      missingFields.push('evidenceReason');
    }
    if (missingFields.length > 0) {
      missingFieldMap.push({ id: task.id, missingFields });
    }

    recovered.push(proposal);
  }

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
  ].slice(0, Math.max(recovered.length, 1));

  const summaryRaw = String(
    pickFirstPath(parsed, [['summary'], ['result', 'summary'], ['data', 'summary']]) ?? '',
  ).trim();

  quality.llmGeneratedCount = recovered.length;

  return {
    summary: summaryRaw || '首轮任务解析完成，等待补全。',
    prioritizedTaskIds: completedPriority.length > 0 ? completedPriority : recovered.map((task) => task.id),
    taskProposals: recovered,
    missingTaskCount: Math.max(0, REQUIRED_TASK_PROPOSAL_COUNT - recovered.length),
    missingFieldMap,
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
  const visibleTermSet = buildVisibleTermSet(input.pageSummary);
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

    output.taskProposals = polishReadableTaskProposals(
      output.taskProposals,
      input.taskCatalog,
      visibleTermSet,
    );

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

async function callJsonObjectCompletion(
  options: OpenAICompatibleAdapterOptions,
  systemPrompt: string,
  input: unknown,
  maxTokens: number,
  temperature: number,
): Promise<Record<string, unknown>> {
  const body = {
    model: options.model,
    temperature: Math.min(Math.max(temperature, 0), 0.7),
    max_tokens: maxTokens,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content: JSON.stringify(input, null, 2),
      },
    ],
  };

  const timeout = withTimeoutSignal(options.timeoutMs);
  try {
    const content = await requestChatContent(options, body, timeout);
    const parsed = safeParseJson(content);
    if (!parsed) {
      throw new Error(`llm json parse failed: ${extractRawSnippet(content)}`);
    }
    return parsed;
  } finally {
    timeout.cancel();
  }
}

function toTraitProfile(raw: unknown, fallback: LLMPersonaGenerationInput['baseTraits']) {
  if (!raw || typeof raw !== 'object') {
    return fallback;
  }
  const source = raw as Record<string, unknown>;
  const toNumber = (value: unknown, defaultValue: number) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
      return defaultValue;
    }
    return clamp(Math.round(parsed), 0, 100);
  };
  return {
    patience: toNumber(source.patience, fallback.patience),
    techSavvy: toNumber(source.techSavvy, fallback.techSavvy),
    attention: toNumber(source.attention, fallback.attention),
  };
}

async function callPersonaGenerationCompletion(
  options: OpenAICompatibleAdapterOptions,
  input: LLMPersonaGenerationInput,
): Promise<LLMPersonaGenerationOutput> {
  const prompt = [
    '你是 UXAgent 的人设生成器。',
    '输入是一个用户类别模板和人数，请生成同类但有微小差异的个体档案。',
    '必须输出 JSON：{"profiles":[{"persona":"...","goal":"...","behaviorBias":"...","languageStyle":"...","frictionSensitivity":45,"traits":{"patience":50,"techSavvy":60,"attention":70}}]}',
    '要求：',
    '1) profiles 数量必须等于 count。',
    '2) traits 数值在 0-100。',
    '3) 文案中文，避免空字段。',
  ].join('\n');
  const payload = await callJsonObjectCompletion(options, prompt, input, 1400, 0.35);
  const profilesRaw = Array.isArray(payload.profiles) ? payload.profiles : [];
  const profiles = profilesRaw.slice(0, input.count).map((item, index) => {
    const source = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>;
    return {
      persona: String(source.persona ?? `${input.categoryPersona}（样本${index + 1}）`).trim() || `${input.categoryPersona}（样本${index + 1}）`,
      goal: String(source.goal ?? input.categoryGoal).trim() || input.categoryGoal,
      behaviorBias: String(source.behaviorBias ?? '平衡效率与准确').trim() || '平衡效率与准确',
      languageStyle: String(source.languageStyle ?? '简洁').trim() || '简洁',
      frictionSensitivity: clamp(Number(source.frictionSensitivity ?? 50), 0, 100),
      traits: toTraitProfile(source.traits, input.baseTraits),
    };
  });

  if (profiles.length < input.count) {
    while (profiles.length < input.count) {
      profiles.push({
        persona: `${input.categoryPersona}（补齐样本${profiles.length + 1}）`,
        goal: input.categoryGoal,
        behaviorBias: '平衡效率与准确',
        languageStyle: '简洁',
        frictionSensitivity: 50,
        traits: { ...input.baseTraits },
      });
    }
  }

  return { profiles };
}

async function callExecutionPlanCompletion(
  options: OpenAICompatibleAdapterOptions,
  input: LLMExecutionPlanInput,
): Promise<LLMExecutionPlanOutput> {
  const payload = await callJsonObjectCompletion(
    options,
    EXECUTION_PLANNER_SYSTEM_PROMPT,
    input,
    1200,
    0.25,
  );

  const plannedStepsRaw = Array.isArray(payload.plannedSteps) ? payload.plannedSteps : [];
  const plannedSteps = plannedStepsRaw
    .map((item) => String(item ?? '').trim())
    .filter((item) => item.length > 0)
    .slice(0, 8);

  return {
    summary: String(payload.summary ?? '').trim() || `规划任务：${input.task.name}`,
    plannedSteps:
      plannedSteps.length >= 3
        ? plannedSteps
        : (input.task.operationSteps && input.task.operationSteps.length >= 3
          ? input.task.operationSteps.slice(0, 6)
          : ['进入任务入口', '执行关键操作', '确认结果反馈']),
  };
}

async function callStepDecisionCompletion(
  options: OpenAICompatibleAdapterOptions,
  input: LLMStepDecisionInput,
): Promise<LLMStepDecisionOutput> {
  const payload = await callJsonObjectCompletion(
    options,
    STEP_POLICY_SYSTEM_PROMPT,
    input,
    1000,
    0.2,
  );
  const actionRaw = payload.action;
  if (!actionRaw || typeof actionRaw !== 'object') {
    return {
      action: {
        type: 'wait',
        waitMs: 900,
        reason: 'LLM 未返回有效 action，先等待页面稳定',
      },
    };
  }

  const action = actionRaw as Record<string, unknown>;
  const type = String(action.type ?? '').trim();
  const allowedTypes = new Set(['click', 'type', 'select', 'wait', 'scroll', 'assert', 'finish', 'fail']);
  if (!allowedTypes.has(type)) {
    return {
      action: {
        type: 'wait',
        waitMs: 900,
        reason: 'LLM action type 非法，先等待页面稳定',
      },
    };
  }

  return {
    action: {
      type: type as LLMStepDecisionOutput['action']['type'],
      selector: action.selector ? String(action.selector) : undefined,
      text: action.text ? String(action.text) : undefined,
      optionValue: action.optionValue ? String(action.optionValue) : undefined,
      waitMs: action.waitMs ? clamp(Number(action.waitMs), 100, 20_000) : undefined,
      direction: action.direction === 'up' ? 'up' : action.direction === 'down' ? 'down' : undefined,
      expected: action.expected ? String(action.expected) : undefined,
      reason: action.reason ? String(action.reason) : undefined,
    },
  };
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

function collectTaskMissingFields(task: LLMTaskProposal): string[] {
  const missing: string[] = [];
  if (!task.name || !String(task.name).trim()) {
    missing.push('name');
  }
  if (!task.description || !String(task.description).trim()) {
    missing.push('description');
  }
  if (!task.testScenario || !String(task.testScenario).trim()) {
    missing.push('testScenario');
  }
  if ((task.operationSteps?.length ?? 0) < 3) {
    missing.push('operationSteps');
  }
  if ((task.successCriteria?.length ?? 0) < 2) {
    missing.push('successCriteria');
  }
  if ((task.evidenceRefs?.length ?? 0) < 1) {
    missing.push('evidenceRefs');
  }
  if (!task.evidenceReason || !String(task.evidenceReason).trim()) {
    missing.push('evidenceReason');
  }
  return missing;
}

function collectMissingFieldMap(
  proposals: LLMTaskProposal[],
): Array<{ id: number; missingFields: string[] }> {
  const rows: Array<{ id: number; missingFields: string[] }> = [];
  for (const proposal of proposals) {
    const missingFields = collectTaskMissingFields(proposal);
    if (missingFields.length > 0) {
      rows.push({ id: proposal.id, missingFields });
    }
  }
  return rows;
}

function normalizeTaskNameKey(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[\s\p{P}\p{S}]+/gu, '');
}

function scoreTaskCompleteness(task: LLMTaskProposal): number {
  let score = 0;
  if (task.name?.trim()) {
    score += 2;
  }
  if (task.description?.trim()) {
    score += 2;
  }
  if (task.testScenario?.trim()) {
    score += 2;
  }
  score += Math.min(4, task.operationSteps?.length ?? 0);
  score += Math.min(3, task.successCriteria?.length ?? 0);
  score += Math.min(2, task.evidenceRefs?.length ?? 0);
  if (task.evidenceReason?.trim()) {
    score += 2;
  }
  return score;
}

function mergeLlmTaskProposals(
  primary: LLMTaskProposal[],
  completion: LLMTaskProposal[],
): LLMTaskProposal[] {
  const order: string[] = [];
  const store = new Map<string, { task: LLMTaskProposal; score: number }>();

  const upsert = (task: LLMTaskProposal) => {
    const key = normalizeTaskNameKey(task.name) || `id:${task.id}`;
    const score = scoreTaskCompleteness(task);
    const existing = store.get(key);
    if (!existing) {
      store.set(key, { task, score });
      order.push(key);
      return;
    }
    if (score > existing.score) {
      store.set(key, { task, score });
    }
  };

  for (const task of primary) {
    upsert(task);
  }
  for (const task of completion) {
    upsert(task);
  }

  return order.map((key) => store.get(key)?.task).filter((item): item is LLMTaskProposal => Boolean(item));
}

function normalizeTaskStageOutput(
  output: Partial<LLMTaskStageOutput> | null,
  taskCatalog: LLMAnalysisInput['taskCatalog'],
): LLMTaskStageOutput {
  const proposals = Array.isArray(output?.taskProposals) ? output?.taskProposals : [];
  const normalizedProposals: LLMTaskProposal[] = proposals
    .filter((item) => item && typeof item === 'object')
    .map((item) => {
      const raw = item as Partial<LLMTaskProposal> & Record<string, unknown>;
      return {
        id: typeof raw.id === 'number' ? raw.id : taskCatalog[0]?.id ?? 1,
        name: typeof raw.name === 'string' ? raw.name.trim() : '',
        description: typeof raw.description === 'string' ? raw.description.trim() : '',
        difficulty: normalizeDifficulty(raw.difficulty),
        estimatedDuration: typeof raw.estimatedDuration === 'string' ? raw.estimatedDuration.trim() : undefined,
        testScenario: typeof raw.testScenario === 'string' ? raw.testScenario.trim() : undefined,
        operationSteps: normalizeStringList(raw.operationSteps, 12),
        successCriteria: normalizeStringList(raw.successCriteria, 10),
        tags: normalizeStringList(raw.tags, 8),
        evidenceRefs: normalizeStringList(raw.evidenceRefs, 6),
        evidenceReason: typeof raw.evidenceReason === 'string' ? raw.evidenceReason.trim() : undefined,
      };
    });

  const summary =
    typeof output?.summary === 'string' && output.summary.trim().length > 0
      ? output.summary.trim()
      : '任务生成完成';
  const prioritizedTaskIds =
    Array.isArray(output?.prioritizedTaskIds) && output.prioritizedTaskIds.length > 0
      ? output.prioritizedTaskIds
      : normalizedProposals.map((task) => task.id);

  return {
    summary,
    prioritizedTaskIds,
    taskProposals: normalizedProposals,
  };
}

function polishReadableTaskProposals(
  taskProposals: LLMTaskProposal[],
  fallbackCatalog: LLMAnalysisInput['taskCatalog'],
  visibleTermSet: Set<string>,
): LLMTaskProposal[] {
  const fallbackNameById = new Map(fallbackCatalog.map((item) => [item.id, item.name]));
  return taskProposals.map((proposal) => {
    const fallbackName = fallbackNameById.get(proposal.id) ?? proposal.name;
    const normalized = sanitizeTaskName(proposal.name, fallbackName, {
      visibleTermSet,
      description: proposal.description,
      testScenario: proposal.testScenario,
      operationSteps: proposal.operationSteps,
      successCriteria: proposal.successCriteria,
    });
    return {
      ...proposal,
      name: normalized.name,
    };
  });
}

async function callTaskCompletionPass(
  options: OpenAICompatibleAdapterOptions,
  input: LLMTaskStageInput,
  existingTaskProposals: LLMTaskProposal[],
  missingFieldMap: Array<{ id: number; missingFields: string[] }>,
  missingTaskCount: number,
): Promise<LLMStageResult<LLMTaskStageOutput>> {
  return callStructuredStage<LLMTaskStageOutput>({
    options,
    stage: 'tasks',
    schema: llmTaskStageLenientSchema,
    input: {
      targetUrl: input.targetUrl,
      crawl: input.crawl,
      structure: input.structure,
      risk: input.risk,
      taskCatalog: input.taskCatalog,
      allowedEvidenceRefIds: input.structure.pageSummary.allowedEvidenceRefIds,
      sourceStats: input.sourceBundle.stats,
      existingTaskProposals,
      missingFieldMap,
      missingTaskCount,
      requiredTaskCount: REQUIRED_TASK_PROPOSAL_COUNT,
    },
    systemPrompt: LLM_STAGE_PROMPTS.tasksCompletion,
    maxTokens: 3200,
  });
}

async function callTaskStageCompletion(
  options: OpenAICompatibleAdapterOptions,
  input: LLMTaskStageInput,
): Promise<LLMStageResult<LLMTaskStageOutput>> {
  const visibleTermSet = buildVisibleTermSet(input.structure.pageSummary);
  const stageInput = {
    targetUrl: input.targetUrl,
    crawl: input.crawl,
    structure: input.structure,
    risk: input.risk,
    taskCatalog: input.taskCatalog,
    allowedEvidenceRefIds: input.structure.pageSummary.allowedEvidenceRefIds,
    sourceStats: input.sourceBundle.stats,
  };

  let primaryResult: LLMStageResult<LLMTaskStageOutput> | null = null;
  let recovered: LenientTaskRecoveryResult | null = null;
  let primaryErrorMessage = '';

  try {
    primaryResult = await callStructuredStage<LLMTaskStageOutput>({
      options,
      stage: 'tasks',
      schema: llmTaskStageLenientSchema,
      input: stageInput,
      systemPrompt: LLM_STAGE_PROMPTS.tasks,
      maxTokens: 2800,
    });
  } catch (error) {
    primaryErrorMessage = getErrorText(error);
    if (!isSchemaStageErrorMessage(primaryErrorMessage)) {
      throw error;
    }
    recovered = recoverLenientTaskStageOutput(
      extractStageErrorRawPayload(primaryErrorMessage),
      input.taskCatalog,
      input.structure.pageSummary.allowedEvidenceRefIds,
      visibleTermSet,
    );
  }

  const primaryOutput: LLMTaskStageOutput | null = primaryResult
    ? normalizeTaskStageOutput(primaryResult.output, input.taskCatalog)
    : recovered
      ? normalizeTaskStageOutput(
          {
            summary: recovered.summary,
            prioritizedTaskIds: recovered.prioritizedTaskIds,
            taskProposals: recovered.taskProposals,
          },
          input.taskCatalog,
        )
      : null;

  if (!primaryOutput) {
    throw new Error(primaryErrorMessage || 'STAGE_SCHEMA_INVALID:tasks:primary empty');
  }

  const missingFieldMap = recovered
    ? recovered.missingFieldMap
    : collectMissingFieldMap(primaryOutput.taskProposals);
  const missingTaskCount = Math.max(0, REQUIRED_TASK_PROPOSAL_COUNT - primaryOutput.taskProposals.length);
  const needsCompletionPass =
    Boolean(recovered) || missingTaskCount > 0 || missingFieldMap.length > 0;

  const fallbackNameById = new Map(input.taskCatalog.map((task) => [task.id, task.name]));
  const finalizeNames = (tasks: LLMTaskProposal[]) => {
    let rewrittenNameCount = 0;
    let nameReadableCount = 0;
    let nameJargonRejectedCount = 0;
    const normalized = tasks.map((task) => {
      const fallbackName = fallbackNameById.get(task.id) ?? task.name;
      const renamed = sanitizeTaskName(task.name, fallbackName, {
        visibleTermSet,
        description: task.description,
        testScenario: task.testScenario,
        operationSteps: task.operationSteps,
        successCriteria: task.successCriteria,
      });
      if (renamed.rewritten || renamed.name !== task.name) {
        rewrittenNameCount += 1;
      }
      if (renamed.readable) {
        nameReadableCount += 1;
      }
      nameJargonRejectedCount += renamed.jargonRejectedCount;
      return {
        ...task,
        name: renamed.name,
      };
    });
    return { normalized, rewrittenNameCount, nameReadableCount, nameJargonRejectedCount };
  };

  if (!needsCompletionPass) {
    const finalTasks = primaryOutput.taskProposals.slice(0, REQUIRED_TASK_PROPOSAL_COUNT);
    if (finalTasks.length < REQUIRED_TASK_PROPOSAL_COUNT) {
      throw new Error(
        `STAGE_SCHEMA_INVALID:tasks:LLM 任务数量不足（${finalTasks.length}/${REQUIRED_TASK_PROPOSAL_COUNT}）`,
      );
    }
    const finalized = finalizeNames(finalTasks);
    return {
      output: {
        summary: primaryOutput.summary,
        prioritizedTaskIds: primaryOutput.prioritizedTaskIds.slice(0, REQUIRED_TASK_PROPOSAL_COUNT),
        taskProposals: finalized.normalized,
      },
      attempts: primaryResult?.attempts ?? Math.max(1, (options.stageRetryCount ?? 2) + 1),
      repaired: primaryResult?.repaired ?? false,
      rawSnippet: primaryResult?.rawSnippet ?? extractRawSnippet(primaryErrorMessage),
      degraded: finalized.rewrittenNameCount > 0,
      quality: {
        autoFilledCount: 0,
        syntheticCount: 0,
        rewrittenNameCount: finalized.rewrittenNameCount,
        nameRewrittenCount: finalized.rewrittenNameCount,
        nameReadableCount: finalized.nameReadableCount,
        namePolishPasses: 1,
        nameJargonRejectedCount: finalized.nameJargonRejectedCount,
        llmCompletionPasses: 0,
        llmGeneratedCount: finalized.normalized.length,
        nonLlmGeneratedCount: 0,
      },
    };
  }

  let completionResult: LLMStageResult<LLMTaskStageOutput> | null = null;
  try {
    completionResult = await callTaskCompletionPass(
      options,
      input,
      primaryOutput.taskProposals,
      missingFieldMap,
      missingTaskCount,
    );
  } catch {
    completionResult = null;
  }

  const completionOutput = completionResult
    ? normalizeTaskStageOutput(completionResult.output, input.taskCatalog)
    : null;

  const mergedTasks = mergeLlmTaskProposals(
    primaryOutput.taskProposals,
    completionOutput?.taskProposals ?? [],
  )
    .filter((task) => collectTaskMissingFields(task).length === 0)
    .slice(0, REQUIRED_TASK_PROPOSAL_COUNT);

  if (mergedTasks.length < REQUIRED_TASK_PROPOSAL_COUNT) {
    if (!completionResult) {
      throw new Error(
        `STAGE_SCHEMA_INVALID:tasks:LLM completion 解析失败，任务数量不足（${mergedTasks.length}/${REQUIRED_TASK_PROPOSAL_COUNT}）`,
      );
    }
    throw new Error(
      `STAGE_SCHEMA_INVALID:tasks:LLM completion 任务数量不足（${mergedTasks.length}/${REQUIRED_TASK_PROPOSAL_COUNT}）`,
    );
  }

  const mergedPrioritizedTaskIds = [
    ...new Set([
      ...(completionOutput?.prioritizedTaskIds ?? []),
      ...primaryOutput.prioritizedTaskIds,
    ]),
  ].slice(0, REQUIRED_TASK_PROPOSAL_COUNT);

  const finalized = finalizeNames(mergedTasks);

  return {
    output: {
      summary: [primaryOutput.summary, completionOutput?.summary].filter(Boolean).join('；'),
      prioritizedTaskIds:
        mergedPrioritizedTaskIds.length > 0
          ? mergedPrioritizedTaskIds
          : finalized.normalized.map((task) => task.id),
      taskProposals: finalized.normalized,
    },
    attempts:
      (primaryResult?.attempts ?? Math.max(1, (options.stageRetryCount ?? 2) + 1)) +
      (completionResult?.attempts ?? 1),
    repaired: Boolean(primaryResult?.repaired) || Boolean(completionResult?.repaired) || Boolean(recovered),
    rawSnippet: completionResult?.rawSnippet ?? primaryResult?.rawSnippet ?? extractRawSnippet(primaryErrorMessage),
    degraded: true,
    quality: {
      autoFilledCount: 0,
      syntheticCount: Math.max(0, finalized.normalized.length - primaryOutput.taskProposals.length),
      rewrittenNameCount:
        (recovered?.quality.rewrittenNameCount ?? 0) + finalized.rewrittenNameCount,
      nameRewrittenCount:
        (recovered?.quality.nameRewrittenCount ?? 0) + finalized.rewrittenNameCount,
      nameReadableCount: finalized.nameReadableCount,
      namePolishPasses: 1 + (recovered?.quality.namePolishPasses ?? 0),
      nameJargonRejectedCount:
        (recovered?.quality.nameJargonRejectedCount ?? 0) + finalized.nameJargonRejectedCount,
      llmCompletionPasses: 1,
      llmGeneratedCount: finalized.normalized.length,
      nonLlmGeneratedCount: 0,
    },
  };
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
    async generatePersonas(input: LLMPersonaGenerationInput): Promise<LLMPersonaGenerationOutput> {
      return callPersonaGenerationCompletion(normalizedOptions, input);
    },
    async planExecutionCase(input: LLMExecutionPlanInput): Promise<LLMExecutionPlanOutput> {
      return callExecutionPlanCompletion(normalizedOptions, input);
    },
    async decideExecutionStep(input: LLMStepDecisionInput): Promise<LLMStepDecisionOutput> {
      return callStepDecisionCompletion(normalizedOptions, input);
    },
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
