import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ExecutionStep } from '@/sections/ExecutionStep';
import type { QAHistoryItem, TaskExecution } from '@/types';

const executionCases: TaskExecution[] = [
  {
    caseId: 'run-case-001',
    taskId: 1,
    taskName: '新用户注册',
    agentId: 'cat-speed-01',
    agentName: '极速党-01',
    agentCategoryId: 'cat-speed',
    agentCategoryName: '极速党',
    status: 'failed',
    duration: 31,
    result: '失败',
    bottleneck: '入口不明显',
    emotionPeak: '高 (沮丧)',
    steps: [
      { step: 1, role: 'observer', content: '定位注册入口。' },
      { step: 2, role: 'executor', content: '填写表单并提交。' },
    ],
  },
  {
    caseId: 'run-case-002',
    taskId: 2,
    taskName: '登录账号',
    agentId: 'cat-business-01',
    agentName: '商务型-01',
    agentCategoryId: 'cat-business',
    agentCategoryName: '商务型',
    status: 'success',
    duration: 22,
    result: '成功',
    bottleneck: '反馈短暂',
    emotionPeak: '中 (焦虑)',
    steps: [
      { step: 1, role: 'observer', content: '输入账号信息。' },
      { step: 2, role: 'feedback', content: '登录成功反馈。', emotion: 'satisfied', emotionValue: 40 },
    ],
  },
];

const emptyHistory: QAHistoryItem[] = [];

afterEach(() => {
  cleanup();
});

describe('ExecutionStep readability', () => {
  it('shows readable playback context and keeps report gating behavior', () => {
    const onComplete = vi.fn();

    render(
      <ExecutionStep
        executions={executionCases}
        selectedCaseId="run-case-001"
        qaHistory={emptyHistory}
        onSelectCase={vi.fn()}
        onAskCaseQuestion={vi.fn()}
        onComplete={onComplete}
      />,
    );

    expect(screen.getByText(/当前任务:/)).toBeTruthy();
    expect(screen.getByText(/当前步骤:/)).toBeTruthy();
    expect(screen.getByText('任务汇总')).toBeTruthy();
    expect(screen.getByText('任务样本列表')).toBeTruthy();
    expect(screen.getByText('案例详情与追问')).toBeTruthy();
    expect(screen.getAllByText('执行中').length).toBeGreaterThan(0);

    const reportButton = screen.getByRole('button', { name: '查看完整报告' }) as HTMLButtonElement;
    expect(reportButton.disabled).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: '跳过到完成' }));
    expect((screen.getByRole('button', { name: '查看完整报告' }) as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: '查看完整报告' }));
    expect(onComplete).toHaveBeenCalled();
  });
});
