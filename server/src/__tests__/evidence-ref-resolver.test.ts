/** @vitest-environment node */
import { describe, expect, it } from 'vitest';
import { resolveEvidenceRefs } from '../domain/evidence-ref-resolver';

describe('resolveEvidenceRefs', () => {
  const allowedRefs = [
    'route-script:script-1',
    'route-script:capability-1',
    'interaction:button-1',
  ];

  it('repairs truncated route-script refs to canonical short id', () => {
    const result = resolveEvidenceRefs(
      ['route-script:script-1-脚本https-fr'],
      allowedRefs,
    );

    expect(result.normalizedRefs).toEqual(['route-script:script-1']);
    expect(result.repairedCount).toBe(1);
    expect(result.unresolvedRefs).toEqual([]);
  });

  it('keeps exact refs unchanged', () => {
    const result = resolveEvidenceRefs(['route-script:script-1'], allowedRefs);

    expect(result.normalizedRefs).toEqual(['route-script:script-1']);
    expect(result.repairedCount).toBe(0);
    expect(result.unresolvedRefs).toEqual([]);
  });

  it('rejects fuzzy ref values', () => {
    const result = resolveEvidenceRefs(['route'], allowedRefs);

    expect(result.normalizedRefs).toEqual([]);
    expect(result.repairedCount).toBe(0);
    expect(result.unresolvedRefs).toEqual(['route']);
  });
});
