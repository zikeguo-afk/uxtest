import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { ReportStep } from '@/sections/ReportStep';
import type { FinalReportBundle, QAHistoryItem, TestRunSnapshot } from '@/types';

const runSnapshot: TestRunSnapshot = {
  runId: 'run-reliability-1',
  createdAt: new Date().toISOString(),
  selectedTaskIds: [1, 2, 3],
  categorySelections: [{ categoryId: 'cat-speed', count: 2 }],
  generatedAgents: [],
  executions: [
    {
      caseId: 'case-001',
      taskId: 1,
      taskName: '新用户注册',
      agentId: 'cat-speed-01',
      agentName: '极速党-01',
      agentCategoryId: 'cat-speed',
      agentCategoryName: '极速党',
      status: 'success',
      steps: [{ step: 1, role: 'observer', content: '完成注册。' }],
      duration: 20,
      result: '成功',
      bottleneck: '无',
      emotionPeak: '低',
    },
    {
      caseId: 'case-002',
      taskId: 2,
      taskName: '登录账号',
      agentId: 'cat-speed-02',
      agentName: '极速党-02',
      agentCategoryId: 'cat-speed',
      agentCategoryName: '极速党',
      status: 'failed',
      steps: [{ step: 1, role: 'observer', content: '登录失败。' }],
      duration: 28,
      result: '失败',
      bottleneck: '验证码识别差',
      emotionPeak: '高 (沮丧)',
    },
  ],
  caseRefs: [],
};

const finalReportBundle: FinalReportBundle = {
  runId: 'run-reliability-1',
  tier: 'medium',
  generatedAt: new Date().toISOString(),
  kpi: {
    averageCompletionRate: 82,
    susScore: 76.5,
    averageTaskDuration: '8:42',
    averageErrorRate: 0.62,
  },
  taskDetails: [
    {
      taskId: 1,
      taskCode: 'T1',
      title: '新用户注册',
      difficulty: '简单',
      estimatedDuration: '6-8分钟',
      testScenario: '注册场景',
      operationSteps: ['点击注册'],
      successCriteria: ['注册成功'],
      tags: ['核心'],
    },
  ],
  taskPerformance: [
    {
      taskId: 1,
      taskName: '新用户注册',
      completionRate: 82,
      averageDuration: '8:42',
      errorPerTask: 0.62,
      helpRequests: 0.3,
      status: 'warning',
    },
  ],
  sus: {
    totalScore: 76.5,
    grade: 'B',
    acceptability: '良好',
    percentileRank: 72,
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

const qaHistory: QAHistoryItem[] = [
  {
    id: 'qa-1',
    createdAt: new Date().toISOString(),
    scope: 'global',
    question: '为什么失败',
    response: {
      answer: '因为入口不明显',
      mode: 'evidence',
      confidence: 0.9,
      evidence: [{ caseId: 'case-002', taskId: 2, taskName: '登录账号', step: 1, excerpt: '登录失败。' }],
      relatedCases: [],
    },
  },
  {
    id: 'qa-2',
    createdAt: new Date().toISOString(),
    scope: 'global',
    question: '如何优化',
    response: {
      answer: '建议优化入口层级',
      mode: 'inference',
      confidence: 0.72,
      evidence: [{ caseId: 'case-002', taskId: 2, taskName: '登录账号', step: 1, excerpt: '登录失败。' }],
      relatedCases: [],
    },
  },
];

afterEach(() => {
  cleanup();
});

describe('Report reliability module', () => {
  it('renders reliability summary and evidence/inference ratios', () => {
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
        qaHistory={qaHistory}
        onAskCaseQuestion={vi.fn()}
        onAskGlobalQuestion={vi.fn()}
        onRestart={vi.fn()}
      />,
    );

    expect(screen.getByText('结果可信度')).toBeTruthy();
    expect(screen.getByText('数据来源')).toBeTruthy();
    expect(screen.getByText('Mock Provider')).toBeTruthy();
    expect(screen.getByText('证据回答: 1 (50%)')).toBeTruthy();
    expect(screen.getByText('推断回答: 1 (50%)')).toBeTruthy();
    expect(screen.getByText(/推断已标注/)).toBeTruthy();
  });
});
