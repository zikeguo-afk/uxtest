import { act } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import App from '@/App';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('App smoke flow', () => {
  it('completes the core workflow from init to report with enhanced report sections', async () => {
    render(<App />);

    fireEvent.change(screen.getByPlaceholderText('https://www.example.com'), {
      target: { value: 'https://example.com' },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '开始分析' }));
    });

    expect(await screen.findByText('A. 初步技术诊断报告', {}, { timeout: 8000 })).toBeTruthy();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '下一步：选择任务与测试人员' }));
    });

    const selectedTaskNames = ['新用户注册', '登录账号', '全局搜索'];

    for (const taskName of selectedTaskNames) {
      await act(async () => {
        fireEvent.click(screen.getByText(taskName));
      });
    }

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '增加极速党人数' }));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '开始测试执行' }));
    });

    expect(await screen.findByText('自动执行中')).toBeTruthy();
    expect((screen.getByRole('button', { name: '查看完整报告' }) as HTMLButtonElement).disabled).toBe(true);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '跳过到完成' }));
    });
    expect(screen.getAllByText('执行完成').length).toBeGreaterThan(0);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '查看完整报告' }));
    });

    expect(screen.getByText('可用性测试最终报告')).toBeTruthy();
    expect(screen.getAllByText('报告目录').length).toBeGreaterThan(0);
    expect(screen.getAllByText('任务详情').length).toBeGreaterThan(0);
    expect(screen.getAllByText('任务完成绩效').length).toBeGreaterThan(0);
    expect(screen.getByText('SUS可用性量表结果')).toBeTruthy();
    expect(screen.getByText('NASA-TLX 工作负荷评估')).toBeTruthy();
    expect(screen.getByText('结果可信度')).toBeTruthy();
    expect(screen.getAllByText('类别汇总').length).toBeGreaterThan(0);
    expect(screen.getAllByText('全局追问（当前 Run）').length).toBeGreaterThan(0);
  }, 15000);
});
