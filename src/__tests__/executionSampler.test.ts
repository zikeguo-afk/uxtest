import { describe, expect, it } from 'vitest';
import { sampleExecutionPairs } from '@/services/executionSampler';
import type { GeneratedAgentPersona } from '@/types';

function makeAgents(categoryId: string, categoryName: string, count: number): GeneratedAgentPersona[] {
  const result: GeneratedAgentPersona[] = [];
  for (let i = 0; i < count; i += 1) {
    const suffix = String(i + 1).padStart(2, '0');
    result.push({
      id: `${categoryId}-${suffix}`,
      categoryId,
      categoryName,
      sequence: i + 1,
      name: `${categoryName}-${suffix}`,
      avatar: '🤖',
      persona: '',
      emotionalBase: [],
      goal: '效率优先',
      traits: { patience: 50, techSavvy: 50, attention: 50 },
    });
  }
  return result;
}

describe('executionSampler', () => {
  it('enforces max 40 samples with no duplicate pairs and task coverage', () => {
    const tasks = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const agents = [
      ...makeAgents('cat-a', 'A类', 5),
      ...makeAgents('cat-b', 'B类', 3),
      ...makeAgents('cat-c', 'C类', 2),
    ];

    const pairs = sampleExecutionPairs(tasks, agents, 40);

    expect(pairs.length).toBeLessThanOrEqual(40);
    expect(pairs.length).toBeGreaterThan(0);

    const uniquePairs = new Set(pairs.map((item) => `${item.taskId}::${item.generatedAgentId}`));
    expect(uniquePairs.size).toBe(pairs.length);

    const coveredTasks = new Set(pairs.map((item) => item.taskId));
    expect(coveredTasks.size).toBe(tasks.length);
  });

  it('roughly follows category population ratio over repeated sampling', () => {
    const tasks = [1, 2, 3, 4, 5];
    const moreAgents = [
      ...makeAgents('cat-major', '主类', 8),
      ...makeAgents('cat-minor', '次类', 2),
    ];
    const lessAgents = [
      ...makeAgents('cat-major', '主类', 2),
      ...makeAgents('cat-minor', '次类', 8),
    ];

    const aggregateCount = (agents: GeneratedAgentPersona[]) => {
      const categoryByAgent = new Map(agents.map((agent) => [agent.id, agent.categoryId]));
      let major = 0;
      let minor = 0;

      for (let i = 0; i < 20; i += 1) {
        const pairs = sampleExecutionPairs(tasks, agents, 40);
        for (const pair of pairs) {
          if (categoryByAgent.get(pair.generatedAgentId) === 'cat-major') {
            major += 1;
          } else {
            minor += 1;
          }
        }
      }

      return { major, minor };
    };

    const skewToMajor = aggregateCount(moreAgents);
    const skewToMinor = aggregateCount(lessAgents);

    expect(skewToMajor.major).toBeGreaterThan(skewToMajor.minor);
    expect(skewToMinor.major).toBeLessThan(skewToMinor.minor);
  });
});
