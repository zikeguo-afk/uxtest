import type { LLMAdapter } from '../llm/adapter';
import type {
  AgentCategorySelection,
  AgentCategoryTemplate,
  GeneratedAgentPersona,
  TraitProfile,
} from '../types/domain';
import { generateCohort } from './cohort-generator';

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function randomIdSuffix(): string {
  return Math.floor(Math.random() * 1_000_000)
    .toString()
    .padStart(6, '0');
}

function normalizeTraits(traits: TraitProfile): TraitProfile {
  return {
    patience: clamp(Math.round(traits.patience), 0, 100),
    techSavvy: clamp(Math.round(traits.techSavvy), 0, 100),
    attention: clamp(Math.round(traits.attention), 0, 100),
  };
}

export async function generatePersonasWithLLM(
  selections: AgentCategorySelection[],
  categoryTemplates: AgentCategoryTemplate[],
  llmAdapter: LLMAdapter,
  targetUrl?: string,
): Promise<{ personas: GeneratedAgentPersona[]; source: 'llm' | 'fallback' }> {
  if (!llmAdapter.generatePersonas) {
    return {
      personas: generateCohort(selections, categoryTemplates),
      source: 'fallback',
    };
  }

  const templateMap = new Map(categoryTemplates.map((template) => [template.id, template]));
  const personas: GeneratedAgentPersona[] = [];

  try {
    for (const selection of selections) {
      if (selection.count <= 0) {
        continue;
      }
      const template = templateMap.get(selection.categoryId);
      if (!template) {
        continue;
      }

      const generated = await llmAdapter.generatePersonas({
        targetUrl,
        categoryName: template.name,
        categoryPersona: template.persona,
        categoryGoal: template.goal,
        emotionalBase: template.emotionalBase,
        baseTraits: template.baseTraits,
        count: selection.count,
      });

      for (let index = 0; index < selection.count; index += 1) {
        const profile = generated.profiles[index];
        const sequence = index + 1;
        const suffix = String(sequence).padStart(2, '0');
        personas.push({
          id: `${template.id}-${Date.now()}-${suffix}-${randomIdSuffix()}`,
          categoryId: template.id,
          categoryName: template.name,
          sequence,
          name: `${template.name}-${suffix}`,
          avatar: template.avatar,
          persona: profile?.persona ?? template.persona,
          emotionalBase: [...template.emotionalBase],
          goal: profile?.goal ?? template.goal,
          behaviorBias: profile?.behaviorBias ?? '平衡效率与准确',
          languageStyle: profile?.languageStyle ?? '简洁',
          frictionSensitivity: clamp(Math.round(profile?.frictionSensitivity ?? 50), 0, 100),
          traits: normalizeTraits(profile?.traits ?? template.baseTraits),
        });
      }
    }

    if (personas.length > 0) {
      return { personas, source: 'llm' };
    }
  } catch (error) {
    console.warn('[persona-llm-generator] failed, fallback to cohort-generator', error);
  }

  return {
    personas: generateCohort(selections, categoryTemplates),
    source: 'fallback',
  };
}
