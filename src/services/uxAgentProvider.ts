import type {
  AnalysisProgressStatus,
  CategoryReportItem,
  DiagnosisItem,
  ExecutionJobProgress,
  TaskGenerationStatus,
  ExecutionRequest,
  QARequest,
  QAResponse,
  QualitativeInsight,
  QuantitativeMetric,
  RepresentativeSample,
  Task,
  TaskExecution,
  TestRunSnapshot,
} from '@/types';

export type MaybePromise<T> = T | Promise<T>;

export interface DiagnosisRequestOptions {
  onProgress?: (progress: AnalysisProgressStatus) => void;
}

export interface DiagnosisResult {
  items: DiagnosisItem[];
  tasks: Task[];
  taskGeneration: TaskGenerationStatus;
  source?: 'mock' | 'llm' | 'llm-4stage' | 'diagnosis-only';
}

export interface UXAgentReport {
  quantitativeMetrics: QuantitativeMetric[];
  qualitativeInsights: QualitativeInsight[];
  categorySummary: CategoryReportItem[];
  representativeSamples: RepresentativeSample[];
  recommendations: string[];
}

export interface UXAgentProvider {
  getDiagnosis(targetUrl: string, options?: DiagnosisRequestOptions): MaybePromise<DiagnosisResult>;
  getExecutions(request: ExecutionRequest): MaybePromise<TaskExecution[]>;
  startExecutionJob(runId: string): MaybePromise<{ jobId: string }>;
  getExecutionJobStatus(runId: string, jobId: string): MaybePromise<{
    status: ExecutionJobProgress['status'];
    progress: ExecutionJobProgress;
    snapshot: TestRunSnapshot | null;
    error: string | null;
  }>;
  getReport(executions: TaskExecution[]): MaybePromise<UXAgentReport>;
  createRunSnapshot(request: ExecutionRequest): MaybePromise<TestRunSnapshot>;
  askQuestion(request: QARequest, snapshot: TestRunSnapshot): MaybePromise<QAResponse>;
}
