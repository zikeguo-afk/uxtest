import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import App from '@/App';
import { defaultTasks } from '@/data/mock/tasks';
import { mockProvider } from '@/services/mockProvider';
import type { DiagnosisResult } from '@/services/uxAgentProvider';

function buildDetailedTasks() {
  return defaultTasks.slice(0, 15).map((task, index) => ({
    ...task,
    id: index + 1,
    selected: false,
    testScenario: `完成「${task.name}」并确认结果。`,
    operationSteps: ['进入入口', '执行操作', '确认反馈'],
    successCriteria: ['操作可完成', '反馈可验证'],
  }));
}

beforeEach(() => {
  vi.useRealTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('App runtime status visibility', () => {
  it('updates header status during analysis and returns to idle', async () => {
    vi.useFakeTimers();
    const delayedDiagnosis: DiagnosisResult = {
      items: [
        {
          dimension: '导航结构',
          status: 'success',
          description: '导航层级清晰',
        },
      ],
      tasks: defaultTasks.map((task) => ({ ...task })),
      taskGeneration: {
        status: 'success',
        code: 'TEST_OK',
        message: '测试任务生成成功',
        blocked: false,
      },
      source: 'mock',
    };

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
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '开始分析' }));
      await vi.advanceTimersByTimeAsync(1600);
    });

    expect(screen.getAllByText('分析中').length).toBeGreaterThan(0);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(600);
    });

    expect(screen.getByText('A. 初步技术诊断报告')).toBeTruthy();
    expect(screen.getAllByText('空闲').length).toBeGreaterThan(0);
  }, 12000);

  it('shows error status when global qa request fails', async () => {
    vi.useFakeTimers();
    vi.spyOn(mockProvider, 'getDiagnosis').mockResolvedValueOnce({
      items: [
        {
          dimension: '结构化导航',
          status: 'success',
          description: '任务详情已生成。',
        },
      ],
      tasks: buildDetailedTasks(),
      taskGeneration: {
        status: 'success',
        code: 'TEST_TASKS_READY',
        message: '任务生成成功。',
        blocked: false,
      },
      source: 'llm-4stage',
    });
    vi.spyOn(mockProvider, 'askQuestion').mockRejectedValue(new Error('问答服务暂不可用'));

    render(<App />);

    fireEvent.change(screen.getByPlaceholderText('https://www.example.com'), {
      target: { value: 'https://example.com' },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '开始分析' }));
      await vi.advanceTimersByTimeAsync(2200);
    });

    expect(screen.getByRole('button', { name: '下一步：选择任务与测试人员' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: '下一步：选择任务与测试人员' }));
    fireEvent.click(screen.getByText('新用户注册'));
    fireEvent.click(screen.getByText('登录账号'));
    fireEvent.click(screen.getByText('全局搜索'));
    fireEvent.click(screen.getByRole('button', { name: '增加极速党人数' }));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '开始测试执行' }));
      await vi.advanceTimersByTimeAsync(2000);
    });

    expect(screen.getByText('自动执行中')).toBeTruthy();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '跳过到完成' }));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '查看完整报告' }));
    });
    expect(screen.getByText('可用性测试最终报告')).toBeTruthy();

    fireEvent.change(
      screen.getByPlaceholderText('例如：为什么银发族在结账任务上失败率更高？'),
      { target: { value: '为什么这个任务失败？' } },
    );
    fireEvent.click(screen.getByRole('button', { name: '提交全局提问' }));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
    expect(screen.getAllByText('异常').length).toBeGreaterThan(0);
    expect(screen.getByText(/问答服务暂不可用|全局追问失败/)).toBeTruthy();
  }, 20000);

  it('shows diagnosis-only mode when task generation is blocked', async () => {
    vi.spyOn(mockProvider, 'getDiagnosis').mockResolvedValueOnce({
      items: [
        {
          dimension: '结构化导航',
          status: 'success',
          description: '导航层级可理解',
        },
      ],
      tasks: [],
      taskGeneration: {
        status: 'failed',
        code: 'INSUFFICIENT_VALID_TASKS',
        message: '任务有效数量不足（0/6）。',
        blocked: true,
      },
      source: 'diagnosis-only',
    });

    render(<App />);

    fireEvent.change(screen.getByPlaceholderText('https://www.example.com'), {
      target: { value: 'https://example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: '开始分析' }));

    expect(await screen.findByText('A. 初步技术诊断报告', {}, { timeout: 10000 })).toBeTruthy();
    expect(screen.getByText('任务生成失败（已阻断）')).toBeTruthy();
    expect(screen.getAllByText(/任务有效数量不足/).length).toBeGreaterThan(0);
    expect(
      (screen.getByRole('button', { name: '下一步：选择任务与测试人员' }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  }, 15000);

  it('shows degraded hint and keeps next-step enabled when tasks are auto-filled', async () => {
    vi.spyOn(mockProvider, 'getDiagnosis').mockResolvedValueOnce({
      items: [
        {
          dimension: '结构化导航',
          status: 'warning',
          description: '任务自动补全已启用。',
        },
      ],
      tasks: defaultTasks.slice(0, 15).map((task, index) => ({
        ...task,
        id: index + 1,
        name: `完成第${index + 1}项任务`,
        selected: false,
      })),
      taskGeneration: {
        status: 'degraded',
        code: 'TASK_GENERATION_DEGRADED',
        message: '任务已自动补全到 15 条。',
        blocked: false,
        quality: {
          autoFilledCount: 6,
          syntheticCount: 4,
          rewrittenNameCount: 3,
          weakGateWarnings: 1,
          llmCompletionPasses: 1,
          llmGeneratedCount: 15,
          nonLlmGeneratedCount: 0,
          nameRewrittenCount: 3,
          nameReadableCount: 12,
          namePolishPasses: 1,
          nameJargonRejectedCount: 2,
        },
      },
      source: 'llm-4stage',
    });

    render(<App />);
    fireEvent.change(screen.getByPlaceholderText('https://www.example.com'), {
      target: { value: 'https://example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: '开始分析' }));

    expect(await screen.findByText('任务已自动补全（可继续）', {}, { timeout: 10000 })).toBeTruthy();
    expect(screen.getByText(/来源统计：LLM 补全轮次 1，LLM 生成 15，非 LLM 任务 0/)).toBeTruthy();
    expect(screen.getByText(/命名可读化：可读名称 12，名称改写 3，术语替换 2，修正轮次 1/)).toBeTruthy();
    expect(
      (screen.getByRole('button', { name: '下一步：选择任务与测试人员' }) as HTMLButtonElement)
        .disabled,
    ).toBe(false);
  }, 15000);
});
