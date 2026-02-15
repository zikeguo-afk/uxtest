import { describe, expect, it } from 'vitest';
import { defaultAgentCategories } from '@/data/mock/agentCategories';
import { generateCohort } from '@/services/cohortGenerator';

function meanAbsDeviation(values: number[], base: number): number {
  if (values.length === 0) {
    return 0;
  }
  const total = values.reduce((sum, value) => sum + Math.abs(value - base), 0);
  return total / values.length;
}

describe('cohortGenerator', () => {
  it('increases average trait spread when category count grows', () => {
    const categoryId = 'cat-speed';
    const template = defaultAgentCategories.find((item) => item.id === categoryId)!;

    let lowSpreadScore = 0;
    let highSpreadScore = 0;

    for (let i = 0; i < 20; i += 1) {
      const lowCohort = generateCohort([{ categoryId, count: 1 }], defaultAgentCategories);
      const highCohort = generateCohort([{ categoryId, count: 10 }], defaultAgentCategories);

      lowSpreadScore +=
        meanAbsDeviation(lowCohort.map((item) => item.traits.patience), template.baseTraits.patience) +
        meanAbsDeviation(lowCohort.map((item) => item.traits.techSavvy), template.baseTraits.techSavvy) +
        meanAbsDeviation(lowCohort.map((item) => item.traits.attention), template.baseTraits.attention);

      highSpreadScore +=
        meanAbsDeviation(highCohort.map((item) => item.traits.patience), template.baseTraits.patience) +
        meanAbsDeviation(highCohort.map((item) => item.traits.techSavvy), template.baseTraits.techSavvy) +
        meanAbsDeviation(highCohort.map((item) => item.traits.attention), template.baseTraits.attention);
    }

    expect(highSpreadScore).toBeGreaterThan(lowSpreadScore);
  });

  it('does not guarantee deterministic personas across runs', () => {
    const firstRun = generateCohort([{ categoryId: 'cat-business', count: 4 }], defaultAgentCategories);
    const secondRun = generateCohort([{ categoryId: 'cat-business', count: 4 }], defaultAgentCategories);

    const firstSignature = firstRun.map((item) => `${item.id}:${item.traits.patience}:${item.traits.techSavvy}:${item.traits.attention}`).join('|');
    const secondSignature = secondRun.map((item) => `${item.id}:${item.traits.patience}:${item.traits.techSavvy}:${item.traits.attention}`).join('|');

    expect(firstSignature).not.toBe(secondSignature);
  });

  it('keeps all trait values in [0, 100]', () => {
    const cohort = generateCohort(
      [
        { categoryId: 'cat-speed', count: 20 },
        { categoryId: 'cat-senior', count: 20 },
      ],
      defaultAgentCategories,
    );

    for (const item of cohort) {
      expect(item.traits.patience).toBeGreaterThanOrEqual(0);
      expect(item.traits.patience).toBeLessThanOrEqual(100);
      expect(item.traits.techSavvy).toBeGreaterThanOrEqual(0);
      expect(item.traits.techSavvy).toBeLessThanOrEqual(100);
      expect(item.traits.attention).toBeGreaterThanOrEqual(0);
      expect(item.traits.attention).toBeLessThanOrEqual(100);
    }
  });
});
