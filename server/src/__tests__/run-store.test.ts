/** @vitest-environment node */
import { afterEach, describe, expect, it } from 'vitest';
import { RunStore } from '../store/run-store';
import type { TestRunSnapshot } from '../types/domain';

function snapshot(runId: string): TestRunSnapshot {
  return {
    runId,
    createdAt: new Date().toISOString(),
    selectedTaskIds: [1, 2, 3],
    categorySelections: [{ categoryId: 'cat-speed', count: 2 }],
    generatedAgents: [],
    executions: [],
    caseRefs: [],
  };
}

const stores: RunStore[] = [];

afterEach(() => {
  for (const store of stores) {
    store.close();
  }
  stores.length = 0;
});

describe('RunStore', () => {
  it('expires runs by TTL', () => {
    let now = 1_000;
    const store = new RunStore({
      ttlMs: 100,
      maxSize: 10,
      cleanupIntervalMs: 10_000,
      now: () => now,
    });
    stores.push(store);

    store.set(snapshot('run-a'));
    expect(store.get('run-a')?.runId).toBe('run-a');

    now = 1_200;
    expect(store.get('run-a')).toBeNull();
  });

  it('evicts oldest run when exceeding capacity', () => {
    const store = new RunStore({
      ttlMs: 10_000,
      maxSize: 2,
      cleanupIntervalMs: 10_000,
    });
    stores.push(store);

    store.set(snapshot('run-1'));
    store.set(snapshot('run-2'));
    store.set(snapshot('run-3'));

    expect(store.size()).toBe(2);
    expect(store.get('run-1')).toBeNull();
    expect(store.get('run-2')?.runId).toBe('run-2');
    expect(store.get('run-3')?.runId).toBe('run-3');
  });
});
