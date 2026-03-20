import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { ExecutionStep } from '@/sections/ExecutionStep';
import type { Task, TaskExecution } from '@/types';

const executions: TaskExecution[] = [
  {
    caseId: 'case-001',
    taskId: 1,
    taskName: '完成首次加载',
    agentId: 'agent-1',
    agentName: '极速党-01',
    agentCategoryId: 'cat-speed',
    agentCategoryName: '极速党',
    status: 'success',
    duration: 32,
    result: '完成',
    bottleneck: '无',
    emotionPeak: '低',
    steps: [
      {
        step: 1,
        role: 'executor',
        content: '打开首页并等待渲染完成。',
      },
      {
        step: 2,
        role: 'executor',
        content: '点击开始按钮进入工作区。',
      },
      {
        step: 3,
        role: 'feedback',
        content: '页面显示创建成功提示。',
      },
    ],
  },
];

afterEach(() => {
  cleanup();
});

describe('ExecutionStep task detail migration', () => {
  it('uses taskCatalog details from previous step instead of local templates', () => {
    const taskCatalog: Task[] = [
      {
        id: 1,
        name: '完成首次加载',
        description: '进入并加载页面',
        selected: false,
        testScenario: '首次访问页面，确认可以进入工作区。',
        operationSteps: ['访问首页入口', '点击开始进入工作区', '确认加载结果可见'],
        successCriteria: ['页面可进入', '结果提示明确'],
      },
    ];

    render(
      <ExecutionStep
        executions={executions}
        taskCatalog={taskCatalog}
        selectedCaseId="case-001"
        qaHistory={[]}
        onSelectCase={vi.fn()}
        onAskCaseQuestion={vi.fn()}
        onComplete={vi.fn()}
      />,
    );

    expect(screen.getByText('首次访问页面，确认可以进入工作区。')).toBeTruthy();
    expect(screen.getByText('访问首页入口')).toBeTruthy();
    expect(screen.getByText(/页面可进入/)).toBeTruthy();
    expect(screen.queryByText('定位入口')).toBeNull();
  });

  it('blocks execution and report when selected task detail is incomplete', () => {
    const taskCatalog: Task[] = [
      {
        id: 1,
        name: '完成首次加载',
        description: '进入并加载页面',
        selected: false,
        testScenario: '',
        operationSteps: ['访问首页入口'],
        successCriteria: ['页面可进入'],
      },
    ];

    render(
      <ExecutionStep
        executions={executions}
        taskCatalog={taskCatalog}
        selectedCaseId="case-001"
        qaHistory={[]}
        onSelectCase={vi.fn()}
        onAskCaseQuestion={vi.fn()}
        onComplete={vi.fn()}
      />,
    );

    expect(screen.getByText(/执行已阻断：任务详情缺失/)).toBeTruthy();
    const reportButton = screen.getAllByRole('button', { name: '查看完整报告' })[0] as HTMLButtonElement;
    expect(reportButton.disabled).toBe(true);
    expect((screen.getByRole('button', { name: '跳过到完成' }) as HTMLButtonElement).disabled).toBe(true);
  });
});
