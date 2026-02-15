import { describe, expect, it } from 'vitest';
import { buildFinalReportBundle } from '@/services/finalReportBuilder';
import type { TestRunSnapshot } from '@/types';

function createSnapshot(taskIds: number[]): TestRunSnapshot {
  return {
    runId: 'run-test-1',
    createdAt: new Date().toISOString(),
    selectedTaskIds: taskIds,
    categorySelections: [{ categoryId: 'cat-speed', count: 2 }],
    generatedAgents: [],
    executions: taskIds.map((taskId, index) => ({
      caseId: `run-test-1-case-${String(index + 1).padStart(3, '0')}`,
      taskId,
      taskName: `任务${taskId}`,
      agentId: `agent-${index + 1}`,
      agentName: `极速党-${String(index + 1).padStart(2, '0')}`,
      agentCategoryId: 'cat-speed',
      agentCategoryName: '极速党',
      status: taskId % 2 === 0 ? 'success' : 'failed',
      steps: [{ step: 1, role: 'observer', content: '执行步骤' }],
      duration: 300 + index * 12,
      result: taskId % 2 === 0 ? '成功' : '失败',
      bottleneck: '流程提示弱',
      emotionPeak: taskId % 2 === 0 ? '中' : '高 (沮丧)',
    })),
    caseRefs: taskIds.map((taskId, index) => ({
      caseId: `run-test-1-case-${String(index + 1).padStart(3, '0')}`,
      taskId,
      taskName: `任务${taskId}`,
      agentId: `agent-${index + 1}`,
      agentName: `极速党-${String(index + 1).padStart(2, '0')}`,
      categoryId: 'cat-speed',
      categoryName: '极速党',
      status: taskId % 2 === 0 ? 'success' : 'failed',
      emotionPeak: taskId % 2 === 0 ? '中' : '高 (沮丧)',
      bottleneck: '流程提示弱',
    })),
  };
}

describe('buildFinalReportBundle', () => {
  it('matches report tier by success rate thresholds', () => {
    const snapshot = createSnapshot([1, 2, 3]);

    const excellent = buildFinalReportBundle({
      runSnapshot: snapshot,
      quantitativeMetrics: [
        { taskId: 1, taskName: '任务1', successRate: 95, bottleneck: 'A', emotionPeak: '低' },
      ],
      categorySummary: [],
      representativeSamples: [],
    });
    expect(excellent.tier).toBe('excellent');

    const medium = buildFinalReportBundle({
      runSnapshot: snapshot,
      quantitativeMetrics: [
        { taskId: 1, taskName: '任务1', successRate: 80, bottleneck: 'A', emotionPeak: '低' },
      ],
      categorySummary: [],
      representativeSamples: [],
    });
    expect(medium.tier).toBe('medium');

    const needsImprovement = buildFinalReportBundle({
      runSnapshot: snapshot,
      quantitativeMetrics: [
        { taskId: 1, taskName: '任务1', successRate: 70, bottleneck: 'A', emotionPeak: '高' },
      ],
      categorySummary: [],
      representativeSamples: [],
    });
    expect(needsImprovement.tier).toBe('needs-improvement');
  });

  it('builds task details only for selected tasks in current run', () => {
    const snapshot = createSnapshot([1, 5, 9]);

    const result = buildFinalReportBundle({
      runSnapshot: snapshot,
      quantitativeMetrics: [
        { taskId: 1, taskName: '新用户注册', successRate: 91, bottleneck: 'A', emotionPeak: '低' },
        { taskId: 5, taskName: '查看详情', successRate: 82, bottleneck: 'B', emotionPeak: '中' },
        { taskId: 9, taskName: '应用优惠券', successRate: 70, bottleneck: 'C', emotionPeak: '高' },
        { taskId: 12, taskName: '完成结账', successRate: 95, bottleneck: 'D', emotionPeak: '低' },
      ],
      categorySummary: [],
      representativeSamples: [],
    });

    expect(result.taskDetails.map((item) => item.taskId)).toEqual([1, 5, 9]);
  });

  it('keeps task performance rows aligned with run selected task set', () => {
    const snapshot = createSnapshot([2, 4, 6]);

    const result = buildFinalReportBundle({
      runSnapshot: snapshot,
      quantitativeMetrics: [
        { taskId: 2, taskName: '任务2', successRate: 90, bottleneck: 'A', emotionPeak: '低' },
        { taskId: 4, taskName: '任务4', successRate: 85, bottleneck: 'B', emotionPeak: '中' },
      ],
      categorySummary: [
        {
          categoryId: 'cat-speed',
          categoryName: '极速党',
          plannedCount: 2,
          generatedCount: 2,
          sampledCases: 3,
          successRate: 80,
          primaryBottleneck: '流程提示弱',
          emotionPeak: '中',
        },
      ],
      representativeSamples: [
        {
          caseId: 'run-test-1-case-001',
          categoryId: 'cat-speed',
          categoryName: '极速党',
          agentId: 'agent-1',
          agentName: '极速党-01',
          taskId: 2,
          taskName: '任务2',
          status: 'failed',
          summary: '失败样例',
          emotionPeak: '高 (沮丧)',
        },
      ],
    });

    expect(result.taskPerformance.map((item) => item.taskId)).toEqual([2, 4, 6]);
    expect(result.taskPerformance.length).toBe(3);
  });
});
