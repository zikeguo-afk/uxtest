import { act } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import App from '@/App';
import { defaultTasks } from '@/data/mock/tasks';
import { mockProvider } from '@/services/mockProvider';

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

  it('stays in analysis when diagnosis returns blocked task generation', async () => {
    vi.spyOn(mockProvider, 'getDiagnosis').mockResolvedValueOnce({
      items: [
        {
          dimension: '实时诊断状态',
          status: 'warning',
          description: '仅返回诊断，任务生成被阻断。',
        },
      ],
      tasks: [],
      taskGeneration: {
        status: 'failed',
        code: 'TASK_GATE_BLOCKED',
        message: '任务无效占比过高（6/6）。',
        blocked: true,
      },
      source: 'diagnosis-only',
    });

    render(<App />);

    fireEvent.change(screen.getByPlaceholderText('https://www.example.com'), {
      target: { value: 'https://example.com' },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '开始分析' }));
    });

    expect(await screen.findByText('任务生成失败（已阻断）', {}, { timeout: 8000 })).toBeTruthy();
    const nextButton = screen.getByRole('button', { name: '下一步：选择任务与测试人员' });
    expect((nextButton as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText('A. 初步技术诊断报告')).toBeTruthy();
  }, 12000);

  it('continues to task-selection when diagnosis is degraded but has 15 tasks', async () => {
    vi.spyOn(mockProvider, 'getDiagnosis').mockResolvedValueOnce({
      items: [
        {
          dimension: '结构化导航',
          status: 'warning',
          description: '任务已自动补全，可继续执行。',
        },
      ],
      tasks: Array.from({ length: 15 }, (_, index) => ({
        ...defaultTasks[index % defaultTasks.length],
        id: index + 1,
        name: `用户完成第${index + 1}项操作`,
        selected: false,
      })),
      taskGeneration: {
        status: 'degraded',
        code: 'TASK_GENERATION_DEGRADED',
        message: '任务已自动补全到 15 条。',
        blocked: false,
        quality: {
          autoFilledCount: 8,
          syntheticCount: 5,
          rewrittenNameCount: 4,
          weakGateWarnings: 2,
        },
      },
      source: 'llm-4stage',
    });

    render(<App />);
    fireEvent.change(screen.getByPlaceholderText('https://www.example.com'), {
      target: { value: 'https://example.com' },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '开始分析' }));
    });

    expect(await screen.findByText('任务已自动补全（可继续）', {}, { timeout: 8000 })).toBeTruthy();
    const nextButton = screen.getByRole('button', { name: '下一步：选择任务与测试人员' });
    expect((nextButton as HTMLButtonElement).disabled).toBe(false);
    await act(async () => {
      fireEvent.click(nextButton);
    });
    expect(await screen.findByText('选择测试任务')).toBeTruthy();
  }, 12000);
});
