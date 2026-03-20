import type {
  LLMCrawlStageInput,
  LLMCrawlStageOutput,
  LLMRiskStageInput,
  LLMRiskStageOutput,
  LLMStageResult,
  LLMStructureStageInput,
  LLMStructureStageOutput,
  LLMTaskStageInput,
  LLMTaskStageOutput,
  LLMAnalysisInput,
  LLMAnalysisOutput,
  LLMEnhanceInput,
  LLMEnhanceOutput,
  LLMPersonaGenerationInput,
  LLMPersonaGenerationOutput,
  LLMExecutionPlanInput,
  LLMExecutionPlanOutput,
  LLMStepDecisionInput,
  LLMStepDecisionOutput,
} from '../types/domain';

export interface LLMHealthReport {
  provider: string;
  model: string;
  configured: boolean;
  reachable: boolean;
  message: string;
  checkedAt: string;
}

export interface StageSummaryInput {
  stageId: 'crawl' | 'structure' | 'risk' | 'tasks';
  stageLabel: string;
  runtimeDetail: string;
  detailRaw?: string;
}

export interface LLMAdapter {
  kind: string;
  enhanceInference(input: LLMEnhanceInput): Promise<LLMEnhanceOutput> | LLMEnhanceOutput;
  generatePersonas?(input: LLMPersonaGenerationInput): Promise<LLMPersonaGenerationOutput> | LLMPersonaGenerationOutput;
  planExecutionCase?(input: LLMExecutionPlanInput): Promise<LLMExecutionPlanOutput> | LLMExecutionPlanOutput;
  decideExecutionStep?(input: LLMStepDecisionInput): Promise<LLMStepDecisionOutput> | LLMStepDecisionOutput;
  runCrawlStage(input: LLMCrawlStageInput): Promise<LLMStageResult<LLMCrawlStageOutput>> | LLMStageResult<LLMCrawlStageOutput>;
  runStructureStage(input: LLMStructureStageInput): Promise<LLMStageResult<LLMStructureStageOutput>> | LLMStageResult<LLMStructureStageOutput>;
  runRiskStage(input: LLMRiskStageInput): Promise<LLMStageResult<LLMRiskStageOutput>> | LLMStageResult<LLMRiskStageOutput>;
  runTaskStage(input: LLMTaskStageInput): Promise<LLMStageResult<LLMTaskStageOutput>> | LLMStageResult<LLMTaskStageOutput>;
  generateDiagnosisAndTasks(input: LLMAnalysisInput): Promise<LLMAnalysisOutput> | LLMAnalysisOutput;
  summarizeStage?(input: StageSummaryInput): Promise<string> | string;
  getResponsibilities(): string[];
  healthCheck?(probe?: boolean): Promise<LLMHealthReport> | LLMHealthReport;
}
