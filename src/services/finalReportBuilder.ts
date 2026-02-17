import { reportTemplates } from '@/data/mock/reportTemplates';
import { taskDetailTemplates } from '@/data/mock/taskDetailTemplates';
import { defaultTasks } from '@/data/mock/tasks';
import type {
  CategoryReportItem,
  FinalReportBundle,
  QuantitativeMetric,
  RepresentativeSample,
  ReportTemplateTier,
  Task,
  TaskDetailCard,
  TaskPerformanceRow,
  TestRunSnapshot,
} from '@/types';

interface FinalReportBuilderInput {
  runSnapshot: TestRunSnapshot | null;
  quantitativeMetrics: QuantitativeMetric[];
  categorySummary: CategoryReportItem[];
  representativeSamples: RepresentativeSample[];
}

const taskNameMap = new Map(defaultTasks.map((task) => [task.id, task.name]));

export const defaultReportNavSections: FinalReportBundle['navigation'] = [
  { id: 'overview', label: '报告总览' },
  { id: 'task-details', label: '任务详情' },
  { id: 'task-performance', label: '任务完成绩效' },
  { id: 'sus', label: 'SUS 可用性量表' },
  { id: 'nasa-tlx', label: 'NASA-TLX 工作负荷' },
  { id: 'category-summary', label: '类别汇总' },
  { id: 'representative-samples', label: '代表样例' },
  { id: 'global-qa', label: '全局追问' },
  { id: 'qualitative-insights', label: 'Gioia 洞察' },
  { id: 'recommendations', label: '优化建议' },
];

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function roundTo(value: number, precision = 1): number {
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
}

function toSeconds(clock: string): number {
  const [minutes, seconds] = clock.split(':').map((part) => Number.parseInt(part, 10));
  if (!Number.isFinite(minutes) || !Number.isFinite(seconds)) {
    return 0;
  }
  return minutes * 60 + seconds;
}

function formatClock(seconds: number): string {
  const safeSeconds = Math.max(0, Math.round(seconds));
  const minute = Math.floor(safeSeconds / 60);
  const second = safeSeconds % 60;
  return `${minute}:${String(second).padStart(2, '0')}`;
}

