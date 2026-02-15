import type {
  CategoryReportItem,
  DiagnosisItem,
  ExecutionRequest,
  QARequest,
  QAResponse,
  QualitativeInsight,
  QuantitativeMetric,
  RepresentativeSample,
  TaskExecution,
  TestRunSnapshot,
} from '@/types';

export type MaybePromise<T> = T | Promise<T>;

export interface UXAgentReport {
  quantitativeMetrics: QuantitativeMetric[];
  qualitativeInsights: QualitativeInsight[];
  categorySummary: CategoryReportItem[];
  representativeSamples: RepresentativeSample[];
  recommendations: string[];
}

export interface UXAgentProvider {
  getDiagnosis(targetUrl: string): MaybePromise<DiagnosisItem[]>;
  getExecutions(request: ExecutionRequest): MaybePromise<TaskExecution[]>;
  getReport(executions: TaskExecution[]): MaybePromise<UXAgentReport>;
  createRunSnapshot(request: ExecutionRequest): MaybePromise<TestRunSnapshot>;
  askQuestion(request: QARequest, snapshot: TestRunSnapshot): MaybePromise<QAResponse>;
}
