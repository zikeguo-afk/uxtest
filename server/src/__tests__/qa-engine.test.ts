/** @vitest-environment node */
import { describe, expect, it } from 'vitest';
import { askQuestion } from '../domain/qa-engine';
import type { QARequest, TestRunSnapshot } from '../types/domain';

const snapshot: TestRunSnapshot = {
  runId: 'run-test',
  createdAt: new Date().toISOString(),
  selectedTaskIds: [3, 6],
  categorySelections: [{ categoryId: 'cat-speed', count: 2 }],
  generatedAgents: [],
  executions: [
    {
      caseId: 'run-test-case-001',
      taskId: 3,
      taskName: '全局搜索',
      agentId: 'cat-speed-01',
      agentName: '极速党-01',
      agentCategoryId: 'cat-speed',
      agentCategoryName: '极速党',
      status: 'failed',
      duration: 35,
      result: '搜索失败',
      bottleneck: '筛选入口不明显',
      emotionPeak: '高 (沮丧)',
      steps: [
        { step: 1, role: 'observer', content: '观察搜索入口。' },
        {
          step: 2,
          role: 'feedback',
          content: '筛选入口不明显，用户反复尝试。',
          emotion: 'frustrated',
          emotionValue: 72,
        },
      ],
    },
    {
      caseId: 'run-test-case-002',
      taskId: 6,
      taskName: '加入购物车',
      agentId: 'cat-speed-02',
      agentName: '极速党-02',
      agentCategoryId: 'cat-speed',
      agentCategoryName: '极速党',
      status: 'success',
      duration: 22,
      result: '加入购物车成功',
      bottleneck: '反馈展示时间短',
      emotionPeak: '中 (焦虑)',
      steps: [
        { step: 1, role: 'observer', content: '识别加入购物车按钮。' },
        { step: 2, role: 'executor', content: '点击加入购物车并检查数量。' },
      ],
    },
  ],
  caseRefs: [
    {
      caseId: 'run-test-case-001',
      taskId: 3,
      taskName: '全局搜索',
      agentId: 'cat-speed-01',
      agentName: '极速党-01',
      categoryId: 'cat-speed',
      categoryName: '极速党',
      status: 'failed',
      emotionPeak: '高 (沮丧)',
      bottleneck: '筛选入口不明显',
    },
    {
      caseId: 'run-test-case-002',
      taskId: 6,
      taskName: '加入购物车',
      agentId: 'cat-speed-02',
      agentName: '极速党-02',
      categoryId: 'cat-speed',
      categoryName: '极速党',
      status: 'success',
      emotionPeak: '中 (焦虑)',
      bottleneck: '反馈展示时间短',
    },
  ],
};

describe('askQuestion', () => {
  it('returns evidence for case-scoped question', async () => {
    const request: QARequest = {
      runId: 'run-test',
      scope: 'case',
      caseId: 'run-test-case-001',
      question: '为什么这个案例会失败？',
    };

    const response = await askQuestion(request, snapshot);
    expect(response.evidence.length).toBeGreaterThan(0);
    expect(response.mode).toBe('inference');
  });

  it('returns fallback when no execution matches filters', async () => {
    const request: QARequest = {
      runId: 'run-test',
      scope: 'global',
      question: '看看全部成功案例',
      filters: {
        categoryId: 'cat-missing',
      },
    };

    const response = await askQuestion(request, snapshot);
    expect(response.evidence.length).toBe(0);
    expect(response.answer).toContain('未找到直接证据');
  });

  it('keeps evidence mode for non-inference question', async () => {
    const request: QARequest = {
      runId: 'run-test',
      scope: 'global',
      question: '当前样本成功率是多少',
    };

    const response = await askQuestion(request, snapshot);
    expect(response.mode).toBe('evidence');
    expect(response.evidence.length).toBeGreaterThan(0);
  });
});
