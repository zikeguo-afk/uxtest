import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ReportStep } from '@/sections/ReportStep';
import type { TestRunSnapshot } from '@/types';

afterEach(() => {
  cleanup();
});

const runSnapshot: TestRunSnapshot = {
  runId: 'run-1',
  createdAt: new Date().toISOString(),
  selectedTaskIds: [1],
  categorySelections: [{ categoryId: 'cat-speed', count: 1 }],
  generatedAgents: [],
  executions: [],
  caseRefs: [],
};

describe('ReportStep boundary cases', () => {
  it('renders empty metrics without NaN', () => {
    render(
      <ReportStep
        targetUrl="https://example.com"
        quantitativeMetrics={[]}
        qualitativeInsights={[]}
        categorySummary={[]}
        representativeSamples={[]}
        recommendations={[]}
        finalReportBundle={null}
        runSnapshot={runSnapshot}
        qaHistory={[]}
        onAskCaseQuestion={vi.fn()}
        onAskGlobalQuestion={vi.fn()}
        onRestart={vi.fn()}
      />,
    );

    expect(screen.queryByText(/NaN/)).toBeNull();
    expect(screen.getAllByText('0%').length).toBeGreaterThan(0);
    expect(screen.getByText('暂无类别汇总数据。')).toBeTruthy();
    expect(screen.getByText('暂无代表个体样例。')).toBeTruthy();
  });

  it('supports quick ask from metrics and samples', () => {
    const onAskGlobalQuestion = vi.fn();
    const onAskCaseQuestion = vi.fn();

    render(
      <ReportStep
        targetUrl="https://example.com"
        quantitativeMetrics={[
          {
            taskId: 1,
            taskName: '新用户注册',
            successRate: 80,
            bottleneck: '表单校验反馈弱',
            emotionPeak: '中 (焦虑)',
          },
        ]}
        qualitativeInsights={[]}
        categorySummary={[
          {
            categoryId: 'cat-speed',
            categoryName: '极速党',
            plannedCount: 2,
            generatedCount: 2,
            sampledCases: 3,
            successRate: 67,
            primaryBottleneck: '表单校验反馈弱',
            emotionPeak: '高 (沮丧)',
          },
        ]}
        representativeSamples={[
          {
            caseId: 'run-1-case-001',
            categoryId: 'cat-speed',
            categoryName: '极速党',
            agentId: 'agent-1',
            agentName: '极速党-01',
            taskId: 1,
            taskName: '新用户注册',
            status: 'failed',
            summary: '任务失败样例',
            emotionPeak: '高 (沮丧)',
          },
        ]}
        recommendations={[]}
        finalReportBundle={null}
        runSnapshot={runSnapshot}
        qaHistory={[]}
        onAskCaseQuestion={onAskCaseQuestion}
        onAskGlobalQuestion={onAskGlobalQuestion}
        onRestart={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '追问任务' }));
    expect(onAskGlobalQuestion).toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: '追问样例' }));
    expect(onAskCaseQuestion).toHaveBeenCalledWith(
      '请解释案例 run-1-case-001 在任务「新用户注册」中的关键问题。',
      'run-1-case-001',
    );
  });
});
