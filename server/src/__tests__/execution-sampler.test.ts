/** @vitest-environment node */
import { describe, expect, it } from 'vitest';
import { sampleExecutionPairs } from '../domain/execution-sampler';
import type { GeneratedAgentPersona } from '../types/domain';

function buildAgent(id: number, categoryId: string): GeneratedAgentPersona {
  const sequence = id + 1;
  return {
    id: `agent-${categoryId}-${id}`,
    categoryId,
    categoryName: categoryId,
    sequence,
    name: `${categoryId}-${String(sequence).padStart(2, '0')}`,
    avatar: '🙂',
    persona: 'mock',
    emotionalBase: [],
    goal: 'goal',
    traits: {
      patience: 50,
      techSavvy: 50,
      attention: 50,
    },
  };
}

describe('sampleExecutionPairs', () => {
  it('never exceeds max budget and covers selected tasks when feasible', () => {
    const agents: GeneratedAgentPersona[] = [];
    for (let index = 0; index < 20; index += 1) {
      agents.push(buildAgent(index, index < 15 ? 'cat-a' : 'cat-b'));
    }

    const selected = sampleExecutionPairs([1, 2, 3, 4], agents, 40);

    expect(selected.length).toBeLessThanOrEqual(40);
    const coveredTasks = new Set(selected.map((item) => item.taskId));
    expect(coveredTasks.has(1)).toBe(true);
    expect(coveredTasks.has(2)).toBe(true);
    expect(coveredTasks.has(3)).toBe(true);
    expect(coveredTasks.has(4)).toBe(true);
  });

  it('roughly follows category proportions', () => {
    const agents: GeneratedAgentPersona[] = [];
    for (let index = 0; index < 20; index += 1) {
      agents.push(buildAgent(index, index < 14 ? 'cat-major' : 'cat-minor'));
    }

    const selected = sampleExecutionPairs([1, 2, 3, 4, 5], agents, 40);

    const byCategory = new Map<string, number>();
    for (const pair of selected) {
      const category = pair.generatedAgentId.includes('cat-major') ? 'cat-major' : 'cat-minor';
      byCategory.set(category, (byCategory.get(category) ?? 0) + 1);
    }

    const major = byCategory.get('cat-major') ?? 0;
    const ratio = selected.length > 0 ? major / selected.length : 0;

    expect(ratio).toBeGreaterThan(0.55);
    expect(ratio).toBeLessThan(0.9);
  });
});
