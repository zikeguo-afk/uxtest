import { act } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import App from '@/App';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('TaskSelection layout', () => {
  it('renders left/right panels as full-height boxed columns with inner scroll areas', async () => {
    vi.useFakeTimers();
    render(<App />);

    fireEvent.change(screen.getByPlaceholderText('https://www.example.com'), {
      target: { value: 'https://example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: '开始分析' }));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2200);
    });

    fireEvent.click(screen.getByRole('button', { name: '下一步：选择任务与测试人员' }));

    const leftPanel = screen.getByTestId('task-selection-left-panel');
    const rightPanel = screen.getByTestId('task-selection-right-panel');

    expect(leftPanel.className).toContain('h-full');
    expect(leftPanel.className).toContain('flex');
    expect(rightPanel.className).toContain('h-full');
    expect(rightPanel.className).toContain('flex');

    expect(leftPanel.querySelector('.overflow-y-auto')).not.toBeNull();
    expect(rightPanel.querySelector('.overflow-y-auto')).not.toBeNull();
  });
});
