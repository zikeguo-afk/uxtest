import { defaultAgentCategories } from '@/data/mock/agentCategories';

// Backward-compatible export for legacy imports.
export const defaultAgents = defaultAgentCategories.map((category) => ({
  id: category.id,
  name: category.name,
  avatar: category.avatar,
  persona: category.persona,
  emotionalBase: category.emotionalBase,
  goal: category.goal,
  traits: { ...category.baseTraits },
}));
