import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ReportStep } from '@/sections/ReportStep';
import type { FinalReportBundle, TestRunSnapshot } from '@/types';

const runSnapshot: TestRunSnapshot = {
  runId: 'run-nav-1',
  createdAt: new Date().toISOString(),
  selectedTaskIds: [1, 2, 3],
  categorySelections: [{ categoryId: 'cat-speed', count: 2 }],
  generatedAgents: [],
  executions: [],
  caseRefs: [],
};

const finalReportBundle: FinalReportBundle = {
  runId: 'run-nav-1',
  tier: 'medium',
  generatedAt: new Date().toISOString(),
  kpi: {
    averageCompletionRate: 88,
    susScore: 78.5,
    averageTaskDuration: '8:51',
    averageErrorRate: 0.65,
  },
  taskDetails: [
    {
      taskId: 1,
      taskCode: 'T1',
      title: '新用户注册',
      difficulty: '简单',
      estimatedDuration: '6-8分钟',
      testScenario: '测试场景',
      operationSteps: ['步骤1'],
      successCriteria: ['标准1'],
      tags: ['核心流程'],
    },
  ],
  taskPerformance: [
    {
      taskId: 1,
      taskName: '新用户注册',
      completionRate: 88,
      averageDuration: '8:51',
      errorPerTask: 0.65,
      helpRequests: 0.3,
      status: 'warning',
    },
  ],
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
      score: 3.5,
      polarity: index % 2 === 0 ? 'positive' : 'negative',
    })),
  },
  nasaTlx: {
    dimensions: [
      { id: 'mental', label: '脑力需求', value: 68, description: '脑力描述', tone: 'negative' },
      { id: 'physical', label: '体力需求', value: 25, description: '体力描述', tone: 'positive' },
      { id: 'temporal', label: '时间压力', value: 55, description: '时间描述', tone: 'neutral' },
      { id: 'performance', label: '绩效水平', value: 72, description: '绩效描述', tone: 'neutral' },
      { id: 'effort', label: '努力程度', value: 62, description: '努力描述', tone: 'negative' },
      { id: 'frustration', label: '挫折程度', value: 35, description: '挫折描述', tone: 'positive' },
    ],
    wwl: 52.8,
    summary: '中等负荷',
    strengths: ['优势1'],
    risks: ['风险1'],
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

let intersectionCallback: IntersectionObserverCallback | null = null;

class MockIntersectionObserver {
  readonly root = null;
  readonly rootMargin = '';
  readonly thresholds = [0];

  constructor(callback: IntersectionObserverCallback) {
    intersectionCallback = callback;
  }

  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
  takeRecords = vi.fn(() => []);
}

beforeEach(() => {
  intersectionCallback = null;
  Object.defineProperty(window, 'IntersectionObserver', {
    writable: true,
    value: MockIntersectionObserver,
  });

  Object.defineProperty(globalThis.HTMLElement.prototype, 'scrollIntoView', {
    writable: true,
    value: vi.fn(),
  });
});

afterEach(() => {
  cleanup();
});

describe('ReportStep navigation', () => {
  it('renders full section navigation and supports click-to-scroll', () => {
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

    for (const section of finalReportBundle.navigation) {
      expect(screen.getAllByText(section.label).length).toBeGreaterThan(0);
    }

    const navButton = screen.getByRole('button', { name: 'SUS 可用性量表' });
    fireEvent.click(navButton);

    expect(globalThis.HTMLElement.prototype.scrollIntoView).toHaveBeenCalled();
    expect(navButton.getAttribute('aria-current')).toBe('true');
    expect(navButton.getAttribute('data-active')).toBe('true');
  });

  it('updates active section when observer reports visible section', () => {
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

    const section = document.getElementById('nasa-tlx');
    expect(section).not.toBeNull();

    act(() => {
      intersectionCallback?.(
        [
          ({
            isIntersecting: true,
            intersectionRatio: 0.8,
            target: section!,
          } as unknown) as IntersectionObserverEntry,
        ],
        {} as IntersectionObserver,
      );
    });

    const activeButton = screen.getByRole('button', { name: 'NASA-TLX 工作负荷' });
    expect(activeButton.getAttribute('aria-current')).toBe('true');
    expect(activeButton.getAttribute('data-active')).toBe('true');
  });
});
