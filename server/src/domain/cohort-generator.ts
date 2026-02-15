import type {
  AgentCategorySelection,
  AgentCategoryTemplate,
  GeneratedAgentPersona,
  TraitProfile,
} from '../types/domain';

const BASE_SPREAD = 6;
const GROWTH_FACTOR = 3.2;
const MAX_SPREAD = 26;
const MAX_CATEGORY_COUNT = 20;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function randomUnit(): number {
  const cryptoRef = globalThis.crypto;
  if (cryptoRef && typeof cryptoRef.getRandomValues === 'function') {
    const arr = new Uint32Array(1);
    cryptoRef.getRandomValues(arr);
    return arr[0] / 0x100000000;
  }
  return Math.random();
}

function randomSigned(): number {
  return randomUnit() * 2 - 1;
}

function randomIdSuffix(): string {
  return Math.floor(randomUnit() * 1_000_000).toString().padStart(6, '0');
}

function calculateSpread(count: number): number {
  const safeCount = Math.max(1, count);
  return Math.min(MAX_SPREAD, BASE_SPREAD + GROWTH_FACTOR * Math.sqrt(safeCount));
}

function jitterTraits(baseTraits: TraitProfile, spread: number): TraitProfile {
  const jitter = (base: number) => clamp(Math.round(base + randomSigned() * spread), 0, 100);
  return {
    patience: jitter(baseTraits.patience),
    techSavvy: jitter(baseTraits.techSavvy),
    attention: jitter(baseTraits.attention),
  };
}

export function generateCohort(
  selections: AgentCategorySelection[],
  categoryTemplates: AgentCategoryTemplate[],
): GeneratedAgentPersona[] {
  const templateMap = new Map(categoryTemplates.map((template) => [template.id, template]));
  const cohort: GeneratedAgentPersona[] = [];

  for (const selection of selections) {
    if (selection.count <= 0) {
      continue;
    }

    const template = templateMap.get(selection.categoryId);
    if (!template) {
      continue;
    }

    const count = clamp(selection.count, 0, MAX_CATEGORY_COUNT);
    const spread = calculateSpread(count);
    const now = Date.now();

    for (let index = 0; index < count; index += 1) {
      const sequence = index + 1;
      const suffix = String(sequence).padStart(2, '0');
      cohort.push({
        id: `${template.id}-${now}-${suffix}-${randomIdSuffix()}`,
        categoryId: template.id,
        categoryName: template.name,
        sequence,
        name: `${template.name}-${suffix}`,
        avatar: template.avatar,
        persona: template.persona,
        emotionalBase: [...template.emotionalBase],
        goal: template.goal,
        traits: jitterTraits(template.baseTraits, spread),
      });
    }
  }

  return cohort;
}
