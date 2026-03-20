import { act } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ExecutionStep } from '@/sections/ExecutionStep';
import type { QAHistoryItem, Task, TaskExecution } from '@/types';

const executionCases: TaskExecution[] = [
  {
    caseId: 'run-1-case-001',
    taskId: 3,
    taskName: '全局搜索',
    agentId: 'cat-visual-01',
    agentName: '视觉控-01',
    agentCategoryId: 'cat-visual',
    agentCategoryName: '视觉控',
    status: 'failed',
    duration: 30,
    result: '搜索失败',
    bottleneck: '筛选入口不明显',
    emotionPeak: '高 (沮丧)',
    steps: [
      { step: 1, role: 'observer', content: '观察搜索入口。' },
      { step: 2, role: 'feedback', content: '筛选入口难以发现。', emotion: 'frustrated', emotionValue: 72 },
    ],
  },
  {
    caseId: 'run-1-case-002',
    taskId: 6,
    taskName: '加入购物车',
    agentId: 'cat-speed-02',
    agentName: '极速党-02',
    agentCategoryId: 'cat-speed',
    agentCategoryName: '极速党',
    status: 'success',
    duration: 22,
    result: '加购成功',
    bottleneck: '反馈短暂',
    emotionPeak: '中 (焦虑)',
    steps: [
      { step: 1, role: 'observer', content: '发现加入购物车入口。' },
      { step: 2, role: 'executor', content: '点击加入购物车并验证数量。' },
    ],
  },
];

const emptyHistory: QAHistoryItem[] = [];
const taskCatalog: Task[] = [
  {
    id: 3,
    name: '全局搜索',
    description: '搜索关键内容',
    selected: false,
    testScenario: '在页面执行搜索并核对结果。',
    operationSteps: ['定位搜索入口', '输入关键词并提交', '检查结果反馈'],
    successCriteria: ['搜索可完成', '结果可确认'],
  },
  {
    id: 6,
    name: '加入购物车',
    description: '把商品加入购物车',
    selected: false,
    testScenario: '从详情页加入购物车并确认数量。',
    operationSteps: ['进入详情页', '点击加入购物车', '确认数量变化'],
    successCriteria: ['加购成功', '反馈可见'],
  },
];

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('ExecutionStep sequential playback', () => {
  it('plays cases step-by-step in execution order and gates report button', async () => {
    vi.useFakeTimers();

    render(
      <ExecutionStep
        executions={executionCases}
        taskCatalog={taskCatalog}
        selectedCaseId="run-1-case-001"
        qaHistory={emptyHistory}
        onSelectCase={vi.fn()}
        onAskCaseQuestion={vi.fn()}
        onComplete={vi.fn()}
      />,
    );

    const reportButton = screen.getByRole('button', { name: '查看完整报告' });

    expect(screen.getByText('观察搜索入口。')).toBeTruthy();
    expect(screen.queryByText('筛选入口难以发现。')).toBeNull();
    expect((reportButton as HTMLButtonElement).disabled).toBe(true);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1300);
    });
    expect(screen.getByText('筛选入口难以发现。')).toBeTruthy();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1300);
    });

    expect((reportButton as HTMLButtonElement).disabled).toBe(true);

    for (let index = 0; index < 10 && (reportButton as HTMLButtonElement).disabled; index += 1) {
      // Use bounded polling to avoid coupling assertions to an exact timer tick count.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1300);
      });
    }

    expect(screen.getAllByText('执行完成').length).toBeGreaterThan(0);
    expect((reportButton as HTMLButtonElement).disabled).toBe(false);
  });

  it('supports speed toggle and skip-to-complete controls', async () => {
    vi.useFakeTimers();

    const onComplete = vi.fn();

    render(
      <ExecutionStep
        executions={executionCases}
        taskCatalog={taskCatalog}
        selectedCaseId="run-1-case-001"
        qaHistory={emptyHistory}
        onSelectCase={vi.fn()}
        onAskCaseQuestion={vi.fn()}
        onComplete={onComplete}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /速度 1x/ }));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(700);
    });

    expect(screen.getByText('筛选入口难以发现。')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: '跳过到完成' }));

    const reportButton = screen.getByRole('button', { name: '查看完整报告' });
    expect(screen.getAllByText('执行完成').length).toBeGreaterThan(0);
    expect((reportButton as HTMLButtonElement).disabled).toBe(false);

    fireEvent.click(reportButton);
    expect(onComplete).toHaveBeenCalled();
  });

  it('allows asking question during playback and blocks selecting unseen case', () => {
    const onAskCaseQuestion = vi.fn();

    render(
      <ExecutionStep
        executions={executionCases}
        taskCatalog={taskCatalog}
        selectedCaseId="run-1-case-001"
        qaHistory={emptyHistory}
        onSelectCase={vi.fn()}
        onAskCaseQuestion={onAskCaseQuestion}
        onComplete={vi.fn()}
      />,
    );

    fireEvent.change(
      screen.getByPlaceholderText('针对该案例提问，例如：这条失败的关键原因是什么？'),
      { target: { value: '这条失败案例的直接原因是什么？' } },
    );
    fireEvent.click(screen.getByRole('button', { name: '提交追问' }));

    expect(onAskCaseQuestion).toHaveBeenCalledWith('这条失败案例的直接原因是什么？', 'run-1-case-001');

    fireEvent.click(screen.getByRole('button', { name: /#06 加入购物车/ }));
    fireEvent.click(screen.getByRole('button', { name: '极速党-02-待执行' }));
    expect(screen.getByText(/尚未执行到该阶段/)).toBeTruthy();
  });
});
