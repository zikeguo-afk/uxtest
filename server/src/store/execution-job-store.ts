import type { ExecutionJobProgress, ExecutionJobStatus, TestRunSnapshot } from '../types/domain';

interface ExecutionJobEntry {
  jobId: string;
  runId: string;
  status: ExecutionJobStatus;
  createdAt: string;
  updatedAt: string;
  expiresAt: number;
  progress: ExecutionJobProgress;
  snapshot: TestRunSnapshot | null;
  error: string | null;
}

export interface ExecutionJobStoreOptions {
  ttlMs: number;
  maxSize: number;
  cleanupIntervalMs: number;
  now?: () => number;
}

function buildJobId(): string {
  return `exec-job-${Date.now()}-${Math.floor(Math.random() * 1_000_000)
    .toString()
    .padStart(6, '0')}`;
}

export class ExecutionJobStore {
  private readonly jobs = new Map<string, ExecutionJobEntry>();
  private readonly ttlMs: number;
  private readonly maxSize: number;
  private readonly cleanupIntervalMs: number;
  private readonly now: () => number;
  private timer: NodeJS.Timeout | null = null;

  constructor(options: ExecutionJobStoreOptions) {
    this.ttlMs = Math.max(30_000, options.ttlMs);
    this.maxSize = Math.max(10, options.maxSize);
    this.cleanupIntervalMs = Math.max(5_000, options.cleanupIntervalMs);
    this.now = options.now ?? (() => Date.now());
    this.startCleanup();
  }

  create(runId: string, totalCases: number): ExecutionJobEntry {
    this.cleanupExpired();
    const now = this.now();
    const isoNow = new Date(now).toISOString();
    const jobId = buildJobId();
    const entry: ExecutionJobEntry = {
      jobId,
      runId,
      status: 'queued',
      createdAt: isoNow,
      updatedAt: isoNow,
      expiresAt: now + this.ttlMs,
      progress: {
        jobId,
        runId,
        status: 'queued',
        totalCases,
        finishedCases: 0,
        currentCaseId: null,
        cases: [],
        message: '执行任务已入队',
        updatedAt: isoNow,
      },
      snapshot: null,
      error: null,
    };
    this.jobs.set(jobId, entry);
    this.enforceSize();
    return { ...entry, progress: { ...entry.progress, cases: [...entry.progress.cases] } };
  }

  get(jobId: string): ExecutionJobEntry | null {
    this.cleanupExpired();
    const entry = this.jobs.get(jobId);
    if (!entry) {
      return null;
    }
    return {
      ...entry,
      progress: {
        ...entry.progress,
        cases: entry.progress.cases.map((item) => ({ ...item })),
      },
      snapshot: entry.snapshot
        ? {
            ...entry.snapshot,
            selectedTaskIds: [...entry.snapshot.selectedTaskIds],
            categorySelections: entry.snapshot.categorySelections.map((selection) => ({ ...selection })),
            generatedAgents: entry.snapshot.generatedAgents.map((agent) => ({ ...agent })),
            executions: entry.snapshot.executions.map((execution) => ({ ...execution, steps: execution.steps.map((step) => ({ ...step })) })),
            caseRefs: entry.snapshot.caseRefs.map((ref) => ({ ...ref })),
          }
        : null,
    };
  }

  update(
    jobId: string,
    updater: (entry: ExecutionJobEntry) => ExecutionJobEntry,
  ): ExecutionJobEntry | null {
    this.cleanupExpired();
    const current = this.jobs.get(jobId);
    if (!current) {
      return null;
    }
    const next = updater(current);
    this.jobs.set(jobId, next);
    return this.get(jobId);
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

  private cleanupExpired(): void {
    const now = this.now();
    for (const [jobId, entry] of this.jobs.entries()) {
      if (entry.expiresAt <= now) {
        this.jobs.delete(jobId);
      }
    }
  }

  private enforceSize(): void {
    while (this.jobs.size > this.maxSize) {
      const firstKey = this.jobs.keys().next().value;
      if (!firstKey) {
        break;
      }
      this.jobs.delete(firstKey);
    }
  }
}
