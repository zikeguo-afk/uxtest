import type { TestRunSnapshot } from '../types/domain';

interface RunEntry {
  snapshot: TestRunSnapshot;
  expiresAt: number;
  lastAccessedAt: number;
}

export interface RunStoreOptions {
  ttlMs: number;
  maxSize: number;
  cleanupIntervalMs: number;
  now?: () => number;
}

export class RunStore {
  private readonly runs = new Map<string, RunEntry>();
  private readonly ttlMs: number;
  private readonly maxSize: number;
  private readonly cleanupIntervalMs: number;
  private readonly now: () => number;
  private timer: NodeJS.Timeout | null = null;

  constructor(options: RunStoreOptions) {
    this.ttlMs = Math.max(1, options.ttlMs);
    this.maxSize = Math.max(1, options.maxSize);
    this.cleanupIntervalMs = Math.max(1, options.cleanupIntervalMs);
    this.now = options.now ?? (() => Date.now());
    this.startCleanup();
  }

  set(snapshot: TestRunSnapshot): void {
    this.cleanupExpired();
    const now = this.now();

    if (this.runs.has(snapshot.runId)) {
      this.runs.delete(snapshot.runId);
    }

    this.runs.set(snapshot.runId, {
      snapshot,
      expiresAt: now + this.ttlMs,
      lastAccessedAt: now,
    });

    this.enforceSize();
  }

  get(runId: string): TestRunSnapshot | null {
    this.cleanupExpired();
    const entry = this.runs.get(runId);
    if (!entry) {
      return null;
    }

    const now = this.now();
    if (entry.expiresAt <= now) {
      this.runs.delete(runId);
      return null;
    }

    this.runs.delete(runId);
    this.runs.set(runId, {
      ...entry,
      lastAccessedAt: now,
      expiresAt: now + this.ttlMs,
    });

    return this.runs.get(runId)?.snapshot ?? null;
  }

  cleanupExpired(): number {
    const now = this.now();
    let removed = 0;

    for (const [runId, entry] of this.runs.entries()) {
      if (entry.expiresAt <= now) {
        this.runs.delete(runId);
        removed += 1;
      }
    }

    return removed;
  }

  size(): number {
    return this.runs.size;
  }

  close(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private startCleanup(): void {
    this.timer = setInterval(() => {
      this.cleanupExpired();
    }, this.cleanupIntervalMs);

    this.timer.unref?.();
  }

  private enforceSize(): void {
    while (this.runs.size > this.maxSize) {
      const oldestKey = this.runs.keys().next().value;
      if (!oldestKey) {
        break;
      }
      this.runs.delete(oldestKey);
    }
  }
}
