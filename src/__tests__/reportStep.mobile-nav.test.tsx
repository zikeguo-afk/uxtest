import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ReportStep } from '@/sections/ReportStep';
import type { FinalReportBundle, TestRunSnapshot } from '@/types';

const runSnapshot: TestRunSnapshot = {
  runId: 'run-mobile-1',
  createdAt: new Date().toISOString(),
  selectedTaskIds: [1, 2, 3],
  categorySelections: [{ categoryId: 'cat-speed', count: 1 }],
  generatedAgents: [],
  executions: [],
  caseRefs: [],
};

const finalReportBundle: FinalReportBundle = {
  runId: 'run-mobile-1',
  tier: 'medium',
  generatedAt: new Date().toISOString(),
  kpi: {
    averageCompletionRate: 80,
    susScore: 78.5,
    averageTaskDuration: '8:51',
    averageErrorRate: 0.65,
  },
  taskDetails: [],
  taskPerformance: [],
  sus: {
    totalScore: 78.5,
    grade: 'B+',
    acceptability: '良好',
    percentileRank: 75,
    rangeReferences: [
      { min: 90, max: 100, label: '90-100', level: '最佳', tone: 'positive' },
      { min: 80, max: 89, label: '80-89', level: '优秀', tone: 'positive' },
      { min: 70, max: 79, label: '70-79', level: '良好', tone: 'neutral' },
      { min: 60, max: 69, label: '60-69', level: '一般', tone: 'negative' },
      { min: 0, max: 59, label: '0-59', level: '较差', tone: 'negative' },
    ],
    questionScores: Array.from({ length: 10 }, (_, index) => ({
      id: index + 1,
      question: `题项 ${index + 1}`,
      score: 3,
      polarity: index % 2 === 0 ? 'positive' : 'negative',
    })),
  },
  nasaTlx: {
    dimensions: [
      { id: 'mental', label: '脑力需求', value: 60, description: '脑力', tone: 'negative' },
      { id: 'physical', label: '体力需求', value: 20, description: '体力', tone: 'positive' },
      { id: 'temporal', label: '时间压力', value: 50, description: '时间', tone: 'neutral' },
      { id: 'performance', label: '绩效水平', value: 70, description: '绩效', tone: 'neutral' },
      { id: 'effort', label: '努力程度', value: 65, description: '努力', tone: 'negative' },
      { id: 'frustration', label: '挫折程度', value: 30, description: '挫折', tone: 'positive' },
    ],
    wwl: 49.5,
    summary: '中等负荷',
    strengths: ['优势'],
    risks: ['风险'],
  },
  navigation: [
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
  ],
};

beforeEach(() => {
  Object.defineProperty(globalThis.HTMLElement.prototype, 'scrollIntoView', {
    writable: true,
    value: vi.fn(),
  });
});

afterEach(() => {
  cleanup();
});

describe('ReportStep mobile navigation', () => {
  it('shows top dropdown and scrolls to selected section', () => {
    render(
      <ReportStep
        targetUrl="https://example.com"
        quantitativeMetrics={[]}
        qualitativeInsights={[]}
        categorySummary={[]}
        representativeSamples={[]}
        recommendations={[]}
        finalReportBundle={finalReportBundle}
        runSnapshot={runSnapshot}
        qaHistory={[]}
        onAskCaseQuestion={vi.fn()}
        onAskGlobalQuestion={vi.fn()}
        onRestart={vi.fn()}
      />,
    );

    const mobileNav = screen.getByLabelText('移动端报告目录') as HTMLSelectElement;
    expect(mobileNav).toBeTruthy();

    fireEvent.change(mobileNav, { target: { value: 'sus' } });

    expect(mobileNav.value).toBe('sus');
    expect(globalThis.HTMLElement.prototype.scrollIntoView).toHaveBeenCalled();
  });
});
