// UXAgent 类型定义

export type Step = 'init' | 'analysis' | 'task-selection' | 'execution' | 'report';

export type TaskStatus = 'pending' | 'running' | 'success' | 'failed';

export type AgentEmotion = 'neutral' | 'frustrated' | 'angry' | 'anxious' | 'satisfied';

export type QAScope = 'case' | 'global';

export type QAResponseMode = 'evidence' | 'inference';

export type ReportTemplateTier = 'excellent' | 'medium' | 'needs-improvement';

export type TaskPerformanceStatus = 'healthy' | 'warning' | 'risk';

export type MetricTone = 'positive' | 'neutral' | 'negative';

export interface TraitProfile {
  patience: number;
  techSavvy: number;
  attention: number;
}

export interface Task {
  id: number;
  name: string;
  description: string;
  selected: boolean;
}

export interface DiagnosisItem {
  dimension: string;
  status: 'success' | 'warning' | 'error';
  description: string;
}

export interface AgentCategoryTemplate {
  id: string;
  name: string;
  avatar: string;
  persona: string;
  emotionalBase: string[];
  goal: string;
  baseTraits: TraitProfile;
}

export interface AgentCategorySelection {
  categoryId: string;
  count: number;
}

export interface GeneratedAgentPersona {
  id: string;
  categoryId: string;
  categoryName: string;
  sequence: number;
  name: string;
  avatar: string;
  persona: string;
  emotionalBase: string[];
  goal: string;
  traits: TraitProfile;
}

export interface ExecutionStep {
  step: number;
  role: 'observer' | 'decider' | 'executor' | 'feedback';
  content: string;
  emotion?: AgentEmotion;
  emotionValue?: number;
}

export interface TaskExecution {
  caseId?: string;
  taskId: number;
  taskName: string;
  agentId: string;
  agentName: string;
  agentCategoryId?: string;
  agentCategoryName?: string;
  agentAvatar?: string;
  agentGoal?: string;
  status: TaskStatus;
  steps: ExecutionStep[];
  duration: number;
  result: string;
  bottleneck?: string;
  emotionPeak?: string;
}

export interface ExecutionRequest {
  targetUrl?: string;
  selectedTaskIds: number[];
  categorySelections: AgentCategorySelection[];
  maxCases: number;
}

export interface ExecutionSamplePair {
  taskId: number;
  generatedAgentId: string;
}

export interface QuantitativeMetric {
  taskId: number;
  taskName: string;
  successRate: number;
  bottleneck: string;
  emotionPeak: string;
}

export interface QualitativeInsight {
  firstOrder: string;
  secondOrder: string;
  aggregate: string;
}

export interface CategoryReportItem {
  categoryId: string;
  categoryName: string;
  plannedCount: number;
  generatedCount: number;
  sampledCases: number;
  successRate: number;
  primaryBottleneck: string;
  emotionPeak: string;
}

export interface RepresentativeSample {
  caseId?: string;
  categoryId: string;
  categoryName: string;
  agentId: string;
  agentName: string;
  taskId: number;
  taskName: string;
  status: TaskStatus;
  summary: string;
  emotionPeak: string;
}

export interface ExecutionCaseRef {
  caseId: string;
  taskId: number;
  taskName: string;
  agentId: string;
  agentName: string;
  categoryId: string;
  categoryName: string;
  status: TaskStatus;
  emotionPeak: string;
  bottleneck: string;
}

export interface TestRunSnapshot {
  runId: string;
  createdAt: string;
  targetUrl?: string;
  selectedTaskIds: number[];
  categorySelections: AgentCategorySelection[];
  generatedAgents: GeneratedAgentPersona[];
  executions: TaskExecution[];
  caseRefs: ExecutionCaseRef[];
}

export interface QAFilter {
  taskId?: number;
  categoryId?: string;
  status?: TaskStatus;
  emotion?: AgentEmotion;
}

export interface QARequest {
  runId: string;
  question: string;
  scope: QAScope;
  caseId?: string;
  filters?: QAFilter;
}

export interface QAEvidence {
  caseId: string;
  taskId: number;
  taskName: string;
  step: number;
  excerpt: string;
}

export interface QAResponse {
  answer: string;
  mode: QAResponseMode;
  confidence: number;
  evidence: QAEvidence[];
  relatedCases: ExecutionCaseRef[];
}

export interface QAHistoryItem {
  id: string;
  createdAt: string;
  scope: QAScope;
  caseId?: string;
  question: string;
  response: QAResponse;
}

export interface TaskDetailCard {
  taskId: number;
  taskCode: string;
  title: string;
  difficulty: '简单' | '中等' | '困难';
  estimatedDuration: string;
  testScenario: string;
  operationSteps: string[];
  successCriteria: string[];
  tags: string[];
}

export interface ReportKPIOverview {
  averageCompletionRate: number;
  susScore: number;
  averageTaskDuration: string;
  averageErrorRate: number;
}

export interface TaskPerformanceRow {
  taskId: number;
  taskName: string;
  completionRate: number;
  averageDuration: string;
  errorPerTask: number;
  helpRequests: number;
  status: TaskPerformanceStatus;
}

export interface SUSRangeReference {
  min: number;
  max: number;
  label: string;
  level: string;
  tone: MetricTone;
}

export interface SUSQuestionScore {
  id: number;
  question: string;
  score: number;
  polarity: 'positive' | 'negative';
}

export interface SUSReport {
  totalScore: number;
  grade: string;
  acceptability: string;
  percentileRank: number;
  rangeReferences: SUSRangeReference[];
  questionScores: SUSQuestionScore[];
}

export interface NasaTlxDimension {
  id: 'mental' | 'physical' | 'temporal' | 'performance' | 'effort' | 'frustration';
  label: string;
  value: number;
  description: string;
  tone: MetricTone;
}

export interface NasaTlxReport {
  dimensions: NasaTlxDimension[];
  wwl: number;
  summary: string;
  strengths: string[];
  risks: string[];
}

export interface ReportNavSection {
  id: string;
  label: string;
}

export interface FinalReportBundle {
  runId: string;
  tier: ReportTemplateTier;
  generatedAt: string;
  kpi: ReportKPIOverview;
  taskDetails: TaskDetailCard[];
  taskPerformance: TaskPerformanceRow[];
  sus: SUSReport;
  nasaTlx: NasaTlxReport;
  navigation: ReportNavSection[];
}

export interface AppState {
  currentStep: Step;
  targetUrl: string;
  diagnosis: DiagnosisItem[];
  tasks: Task[];
  selectedTasks: number[];
  categoryTemplates: AgentCategoryTemplate[];
  categorySelections: AgentCategorySelection[];
  generatedAgents: GeneratedAgentPersona[];
  executions: TaskExecution[];
  currentRunSnapshot: TestRunSnapshot | null;
  selectedCaseId: string | null;
  qaHistory: QAHistoryItem[];
  quantitativeMetrics: QuantitativeMetric[];
  qualitativeInsights: QualitativeInsight[];
  categorySummary: CategoryReportItem[];
  representativeSamples: RepresentativeSample[];
  recommendations: string[];
  finalReportBundle: FinalReportBundle | null;
}
