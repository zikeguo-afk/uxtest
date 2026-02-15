/** @vitest-environment node */
import { describe, expect, it } from 'vitest';
import { defaultAgentCategories } from '../data/agent-categories';
import { generateCohort } from '../domain/cohort-generator';

function variance(values: number[]): number {
  if (values.length <= 1) {
    return 0;
  }

  const avg = values.reduce((sum, value) => sum + value, 0) / values.length;
  return values.reduce((sum, value) => sum + (value - avg) ** 2, 0) / values.length;
}

function traitVariance(cohort: ReturnType<typeof generateCohort>): number {
  return (
    variance(cohort.map((item) => item.traits.patience)) +
    variance(cohort.map((item) => item.traits.techSavvy)) +
    variance(cohort.map((item) => item.traits.attention))
  ) / 3;
}

describe('generateCohort', () => {
  it('increases trait variance when category count increases', () => {
    const small = generateCohort([{ categoryId: 'cat-speed', count: 1 }], defaultAgentCategories);
    const large = generateCohort([{ categoryId: 'cat-speed', count: 10 }], defaultAgentCategories);

    expect(traitVariance(large)).toBeGreaterThanOrEqual(traitVariance(small));
  });

  it('keeps all trait values in range 0-100', () => {
    const cohort = generateCohort([{ categoryId: 'cat-business', count: 20 }], defaultAgentCategories);
    for (const item of cohort) {
      expect(item.traits.patience).toBeGreaterThanOrEqual(0);
      expect(item.traits.patience).toBeLessThanOrEqual(100);
      expect(item.traits.techSavvy).toBeGreaterThanOrEqual(0);
      expect(item.traits.techSavvy).toBeLessThanOrEqual(100);
      expect(item.traits.attention).toBeGreaterThanOrEqual(0);
      expect(item.traits.attention).toBeLessThanOrEqual(100);
    }
  });

  it('does not guarantee identical outputs between runs', () => {
    const selection = [{ categoryId: 'cat-visual', count: 5 }];
    const cohortA = generateCohort(selection, defaultAgentCategories);
    const cohortB = generateCohort(selection, defaultAgentCategories);

    expect(cohortA.map((item) => item.id)).not.toEqual(cohortB.map((item) => item.id));
  });
});
