import type { LLMAdapter } from '../llm/adapter';
import {
  resolveCaseId,
  resolveCategoryId,
} from './execution-builder';
import type {
  ExecutionCaseRef,
  QAEvidence,
  QARequest,
  QAResponse,
  TaskExecution,
  TestRunSnapshot,
} from '../types/domain';

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
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
    return snapshot.executions.filter(
      (execution, index) => resolveCaseId(execution, index) === request.caseId,
    );
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
    if (
      filters?.emotion !== undefined &&
      !execution.steps.some((step) => step.emotion === filters.emotion)
    ) {
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
    ...execution.steps.flatMap((step) => [
      step.content,
      step.plannedStep ?? '',
      step.observation ?? '',
      step.evidence?.domExcerpt ?? '',
    ]),
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
    execution.steps.find((step) =>
      includesAny(
        [step.content, step.plannedStep ?? '', step.observation ?? '', step.evidence?.domExcerpt ?? ''].join(' '),
        tokens,
      ),
    ) ??
    execution.steps.find((step) => step.emotion !== undefined) ??
    execution.steps[execution.steps.length - 1];
  const excerpt = matchedStep
    ? matchedStep.observation?.trim() ||
      matchedStep.content ||
      matchedStep.evidence?.domExcerpt?.slice(0, 160) ||
      execution.result
    : execution.result;

  return {
    caseId: resolveCaseId(execution, index),
    taskId: execution.taskId,
    taskName: execution.taskName,
    step: matchedStep?.step ?? 1,
    excerpt,
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

  const bottleneckCount = new Map<string, number>();
  for (const execution of executions) {
    const bottleneck = execution.bottleneck ?? '交互反馈不足';
    bottleneckCount.set(bottleneck, (bottleneckCount.get(bottleneck) ?? 0) + 1);
  }
  const topBottleneck =
    [...bottleneckCount.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '交互反馈不足';

  const topEmotion =
    executions
      .map((execution) => execution.emotionPeak ?? '低')
      .sort((a, b) => {
        const score = (value: string) => {
          if (value.includes('极高')) return 4;
          if (value.includes('高')) return 3;
          if (value.includes('中')) return 2;
          return 1;
        };
        return score(b) - score(a);
      })[0] ?? '低';

  return {
    summary: `当前筛选命中 ${executions.length} 条样本，成功率约 ${successRate}%；主要瓶颈集中在「${topBottleneck}」，情绪峰值以「${topEmotion}」为主。`,
    successRate,
    topBottleneck,
  };
}

export async function askQuestion(
  request: QARequest,
  snapshot: TestRunSnapshot,
  llmAdapter?: LLMAdapter,
): Promise<QAResponse> {
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
    .map((execution) => {
      const index = snapshot.executions.findIndex(
        (item, i) => resolveCaseId(item, i) === execution.caseId,
      );
      return {
        execution,
        index: index >= 0 ? index : 0,
        score: scoreExecution(execution, normalizedQuestion, tokens),
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

  const evidence = ranked.map(({ execution, index }) =>
    pickEvidenceForExecution(execution, index, tokens),
  );

  const relatedCases: ExecutionCaseRef[] = ranked
    .map(({ execution, index }) => {
      const caseId = resolveCaseId(execution, index);
      return snapshot.caseRefs.find((item) => item.caseId === caseId);
    })
    .filter((item): item is ExecutionCaseRef => item !== undefined);

  const infer = shouldInfer(request.question);

  if (request.scope === 'case') {
    const focus = ranked[0];
    const caseId = resolveCaseId(focus.execution, focus.index);
    const evidenceSummary = summarizeCase(focus.execution, caseId);

    let answer = infer
      ? `${evidenceSummary} 推断：该问题更可能由「${focus.execution.bottleneck ?? '交互反馈不足'}」触发，可优先补强该环节反馈。`
      : evidenceSummary;
    let confidence = infer ? 0.72 : 0.86;

    if (infer && llmAdapter) {
      try {
        const enhanced = await llmAdapter.enhanceInference({
          question: request.question,
          scope: request.scope,
          draftAnswer: answer,
          evidence: evidence.slice(0, 2),
        });
        answer = enhanced.answer;
        confidence = clamp(confidence + (enhanced.confidenceDelta ?? 0), 0, 1);
      } catch (error) {
        console.warn('[qa] llm enhance failed, fallback to draft inference', error);
      }
    }

    return {
      answer,
      mode: infer ? 'inference' : 'evidence',
      confidence,
      evidence: evidence.slice(0, 2),
      relatedCases,
    };
  }

  const globalSummary = summarizeGlobal(ranked.map((item) => item.execution));

  let answer = infer
    ? `${globalSummary.summary} 推断：优先修复「${globalSummary.topBottleneck}」可最快改善该筛选范围下的完成率。`
    : globalSummary.summary;
  let confidence = infer ? 0.68 : 0.82;

  if (infer && llmAdapter) {
    try {
      const enhanced = await llmAdapter.enhanceInference({
        question: request.question,
        scope: request.scope,
        draftAnswer: answer,
        evidence,
      });
      answer = enhanced.answer;
      confidence = clamp(confidence + (enhanced.confidenceDelta ?? 0), 0, 1);
    } catch (error) {
      console.warn('[qa] llm enhance failed, fallback to draft inference', error);
    }
  }

  return {
    answer,
    mode: infer ? 'inference' : 'evidence',
    confidence,
    evidence,
    relatedCases,
  };
}
