import type {
  DiagnosisRequestOptions,
  DiagnosisResult,
  UXAgentProvider,
  UXAgentReport,
} from '@/services/uxAgentProvider';
import type {
  AnalysisProgressStatus,
  ExecutionRequest,
  QARequest,
  QAResponse,
  Task,
  TaskGenerationStatus,
  TaskExecution,
  TestRunSnapshot,
} from '@/types';

interface ApiErrorPayload {
  error?: {
    code?: string;
    message?: string;
  };
}

interface DiagnosisResponse {
  items: DiagnosisResult['items'];
  tasks?: Task[];
  taskGeneration?: TaskGenerationStatus;
  source?: DiagnosisResult['source'];
}

interface DiagnosisJobCreateResponse {
  jobId: string;
  status: AnalysisProgressStatus['status'];
  progress: Omit<AnalysisProgressStatus, 'jobId' | 'status'>;
  createdAt: string;
}

interface DiagnosisJobStatusResponse {
  jobId: string;
  status: AnalysisProgressStatus['status'];
  progress: Omit<AnalysisProgressStatus, 'jobId' | 'status'>;
  result: DiagnosisResponse | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
}

interface CreateRunResponse {
  runId: string;
  snapshot: TestRunSnapshot;
  executions: TaskExecution[];
}

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8787').replace(/\/+$/, '');
const JSON_HEADERS = { 'content-type': 'application/json' };
const DIAGNOSIS_POLL_INTERVAL_MS = 500;
const DIAGNOSIS_TIMEOUT_MS = (() => {
  const raw = Number(import.meta.env.VITE_DIAGNOSIS_TIMEOUT_MS ?? 10 * 60 * 1000);
  if (!Number.isFinite(raw) || raw < 30_000) {
    return 10 * 60 * 1000;
  }
  return Math.floor(raw);
})();

let latestSnapshot: TestRunSnapshot | null = null;
let latestRunId: string | null = null;

function deriveRunIdFromExecutions(executions: TaskExecution[]): string | null {
  const caseId = executions[0]?.caseId;
  if (!caseId) {
    return null;
  }

  const matched = caseId.match(/^(.*)-case-\d+$/);
  return matched?.[1] ?? null;
}

async function parseApiError(response: Response): Promise<string> {
  try {
    const payload = (await response.json()) as ApiErrorPayload;
    if (payload.error?.message) {
      return payload.error.message;
    }
  } catch {
    // Ignore parse failures and return fallback message below.
  }

  return `HTTP ${response.status}`;
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, init);
  if (!response.ok) {
    const message = await parseApiError(response);
    throw new Error(message);
  }
  return (await response.json()) as T;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    globalThis.setTimeout(resolve, ms);
  });
}

function normalizeProgress(
  jobId: string,
  status: AnalysisProgressStatus['status'],
  progress: Omit<AnalysisProgressStatus, 'jobId' | 'status'>,
): AnalysisProgressStatus {
  return {
    jobId,
    status,
    percent: progress.percent,
    currentStageId: progress.currentStageId,
    stages: progress.stages.map((stage) => ({ ...stage })),
    message: progress.message,
    updatedAt: progress.updatedAt,
  };
}

export const apiProvider: UXAgentProvider = {
  async getDiagnosis(targetUrl: string, options?: DiagnosisRequestOptions): Promise<DiagnosisResult> {
    const created = await requestJson<DiagnosisJobCreateResponse>('/api/v1/diagnosis/jobs', {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ targetUrl }),
    });

    options?.onProgress?.(normalizeProgress(created.jobId, created.status, created.progress));

    const startedAt = Date.now();
    let lastStatus: DiagnosisJobStatusResponse | null = null;
    while (Date.now() - startedAt <= DIAGNOSIS_TIMEOUT_MS) {
      await sleep(DIAGNOSIS_POLL_INTERVAL_MS);
      const status = await requestJson<DiagnosisJobStatusResponse>(`/api/v1/diagnosis/jobs/${created.jobId}`);
      lastStatus = status;
      options?.onProgress?.(normalizeProgress(status.jobId, status.status, status.progress));

      if (status.status === 'completed') {
        if (!status.result) {
          throw new Error('诊断任务已完成，但未返回结果。');
        }
        return {
          items: status.result.items ?? [],
          tasks: status.result.tasks ?? [],
          taskGeneration: status.result.taskGeneration ?? {
            status: 'failed',
            code: 'MISSING_TASK_GENERATION_STATUS',
            message: '诊断结果缺少任务生成状态。',
            blocked: true,
          },
          source: status.result.source,
        };
      }

      if (status.status === 'failed') {
        throw new Error(status.error || '诊断任务失败，请重试。');
      }
    }

    const timeoutSeconds = Math.round(DIAGNOSIS_TIMEOUT_MS / 1000);
    const stageLabel = lastStatus?.progress?.stages?.find(
      (stage) => stage.id === lastStatus?.progress.currentStageId,
    )?.label;
    const stageHint = stageLabel ? `当前阶段：${stageLabel}` : '后端仍在处理中';
    throw new Error(`诊断超时（>${timeoutSeconds}s）。${stageHint}，请稍后重试。`);
  },

  async createRunSnapshot(request: ExecutionRequest): Promise<TestRunSnapshot> {
    const response = await requestJson<CreateRunResponse>('/api/v1/runs', {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify(request),
    });

    latestRunId = response.runId ?? response.snapshot?.runId ?? null;
    latestSnapshot = response.snapshot ?? null;
    return response.snapshot;
  },

  async getExecutions(request: ExecutionRequest): Promise<TaskExecution[]> {
    const snapshot = await this.createRunSnapshot(request);
    return snapshot.executions;
  },

  async getReport(executions: TaskExecution[]): Promise<UXAgentReport> {
    const resolvedRunId = latestRunId ?? deriveRunIdFromExecutions(executions);
    if (!resolvedRunId) {
      throw new Error('无法确定 runId，无法请求报告。');
    }

    const report = await requestJson<UXAgentReport>(`/api/v1/runs/${resolvedRunId}/report`, {
      method: 'POST',
      headers: JSON_HEADERS,
      body: '{}',
    });

    return {
      quantitativeMetrics: report.quantitativeMetrics ?? [],
      qualitativeInsights: report.qualitativeInsights ?? [],
      categorySummary: report.categorySummary ?? [],
      representativeSamples: report.representativeSamples ?? [],
      recommendations: report.recommendations ?? [],
    };
  },

  async askQuestion(request: QARequest, snapshot: TestRunSnapshot): Promise<QAResponse> {
    const resolvedRunId = request.runId || snapshot.runId || latestRunId;
    if (!resolvedRunId) {
      throw new Error('无法确定 runId，无法提问。');
    }

    const response = await requestJson<QAResponse>(`/api/v1/runs/${resolvedRunId}/questions`, {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({
        scope: request.scope,
        question: request.question,
        caseId: request.caseId,
        filters: request.filters,
      }),
    });

    if (!latestSnapshot || latestSnapshot.runId !== snapshot.runId) {
      latestSnapshot = snapshot;
      latestRunId = snapshot.runId;
    }

    return response;
  },
};
