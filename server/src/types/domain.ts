export type TaskStatus = 'pending' | 'running' | 'success' | 'failed';

export type AgentEmotion = 'neutral' | 'frustrated' | 'angry' | 'anxious' | 'satisfied';

export type QAScope = 'case' | 'global';

export type QAResponseMode = 'evidence' | 'inference';

export type ReportTemplateTier = 'excellent' | 'medium' | 'needs-improvement';

export type TaskPerformanceStatus = 'healthy' | 'warning' | 'risk';

export type MetricTone = 'positive' | 'neutral' | 'negative';
export type EvidenceSource = 'dom' | 'interaction' | 'route-script' | 'text';

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
  difficulty?: '简单' | '中等' | '困难';
  estimatedDuration?: string;
  testScenario?: string;
  operationSteps?: string[];
  successCriteria?: string[];
  tags?: string[];
  evidenceRefs?: string[];
  evidenceReason?: string;
}

export interface TaskDetailValidationIssue {
  taskId: number;
  taskName: string;
  reasons: string[];
}

export interface EvidenceRefItem {
  refId: string;
  source: EvidenceSource;
  label: string;
  excerpt: string;
}

export interface DiagnosisItem {
  dimension: string;
  status: 'success' | 'warning' | 'error';
  description: string;
}

export interface TaskGenerationStatus {
  status: 'success' | 'degraded' | 'failed';
  code: string;
  message: string;
  blocked: boolean;
  candidateCount?: number;
  acceptedCount?: number;
  rejectedCount?: number;
  quality?: {
    autoFilledCount?: number;
    syntheticCount?: number;
    rewrittenNameCount?: number;
    weakGateWarnings?: number;
    llmCompletionPasses?: number;
    llmGeneratedCount?: number;
    nonLlmGeneratedCount?: number;
    nameRewrittenCount?: number;
    nameReadableCount?: number;
    namePolishPasses?: number;
    nameJargonRejectedCount?: number;
  };
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
  behaviorBias?: string;
  languageStyle?: string;
  frictionSensitivity?: number;
}

export type LiveExecutionActionType =
  | 'click'
  | 'type'
  | 'select'
  | 'wait'
  | 'scroll'
  | 'assert'
  | 'finish'
  | 'fail';

export interface LiveExecutionAction {
  type: LiveExecutionActionType;
  selector?: string;
  text?: string;
  optionValue?: string;
  waitMs?: number;
  direction?: 'up' | 'down';
  expected?: string;
  reason?: string;
}

export interface LiveExecutionStepEvidence {
  urlBefore: string;
  urlAfter: string;
  domExcerpt: string;
  screenshotPath?: string;
}

export interface ExecutionStep {
  step: number;
  role: 'observer' | 'decider' | 'executor' | 'feedback';
  content: string;
  plannedStep?: string;
  actualAction?: LiveExecutionAction;
  observation?: string;
  result?: 'success' | 'failed' | 'skipped';
  evidence?: LiveExecutionStepEvidence;
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
  taskCatalog?: Array<Omit<Task, 'selected'>>;
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
  runnerMode?: 'simulated' | 'live-browser';
  personaVersion?: string;
  selectedTaskIds: number[];
  taskCatalog?: Task[];
  categorySelections: AgentCategorySelection[];
  generatedAgents: GeneratedAgentPersona[];
  executions: TaskExecution[];
  caseRefs: ExecutionCaseRef[];
}

export type ExecutionJobStatus = 'queued' | 'running' | 'completed' | 'failed';

export interface LiveExecutionCaseState {
  caseId: string;
  taskId: number;
  taskName: string;
  agentId: string;
  agentName: string;
  status: TaskStatus | 'queued';
  stepCount: number;
  lastStepPreview?: string;
  error?: string;
}