function average(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function parseEstimatedDurationToSeconds(duration: string): number {
  const matched = duration.match(/(\d+)(?:\s*[-~]\s*(\d+))?\s*分钟/);
  if (!matched) {
    return 0;
  }
  const min = Number.parseInt(matched[1], 10);
  const max = matched[2] ? Number.parseInt(matched[2], 10) : min;
  return Math.round(((min + max) / 2) * 60);
}

function resolveTier(overallSuccessRate: number): ReportTemplateTier {
  if (overallSuccessRate >= 90) {
    return 'excellent';
  }
  if (overallSuccessRate >= 75) {
    return 'medium';
  }
  return 'needs-improvement';
}

function resolveTaskTitleMap(
  runSnapshot: TestRunSnapshot | null,
  metrics: QuantitativeMetric[],
): Map<number, string> {
  const titleMap = new Map<number, string>();

  for (const metric of metrics) {
    titleMap.set(metric.taskId, metric.taskName);
  }

  for (const execution of runSnapshot?.executions ?? []) {
    if (!titleMap.has(execution.taskId)) {
      titleMap.set(execution.taskId, execution.taskName);
    }
  }

  return titleMap;
}

function resolveTaskCatalogMap(runSnapshot: TestRunSnapshot | null): Map<number, Task> {
  const map = new Map<number, Task>();
  for (const task of runSnapshot?.taskCatalog ?? []) {
    if (!task) {
      continue;
    }
    map.set(task.id, task);
  }
  return map;
}

function buildTaskDetails(
  selectedTaskIds: number[],
  tier: ReportTemplateTier,
  taskTitleMap: Map<number, string>,
  taskCatalogMap: Map<number, Task>,
): TaskDetailCard[] {
  const template = reportTemplates[tier].taskDetailDefault;

  return selectedTaskIds.map((taskId) => {
    const detail = taskDetailTemplates[taskId];
    const dynamicTitle = taskTitleMap.get(taskId);
    const catalogTask = taskCatalogMap.get(taskId);
    const dynamicScenario = catalogTask?.testScenario;
    const dynamicOperationSteps = catalogTask?.operationSteps;
    const dynamicSuccessCriteria = catalogTask?.successCriteria;

    if (detail) {
      return {
        ...detail,
        title: dynamicTitle ?? detail.title,
        difficulty: catalogTask?.difficulty ?? detail.difficulty,
        estimatedDuration: catalogTask?.estimatedDuration ?? detail.estimatedDuration,
        testScenario: dynamicScenario ?? detail.testScenario,
        operationSteps:
          dynamicOperationSteps && dynamicOperationSteps.length > 0
            ? [...dynamicOperationSteps]
            : detail.operationSteps,
        successCriteria:
          dynamicSuccessCriteria && dynamicSuccessCriteria.length > 0
            ? [...dynamicSuccessCriteria]
            : detail.successCriteria,
        tags: catalogTask?.tags && catalogTask.tags.length > 0 ? [...catalogTask.tags] : detail.tags,
        taskCode: `T${taskId}`,
      };
    }

    return {
      taskId,
      taskCode: `T${taskId}`,
      title: dynamicTitle ?? taskNameMap.get(taskId) ?? `任务 ${taskId}`,
      difficulty: catalogTask?.difficulty ?? template.difficulty,
      estimatedDuration: catalogTask?.estimatedDuration ?? template.estimatedDuration,
      testScenario: dynamicScenario ?? template.testScenario,
      operationSteps:
        dynamicOperationSteps && dynamicOperationSteps.length > 0
          ? [...dynamicOperationSteps]
          : [...template.operationSteps],
      successCriteria:
        dynamicSuccessCriteria && dynamicSuccessCriteria.length > 0
          ? [...dynamicSuccessCriteria]
          : [...template.successCriteria],
      tags: catalogTask?.tags && catalogTask.tags.length > 0 ? [...catalogTask.tags] : [...template.tags],
    };
  });
}

function resolveTaskIds(runSnapshot: TestRunSnapshot | null, metrics: QuantitativeMetric[]): number[] {
  const fromSnapshot = runSnapshot?.selectedTaskIds ?? [];
  if (fromSnapshot.length > 0) {
    return Array.from(new Set(fromSnapshot)).sort((a, b) => a - b);
  }
  const fromMetrics = metrics.map((metric) => metric.taskId);
  return Array.from(new Set(fromMetrics)).sort((a, b) => a - b);
}

function buildTaskPerformanceRows(
  selectedTaskIds: number[],
  taskDetails: TaskDetailCard[],
  runSnapshot: TestRunSnapshot | null,
  metrics: QuantitativeMetric[],
  tier: ReportTemplateTier,
): TaskPerformanceRow[] {
  const metricMap = new Map(metrics.map((metric) => [metric.taskId, metric]));
  const detailMap = new Map(taskDetails.map((detail) => [detail.taskId, detail]));
  const executionMap = new Map<number, TestRunSnapshot['executions']>();

  for (const taskId of selectedTaskIds) {
    executionMap.set(
      taskId,
      (runSnapshot?.executions ?? []).filter((execution) => execution.taskId === taskId),
    );
  }

  const defaults = reportTemplates[tier].performanceDefaults;

  return selectedTaskIds.map((taskId) => {
    const metric = metricMap.get(taskId);
    const executions = executionMap.get(taskId) ?? [];
    const detail = detailMap.get(taskId);

    const successRate = metric
      ? metric.successRate
      : executions.length > 0
        ? Math.round(
            (executions.filter((execution) => execution.status === 'success').length / executions.length) * 100,
          )
        : 0;

    const fallbackSeconds = Math.max(
      defaults.durationFloorSeconds,
      Math.round(
        parseEstimatedDurationToSeconds(
          detail?.estimatedDuration ?? reportTemplates[tier].taskDetailDefault.estimatedDuration,
        ) * defaults.durationMultiplier,
      ),
    );

    const avgDurationSeconds = executions.length > 0 ? average(executions.map((execution) => execution.duration)) : fallbackSeconds;

    const failureRate = executions.length > 0
      ? executions.filter((execution) => execution.status === 'failed').length / executions.length
      : clamp((100 - successRate) / 100, 0, 1);

    const errorPerTask = roundTo(
      clamp(
        defaults.errorBaseline + (100 - successRate) * defaults.errorPenaltyFactor + failureRate * 0.45,
        0,
        5,
      ),
      2,
    );

    const helpRequests = roundTo(
      clamp(
        defaults.helpBaseline + (100 - successRate) * defaults.helpPenaltyFactor + failureRate * 0.55,
        0,
        5,
      ),
      2,
    );

    let status: TaskPerformanceRow['status'] = 'healthy';
    if (successRate < 75) {
      status = 'risk';
    } else if (successRate < 90) {
      status = 'warning';
    }

    return {
      taskId,
      taskName: metric?.taskName ?? detail?.title ?? taskNameMap.get(taskId) ?? `任务 ${taskId}`,
      completionRate: successRate,
      averageDuration: formatClock(avgDurationSeconds),
      errorPerTask,
      helpRequests,
      status,
    };
  });
}

export function buildFinalReportBundle({
  runSnapshot,
  quantitativeMetrics,
  categorySummary,
  representativeSamples,
}: FinalReportBuilderInput): FinalReportBundle {
  const overallSuccessRate =
    quantitativeMetrics.length > 0
      ? Math.round(average(quantitativeMetrics.map((metric) => metric.successRate)))
      : 0;

  const tier = resolveTier(overallSuccessRate);
  const template = reportTemplates[tier];
  const selectedTaskIds = resolveTaskIds(runSnapshot, quantitativeMetrics);
  const taskTitleMap = resolveTaskTitleMap(runSnapshot, quantitativeMetrics);
  const taskCatalogMap = resolveTaskCatalogMap(runSnapshot);
  const taskDetails = buildTaskDetails(selectedTaskIds, tier, taskTitleMap, taskCatalogMap);
  const taskPerformance = buildTaskPerformanceRows(
    selectedTaskIds,
    taskDetails,
    runSnapshot,
    quantitativeMetrics,
    tier,
  );

  const performanceDurations = taskPerformance.map((row) => toSeconds(row.averageDuration)).filter((value) => value > 0);
  const avgDuration =
    performanceDurations.length > 0
      ? formatClock(average(performanceDurations))
      : template.kpi.averageTaskDuration;

  const sampleFailureRatio = representativeSamples.length > 0
    ? representativeSamples.filter((sample) => sample.status === 'failed').length / representativeSamples.length
    : 0;

  const categoryRiskRatio = categorySummary.length > 0
    ? categorySummary.filter((category) => category.successRate < 75).length / categorySummary.length
    : 0;

  const avgErrorRateFromRows =
    taskPerformance.length > 0
      ? average(taskPerformance.map((row) => row.errorPerTask))
      : template.kpi.averageErrorRate;

  const adjustedErrorRate = roundTo(
    clamp(avgErrorRateFromRows + sampleFailureRatio * 0.08 + categoryRiskRatio * 0.06, 0, 5),
    2,
  );

  return {
    runId: runSnapshot?.runId ?? 'run-local-template',
    tier,
    generatedAt: new Date().toISOString(),
    kpi: {
      averageCompletionRate: overallSuccessRate,
      susScore: template.kpi.susScore,
      averageTaskDuration: avgDuration,
      averageErrorRate: adjustedErrorRate,
    },
    taskDetails,
    taskPerformance,
    sus: template.sus,
    nasaTlx: template.nasaTlx,
    navigation: defaultReportNavSections,
  };
}
