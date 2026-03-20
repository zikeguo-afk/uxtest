/** @vitest-environment node */
import { describe, expect, it, vi } from 'vitest';
import type { Page } from 'playwright';
import { observePage } from '../live-runner/page-observer';

describe('live-runner page observer', () => {
  it('evaluates browser observation with script text and returns structured data', async () => {
    const evaluate = vi.fn().mockResolvedValue({
      url: 'https://example.com',
      title: 'Example',
      textSnippet: 'hello',
      domExcerpt: '<html></html>',
      elementHints: [
        {
          selector: '#start',
          label: '开始',
          role: 'button',
        },
      ],
    });

    const page = {
      evaluate,
    } as unknown as Page;

    const observation = await observePage(page);

    expect(typeof evaluate.mock.calls[0]?.[0]).toBe('string');
    expect(observation.url).toBe('https://example.com');
    expect(observation.elementHints[0]?.selector).toBe('#start');
  });
});
