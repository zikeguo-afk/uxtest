import { defaultAgentCategories } from '../data/agent-categories';
import { defaultTasks } from '../data/tasks';
import {
  resolveCategoryId,
  resolveCategoryName,
  resolveCaseId,
} from './execution-builder';
import type {
  CategoryReportItem,
  QualitativeInsight,
  QuantitativeMetric,
  RepresentativeSample,
  TaskExecution,
  TestRunSnapshot,
  UXAgentReport,
} from '../types/domain';

const taskMap = new Map(defaultTasks.map((task) => [task.id, task]));
const categoryMap = new Map(defaultAgentCategories.map((category) => [category.id, category]));

function mode(values: string[]): string {
  if (values.length === 0) {
    return '-';
  }

  const countMap = new Map<string, number>();
  for (const value of values) {
    countMap.set(value, (countMap.get(value) ?? 0) + 1);
  }

  return [...countMap.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

function emotionSeverity(emotionPeak: string): number {
  if (emotionPeak.includes('极高')) return 4;
  if (emotionPeak.includes('高')) return 3;
  if (emotionPeak.includes('中')) return 2;
  if (emotionPeak.includes('低')) return 1;
  return 0;
}

export function buildQuantitativeMetrics(executions: TaskExecution[]): QuantitativeMetric[] {
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
        taskName: list[0]?.taskName ?? taskMap.get(taskId)?.name ?? `任务#${taskId}`,
        successRate,
        bottleneck,
        emotionPeak,
      };
    })
    .sort((a, b) => a.taskId - b.taskId);
}

export function buildCategorySummary(snapshot: TestRunSnapshot): CategoryReportItem[] {
  const executions = snapshot.executions;
  const executionByCategory = new Map<string, TaskExecution[]>();
  for (const execution of executions) {
    const categoryId = resolveCategoryId(execution);
    const list = executionByCategory.get(categoryId) ?? [];
    list.push(execution);
    executionByCategory.set(categoryId, list);
  }

  const generatedCountByCategory = new Map<string, number>();
  for (const agent of snapshot.generatedAgents) {
    generatedCountByCategory.set(
      agent.categoryId,
      (generatedCountByCategory.get(agent.categoryId) ?? 0) + 1,
    );
  }

  const plannedCountByCategory = new Map<string, number>();
  for (const selection of snapshot.categorySelections) {
    plannedCountByCategory.set(selection.categoryId, selection.count);
  }

  const categoriesInReport = new Set<string>([
    ...plannedCountByCategory.keys(),
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
      plannedCount: plannedCountByCategory.get(categoryId) ?? 0,
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

export function buildRepresentativeSamples(executions: TaskExecution[]): RepresentativeSample[] {
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

export function buildQualitativeInsights(metrics: QuantitativeMetric[]): QualitativeInsight[] {
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

export function buildRecommendations(
  metrics: QuantitativeMetric[],
  categorySummary: CategoryReportItem[],
): string[] {
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

export function buildReport(snapshot: TestRunSnapshot): UXAgentReport {
  const quantitativeMetrics = buildQuantitativeMetrics(snapshot.executions);
  const categorySummary = buildCategorySummary(snapshot);
  const representativeSamples = buildRepresentativeSamples(snapshot.executions);
  const qualitativeInsights = buildQualitativeInsights(quantitativeMetrics);
  const recommendations = buildRecommendations(quantitativeMetrics, categorySummary);

  return {
    quantitativeMetrics,
    qualitativeInsights,
    categorySummary,
    representativeSamples,
    recommendations,
  };
}

export function buildNoEvidenceReportContext(snapshot: TestRunSnapshot): string {
  return snapshot.caseRefs
    .slice(0, 3)
    .map((item) => `[${item.caseId}] ${item.taskName}`)
    .join(', ');
}

export function toCaseId(execution: TaskExecution, executions: TaskExecution[]): string {
  const index = executions.findIndex((item) => item === execution);
  return resolveCaseId(execution, index >= 0 ? index : 0);
}