export interface ExecutionJobProgress {
  jobId: string;
  runId: string;
  status: ExecutionJobStatus;
  totalCases: number;
  finishedCases: number;
  currentCaseId: string | null;
  cases: LiveExecutionCaseState[];
  message: string;
  updatedAt: string;
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

export interface UXAgentReport {
  quantitativeMetrics: QuantitativeMetric[];
  qualitativeInsights: QualitativeInsight[];
  categorySummary: CategoryReportItem[];
  representativeSamples: RepresentativeSample[];
  recommendations: string[];
}

export interface FullReportResponse extends UXAgentReport {
  finalReportBundle: FinalReportBundle;
}

export interface BuildSnapshotResult {
  snapshot: TestRunSnapshot;
  executions: TaskExecution[];
}

export interface LLMEnhanceInput {
  question: string;
  scope: QAScope;
  draftAnswer: string;
  evidence: QAEvidence[];
}

export interface LLMEnhanceOutput {
  answer: string;
  confidenceDelta?: number;
}

export interface LLMPersonaGenerationInput {
  targetUrl?: string;
  categoryName: string;
  categoryPersona: string;
  categoryGoal: string;
  emotionalBase: string[];
  baseTraits: TraitProfile;
  count: number;
}

export interface LLMPersonaGenerationOutput {
  profiles: Array<{
    persona: string;
    goal?: string;
    behaviorBias?: string;
    languageStyle?: string;
    frictionSensitivity?: number;
    traits: TraitProfile;
  }>;
}

export interface LLMExecutionPlanInput {
  targetUrl: string;
  task: Omit<Task, 'selected'>;
  persona: GeneratedAgentPersona;
}

export interface LLMExecutionPlanOutput {
  summary: string;
  plannedSteps: string[];
}

export interface LLMStepDecisionInput {
  targetUrl: string;
  task: Omit<Task, 'selected'>;
  persona: GeneratedAgentPersona;
  plannedSteps: string[];
  currentStepIndex: number;
  executedStepSummaries: string[];
  pageObservation: {
    url: string;
    title: string;
    textSnippet: string;
    elementHints: Array<{
      selector: string;
      label: string;
      role: string;
    }>;
  };
}

export interface LLMStepDecisionOutput {
  action: LiveExecutionAction;
}

export interface LLMTaskCatalogItem {
  id: number;
  name: string;
  description: string;
}

export interface LLMTaskProposal extends LLMTaskCatalogItem {
  difficulty?: '简单' | '中等' | '困难';
  estimatedDuration?: string;
  testScenario?: string;
  operationSteps?: string[];
  successCriteria?: string[];
  tags?: string[];
  evidenceRefs?: string[];
  evidenceReason?: string;
}

export type SourceArtifactType =
  | 'html'
  | 'javascript'
  | 'css'
  | 'json'
  | 'inline-script'
  | 'text';

export interface CollectedSourceFailure {
  url: string;
  reason: string;
}

export interface CollectedSourceArtifact {
  artifactId: string;
  url: string;
  type: SourceArtifactType;
  content: string;
  hash: string;
  bytes: number;
  status: 'fetched' | 'failed';
  error?: string;
}

export interface CollectedSourceBundle {
  targetUrl: string;
  finalUrl: string;
  mainDocument: CollectedSourceArtifact;
  artifacts: CollectedSourceArtifact[];
  stats: {
    artifactCount: number;
    totalBytes: number;
    durationMs: number;
    failedArtifacts: CollectedSourceFailure[];
  };
}

export interface PackagedCodeChunk {
  chunkId: string;
  artifactIds: string[];
  content: string;
  bytes: number;
  tokenEstimate: number;
}

export interface PackagedCodeResult {
  chunks: PackagedCodeChunk[];
  chunkCount: number;
  artifactCount: number;
  totalBytes: number;
  totalTokenEstimate: number;
}

export interface LLMCrawlStageInput {
  targetUrl: string;
  sourceBundle: CollectedSourceBundle;
  packagedCode: PackagedCodeResult;
}

export interface LLMCrawlStageOutput {
  finalUrl: string;
  statusCode: number;
  loadTimeMs: number;
  title: string;
  language: string;
  summary: string;
}

export interface LLMStructureStageInput {
  targetUrl: string;
  sourceBundle: CollectedSourceBundle;
  packagedCode: PackagedCodeResult;
  crawl: LLMCrawlStageOutput;
}

export interface LLMStructureStageOutput {
  summary: string;
  pageSummary: LLMAnalysisInput['pageSummary'];
}

export interface LLMRiskStageInput {
  targetUrl: string;
  sourceBundle: CollectedSourceBundle;
  packagedCode: PackagedCodeResult;
  crawl: LLMCrawlStageOutput;
  structure: LLMStructureStageOutput;
}

export interface LLMRiskStageOutput {
  summary: string;
  diagnosisItems: DiagnosisItem[];
}

export interface LLMTaskStageInput {
  targetUrl: string;
  sourceBundle: CollectedSourceBundle;
  packagedCode: PackagedCodeResult;
  crawl: LLMCrawlStageOutput;
  structure: LLMStructureStageOutput;
  risk: LLMRiskStageOutput;
  taskCatalog: LLMTaskCatalogItem[];
}

export interface LLMTaskStageOutput {
  summary: string;
  prioritizedTaskIds: number[];
  taskProposals: LLMTaskProposal[];
}

export interface LLMStageResult<T> {
  output: T;
  attempts: number;
  repaired: boolean;
  rawSnippet?: string;
  degraded?: boolean;
  quality?: {
    autoFilledCount?: number;
    syntheticCount?: number;
    rewrittenNameCount?: number;
    weakGateWarnings?: number;
    llmCompletionPasses?: number;
    llmGeneratedCount?: number;
    nonLlmGeneratedCount?: number;
    nameRewrittenCount?: number;
    nameReadableCount?: number;
    namePolishPasses?: number;
    nameJargonRejectedCount?: number;
  };
}

export interface LLMStageError {
  stage: 'crawl' | 'structure' | 'risk' | 'tasks';
  attempt: number;
  code: 'STAGE_SCHEMA_INVALID' | 'STAGE_TIMEOUT' | 'STAGE_PROVIDER_ERROR';
  message: string;
  rawSnippet?: string;
}

export interface LLMAnalysisInput {
  targetUrl: string;
  pageSummary: {
    finalUrl: string;
    title: string;
    language: string;
    statusCode: number;
    loadTimeMs: number;
    hasViewportMeta: boolean;
    hasMainLandmark: boolean;
    interactiveCount: number;
    formsCount: number;
    imagesCount: number;
    imagesWithoutAlt: number;
    headingsCount: number;
    headingsText: string[];
    primaryLinks: string[];
    primaryButtons: string[];
    primaryInputs: string[];
    bodyPreview: string;
    codeCapabilities: string[];
    evidenceRefs: EvidenceRefItem[];
    allowedEvidenceRefIds: string[];
  };
  heuristicDiagnosis: DiagnosisItem[];
  taskCatalog: LLMTaskCatalogItem[];
}

export interface LLMAnalysisOutput {
  diagnosisItems: DiagnosisItem[];
  prioritizedTaskIds: number[];
  taskProposals: LLMTaskProposal[];
}
