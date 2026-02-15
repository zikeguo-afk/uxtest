import type { UXAgentProvider, UXAgentReport } from '@/services/uxAgentProvider';
import type {
  DiagnosisItem,
  ExecutionRequest,
  QARequest,
  QAResponse,
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
  items: DiagnosisItem[];
}

interface CreateRunResponse {
  runId: string;
  snapshot: TestRunSnapshot;
  executions: TaskExecution[];
}

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8787').replace(/\/+$/, '');
const JSON_HEADERS = { 'content-type': 'application/json' };

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

export const apiProvider: UXAgentProvider = {
  async getDiagnosis(targetUrl: string): Promise<DiagnosisItem[]> {
    const response = await requestJson<DiagnosisResponse>('/api/v1/diagnosis', {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ targetUrl }),
    });

    return response.items ?? [];
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
