import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import App from '@/App';
import { mockProvider } from '@/services/mockProvider';
import type { DiagnosisItem } from '@/types';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('App runtime status visibility', () => {
  it('updates header status during analysis and returns to idle', async () => {
    const delayedDiagnosis: DiagnosisItem[] = [
      {
        dimension: '导航结构',
        status: 'success',
        description: '导航层级清晰',
      },
    ];

    vi.spyOn(mockProvider, 'getDiagnosis').mockImplementationOnce(
      async () =>
        await new Promise((resolve) => {
          window.setTimeout(() => resolve(delayedDiagnosis), 180);
        }),
    );

    render(<App />);

    fireEvent.change(screen.getByPlaceholderText('https://www.example.com'), {
      target: { value: 'https://example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: '开始分析' }));

    await waitFor(() => {
      expect(screen.getAllByText('分析中').length).toBeGreaterThan(0);
    }, {
      timeout: 4000,
    });

    expect(await screen.findByText('A. 初步技术诊断报告')).toBeTruthy();
    expect(screen.getAllByText('空闲').length).toBeGreaterThan(0);
  }, 12000);

  it('shows error status when global qa request fails', async () => {
    vi.spyOn(mockProvider, 'askQuestion').mockRejectedValue(new Error('问答服务暂不可用'));

    render(<App />);

    fireEvent.change(screen.getByPlaceholderText('https://www.example.com'), {
      target: { value: 'https://example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: '开始分析' }));

    expect(await screen.findByRole('button', { name: '下一步：选择任务与测试人员' }, { timeout: 12000 })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: '下一步：选择任务与测试人员' }));
    fireEvent.click(screen.getByText('新用户注册'));
    fireEvent.click(screen.getByText('登录账号'));
    fireEvent.click(screen.getByText('全局搜索'));
    fireEvent.click(screen.getByRole('button', { name: '增加极速党人数' }));
    fireEvent.click(screen.getByRole('button', { name: '开始测试执行' }));

    expect(await screen.findByText('自动执行中', {}, { timeout: 12000 })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '跳过到完成' }));
    fireEvent.click(screen.getByRole('button', { name: '查看完整报告' }));
    expect(await screen.findByText('可用性测试最终报告', {}, { timeout: 12000 })).toBeTruthy();

    fireEvent.change(
      screen.getByPlaceholderText('例如：为什么银发族在结账任务上失败率更高？'),
      { target: { value: '为什么这个任务失败？' } },
    );
    fireEvent.click(screen.getByRole('button', { name: '提交全局提问' }));

    await waitFor(() => {
      expect(screen.getAllByText('异常').length).toBeGreaterThan(0);
    }, {
      timeout: 6000,
    });
    expect(screen.getByText(/问答服务暂不可用|全局追问失败/)).toBeTruthy();
  }, 20000);
});
