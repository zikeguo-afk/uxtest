import type { ExecutionSamplePair, GeneratedAgentPersona } from '../types/domain';

function randomUnit(): number {
  const cryptoRef = globalThis.crypto;
  if (cryptoRef && typeof cryptoRef.getRandomValues === 'function') {
    const arr = new Uint32Array(1);
    cryptoRef.getRandomValues(arr);
    return arr[0] / 0x100000000;
  }
  return Math.random();
}

function shuffle<T>(input: T[]): T[] {
  const arr = [...input];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(randomUnit() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function pairKey(pair: ExecutionSamplePair): string {
  return `${pair.taskId}::${pair.generatedAgentId}`;
}

function buildCategoryTargets(
  agents: GeneratedAgentPersona[],
  budget: number,
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const agent of agents) {
    counts.set(agent.categoryId, (counts.get(agent.categoryId) ?? 0) + 1);
  }

  const totalAgents = agents.length;
  const targets = new Map<string, number>();
  const remainderPool: Array<{ categoryId: string; remainder: number }> = [];
  let allocated = 0;

  for (const [categoryId, count] of counts) {
    const raw = (count / totalAgents) * budget;
    const base = Math.floor(raw);
    targets.set(categoryId, base);
    allocated += base;
    remainderPool.push({ categoryId, remainder: raw - base });
  }

  remainderPool.sort((a, b) => b.remainder - a.remainder);
  let remaining = budget - allocated;
  let index = 0;
  while (remaining > 0 && remainderPool.length > 0) {
    const item = remainderPool[index % remainderPool.length];
    targets.set(item.categoryId, (targets.get(item.categoryId) ?? 0) + 1);
    remaining -= 1;
    index += 1;
  }

  return targets;
}

export function sampleExecutionPairs(
  selectedTaskIds: number[],
  generatedAgents: GeneratedAgentPersona[],
  maxCases: number,
): ExecutionSamplePair[] {
  const uniqueTaskIds = Array.from(new Set(selectedTaskIds));
  if (uniqueTaskIds.length === 0 || generatedAgents.length === 0 || maxCases <= 0) {
    return [];
  }

  const allPairs: ExecutionSamplePair[] = [];
  for (const taskId of uniqueTaskIds) {
    for (const agent of generatedAgents) {
      allPairs.push({ taskId, generatedAgentId: agent.id });
    }
  }

  const budget = Math.min(maxCases, allPairs.length);
  if (budget <= 0) {
    return [];
  }

  const selected: ExecutionSamplePair[] = [];
  const used = new Set<string>();
  const agentById = new Map(generatedAgents.map((agent) => [agent.id, agent]));
  const shuffledAgents = shuffle(generatedAgents);
  const coveredTasks = shuffle(uniqueTaskIds).slice(0, Math.min(uniqueTaskIds.length, budget));

  for (const taskId of coveredTasks) {
    const agent = shuffledAgents[Math.floor(randomUnit() * shuffledAgents.length)];
    const pair = { taskId, generatedAgentId: agent.id };
    selected.push(pair);
    used.add(pairKey(pair));
  }

  const targets = buildCategoryTargets(generatedAgents, budget);
  const currentCategoryCounts = new Map<string, number>();
  for (const pair of selected) {
    const categoryId = agentById.get(pair.generatedAgentId)?.categoryId;
    if (categoryId) {
      currentCategoryCounts.set(categoryId, (currentCategoryCounts.get(categoryId) ?? 0) + 1);
    }
  }

  const remainingByCategory = new Map<string, ExecutionSamplePair[]>();
  for (const pair of allPairs) {
    if (used.has(pairKey(pair))) {
      continue;
    }
    const categoryId = agentById.get(pair.generatedAgentId)?.categoryId;
    if (!categoryId) {
      continue;
    }
    const list = remainingByCategory.get(categoryId) ?? [];
    list.push(pair);
    remainingByCategory.set(categoryId, list);
  }
  for (const [categoryId, pairs] of remainingByCategory) {
    remainingByCategory.set(categoryId, shuffle(pairs));
  }

  while (selected.length < budget) {
    const availableCategories = Array.from(remainingByCategory.entries())
      .filter(([, pairs]) => pairs.length > 0)
      .map(([categoryId]) => categoryId);
    if (availableCategories.length === 0) {
      break;
    }

    const categoryByDeficit = [...availableCategories].sort((a, b) => {
      const deficitA = (targets.get(a) ?? 0) - (currentCategoryCounts.get(a) ?? 0);
      const deficitB = (targets.get(b) ?? 0) - (currentCategoryCounts.get(b) ?? 0);
      return deficitB - deficitA;
    });

    const preferredCategory = categoryByDeficit[0];
    const topDeficit =
      (targets.get(preferredCategory) ?? 0) - (currentCategoryCounts.get(preferredCategory) ?? 0);
    const pickedCategory =
      topDeficit > 0
        ? preferredCategory
        : availableCategories[Math.floor(randomUnit() * availableCategories.length)];

    const bucket = remainingByCategory.get(pickedCategory);
    if (!bucket || bucket.length === 0) {
      continue;
    }

    const nextPair = bucket.pop();
    if (!nextPair || used.has(pairKey(nextPair))) {
      continue;
    }

    selected.push(nextPair);
    used.add(pairKey(nextPair));
    currentCategoryCounts.set(
      pickedCategory,
      (currentCategoryCounts.get(pickedCategory) ?? 0) + 1,
    );
  }

  return selected;
}
