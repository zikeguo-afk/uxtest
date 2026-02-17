import { z } from 'zod';

const evidenceSourceSchema = z.enum(['dom', 'interaction', 'route-script', 'text']);

const evidenceRefSchema = z.object({
  refId: z.string().min(1),
  source: evidenceSourceSchema,
  label: z.string().min(1),
  excerpt: z.string().min(1),
});

const diagnosisItemSchema = z.object({
  dimension: z.string().min(1),
  status: z.enum(['success', 'warning', 'error']),
  description: z.string().min(1),
});

const taskProposalSchema = z.object({
  id: z.number().int().positive(),
  name: z.string().min(1),
  description: z.string().min(1),
  difficulty: z.enum(['简单', '中等', '困难']).optional(),
  estimatedDuration: z.string().min(1),
  testScenario: z.string().min(1),
  operationSteps: z.array(z.string().min(1)).min(3),
  successCriteria: z.array(z.string().min(1)).min(2),
  tags: z.array(z.string().min(1)).optional(),
  evidenceRefs: z.array(z.string().min(1)).min(1),
  evidenceReason: z.string().min(1),
});

export const llmCrawlStageSchema = z.object({
  finalUrl: z.string().min(1),
  statusCode: z.number().int().min(100).max(599),
  loadTimeMs: z.number().int().nonnegative(),
  title: z.string().min(1),
  language: z.string().min(1),
  summary: z.string().min(1),
});

export const llmStructureStageSchema = z.object({
  summary: z.string().min(1),
  pageSummary: z.object({
    finalUrl: z.string().min(1),
    title: z.string().min(1),
    language: z.string().min(1),
    statusCode: z.number().int().min(100).max(599),
    loadTimeMs: z.number().int().nonnegative(),
    hasViewportMeta: z.boolean(),
    hasMainLandmark: z.boolean(),
    interactiveCount: z.number().int().nonnegative(),
    formsCount: z.number().int().nonnegative(),
    imagesCount: z.number().int().nonnegative(),
    imagesWithoutAlt: z.number().int().nonnegative(),
    headingsCount: z.number().int().nonnegative(),
    headingsText: z.array(z.string()),
    primaryLinks: z.array(z.string()),
    primaryButtons: z.array(z.string()),
    primaryInputs: z.array(z.string()),
    bodyPreview: z.string(),
    codeCapabilities: z.array(z.string()),
    evidenceRefs: z.array(evidenceRefSchema).min(1),
    allowedEvidenceRefIds: z.array(z.string().min(1)).min(1),
  }),
});

export const llmRiskStageSchema = z.object({
  summary: z.string().min(1),
  diagnosisItems: z.array(diagnosisItemSchema).min(1),
});

export const llmTaskStageSchema = z.object({
  summary: z.string().min(1),
  prioritizedTaskIds: z.array(z.number().int().positive()).min(1),
  taskProposals: z.array(taskProposalSchema).min(1),
});

export type LLMCrawlStageSchema = z.infer<typeof llmCrawlStageSchema>;
export type LLMStructureStageSchema = z.infer<typeof llmStructureStageSchema>;
export type LLMRiskStageSchema = z.infer<typeof llmRiskStageSchema>;
export type LLMTaskStageSchema = z.infer<typeof llmTaskStageSchema>;
