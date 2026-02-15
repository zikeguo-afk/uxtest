import type { LLMEnhanceInput, LLMEnhanceOutput } from '../types/domain';

export interface LLMHealthReport {
  provider: string;
  model: string;
  configured: boolean;
  reachable: boolean;
  message: string;
  checkedAt: string;
}

export interface LLMAdapter {
  kind: string;
  enhanceInference(input: LLMEnhanceInput): Promise<LLMEnhanceOutput> | LLMEnhanceOutput;
  getResponsibilities(): string[];
  healthCheck?(probe?: boolean): Promise<LLMHealthReport> | LLMHealthReport;
}
