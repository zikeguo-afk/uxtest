import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { TaskSelectionStep } from '@/sections/TaskSelectionStep';
import type { AgentCategorySelection, AgentCategoryTemplate, Task } from '@/types';

const categoryTemplates: AgentCategoryTemplate[] = [
  {
    id: 'cat-speed',
    name: '极速党',
    avatar: '⚡',
    persona: '高频用户',
    emotionalBase: ['初始情绪值: 低'],
    goal: '效率优先',
    baseTraits: {
      patience: 30,
      techSavvy: 90,
      attention: 75,
    },
  },
];

const categorySelections: AgentCategorySelection[] = [
  {
    categoryId: 'cat-speed',
    count: 1,
  },
];

const tasks: Task[] = [
  {
    id: 1,
    name: '完成首次加载',
    description: '确认首页可进入',
    selected: true,
  },
];

describe('TaskSelection detail source', () => {
  it('shows missing detail warnings instead of template fallback content', () => {
    render(
      <TaskSelectionStep
        tasks={tasks}
        selectedTasks={[1]}
        categoryTemplates={categoryTemplates}
        categorySelections={categorySelections}
        onTaskToggle={vi.fn()}
        onCategoryIncrement={vi.fn()}
        onCategoryDecrement={vi.fn()}
        onNext={vi.fn()}
        onBack={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '详情' }));

    expect(screen.getByText('详情缺失：未提供测试场景。')).toBeTruthy();
    expect(screen.getByText('详情缺失：未提供操作步骤。')).toBeTruthy();
    expect(screen.getByText('详情缺失：未提供成功标准。')).toBeTruthy();
    expect(screen.queryByText('点击注册入口')).toBeNull();

    const startButton = screen.getByRole('button', { name: '开始测试执行' }) as HTMLButtonElement;
    expect(startButton.disabled).toBe(true);
  });
});
