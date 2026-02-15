import { act } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import App from '@/App';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('Task selection rules', () => {
  it('enforces 3-10 task gating with person count requirement', async () => {
    vi.useFakeTimers();
    render(<App />);

    fireEvent.change(screen.getByPlaceholderText('https://www.example.com'), {
      target: { value: 'https://example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: '开始分析' }));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });

    fireEvent.click(screen.getByRole('button', { name: '下一步：选择任务与测试人员' }));

    const startButton = screen.getByRole('button', { name: '开始测试执行' });
    expect(startButton.getAttribute('disabled')).not.toBeNull();

    fireEvent.click(screen.getByText('新用户注册'));
    fireEvent.click(screen.getByText('登录账号'));
    fireEvent.click(screen.getByRole('button', { name: '增加极速党人数' }));
    expect(startButton.getAttribute('disabled')).not.toBeNull();

    fireEvent.click(screen.getByText('全局搜索'));
    expect(startButton.getAttribute('disabled')).toBeNull();

    const elevenTasks = [
      '筛选商品',
      '查看详情',
      '加入购物车',
      '修改数量',
      '删除商品',
      '应用优惠券',
      '填写地址',
      '选择支付',
    ];

    for (const taskName of elevenTasks) {
      fireEvent.click(screen.getByText(taskName));
    }

    expect(screen.getByText('已选择 10/10 个任务（至少 3 个）')).toBeTruthy();

    fireEvent.click(screen.getByText('完成结账'));
    expect(screen.getByText('已选择 10/10 个任务（至少 3 个）')).toBeTruthy();
  });
});
