import { useCallback, useState } from 'react';
import { defaultAgentCategories } from '@/data/mock/agentCategories';
import { defaultTasks } from '@/data/mock/tasks';
import { apiProvider } from '@/services/apiProvider';
import { mockProvider } from '@/services/mockProvider';
import { buildFinalReportBundle } from '@/services/finalReportBuilder';
import type { UXAgentProvider, UXAgentReport } from '@/services/uxAgentProvider';
import type {
  AgentCategorySelection,
  AgentCategoryTemplate,
  CategoryReportItem,
  DiagnosisItem,
  ExecutionRequest,
  FinalReportBundle,
  GeneratedAgentPersona,
  QAFilter,
  QAHistoryItem,
  QARequest,
  QAResponse,
  QualitativeInsight,
  QuantitativeMetric,
  RepresentativeSample,
  Step,
  Task,
  TaskExecution,
  TestRunSnapshot,
  TraitProfile,
} from '@/types';

const MAX_CATEGORY_COUNT = 20;
const MIN_SELECTED_TASKS = 3;
const MAX_SELECTED_TASKS = 10;
const MAX_EXECUTION_CASES = (() => {
  const rawValue = Number(import.meta.env.VITE_MAX_EXECUTION_CASES ?? 40);
  if (!Number.isFinite(rawValue) || rawValue <= 0) {
    return 40;
  }
  return Math.min(Math.floor(rawValue), 40);
})();

const providers: Record<string, UXAgentProvider> = {
  api: apiProvider,
  mock: mockProvider,
};

function resolveDefaultProvider(): UXAgentProvider {
  const providerName = import.meta.env.VITE_UX_AGENT_PROVIDER ?? 'mock';
  return providers[providerName] ?? mockProvider;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function cloneTasks(tasks: Task[]): Task[] {
  return tasks.map((task) => ({ ...task }));
}

function cloneCategoryTemplates(templates: AgentCategoryTemplate[]): AgentCategoryTemplate[] {
  return templates.map((template) => ({
    ...template,
    emotionalBase: [...template.emotionalBase],
    baseTraits: { ...template.baseTraits },
  }));
}

function createDefaultCategorySelections(
  templates: AgentCategoryTemplate[],
): AgentCategorySelection[] {
  return templates.map((template) => ({
    categoryId: template.id,
    count: 0,
  }));
}

function parseSequence(name: string): number {
  const matched = name.match(/-(\d+)$/);
  if (!matched) {
    return 1;
  }
  return Number.parseInt(matched[1], 10);
}

function normalizeTraits(traits: Partial<TraitProfile> | undefined): TraitProfile {
  return {
    patience: traits?.patience ?? 50,
    techSavvy: traits?.techSavvy ?? 50,
    attention: traits?.attention ?? 50,
  };
}

function extractGeneratedAgents(executions: TaskExecution[]): GeneratedAgentPersona[] {
  const map = new Map<string, GeneratedAgentPersona>();

  for (const execution of executions) {
    if (map.has(execution.agentId)) {
      continue;
    }
    const categoryName = execution.agentCategoryName ?? execution.agentName.split('-')[0] ?? '未知类别';
    map.set(execution.agentId, {
      id: execution.agentId,
      categoryId: execution.agentCategoryId ?? `generated-${categoryName}`,
      categoryName,
      sequence: parseSequence(execution.agentName),
      name: execution.agentName,
      avatar: execution.agentAvatar ?? '🤖',
      persona: '',
      emotionalBase: [],
      goal: execution.agentGoal ?? '效率优先',
      traits: normalizeTraits(undefined),
    });
  }

  return [...map.values()];
}

async function safeGetDiagnosis(provider: UXAgentProvider, targetUrl: string): Promise<DiagnosisItem[]> {
  try {
    return await provider.getDiagnosis(targetUrl);
  } catch (error) {
    console.error('Provider getDiagnosis failed, falling back to mockProvider.', error);
    return mockProvider.getDiagnosis(targetUrl);
  }
}

async function safeGetExecutions(
  provider: UXAgentProvider,
  request: ExecutionRequest,
): Promise<TaskExecution[]> {
  try {
    return await provider.getExecutions(request);
  } catch (error) {
    console.error('Provider getExecutions failed, falling back to mockProvider.', error);
    return mockProvider.getExecutions(request);
  }
}

async function safeCreateRunSnapshot(
  provider: UXAgentProvider,
  request: ExecutionRequest,
): Promise<TestRunSnapshot> {
  try {
    return await provider.createRunSnapshot(request);
  } catch (error) {
    console.error('Provider createRunSnapshot failed, falling back to mockProvider.', error);
    return mockProvider.createRunSnapshot(request);
  }
}

async function safeGetReport(
  provider: UXAgentProvider,
  executions: TaskExecution[],
): Promise<UXAgentReport> {
  try {
    return await provider.getReport(executions);
  } catch (error) {
    console.error('Provider getReport failed, falling back to mockProvider.', error);
    return mockProvider.getReport(executions);
  }
}

async function safeAskQuestion(
  provider: UXAgentProvider,
  request: QARequest,
  snapshot: TestRunSnapshot,
): Promise<QAResponse> {
  try {
    return await provider.askQuestion(request, snapshot);
  } catch (error) {
    console.error('Provider askQuestion failed, falling back to mockProvider.', error);
    return mockProvider.askQuestion(request, snapshot);
  }
}

function buildHistoryId(): string {
  return `qa-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
}

export function useUXAgent(provider: UXAgentProvider = resolveDefaultProvider()) {
  const [currentStep, setCurrentStep] = useState<Step>('init');
  const [targetUrl, setTargetUrl] = useState('');
  const [diagnosis, setDiagnosis] = useState<DiagnosisItem[]>([]);
  const [tasks, setTasks] = useState<Task[]>(() => cloneTasks(defaultTasks));
  const [selectedTasks, setSelectedTasks] = useState<number[]>([]);
  const [categoryTemplates] = useState<AgentCategoryTemplate[]>(() =>
    cloneCategoryTemplates(defaultAgentCategories),
  );
  const [categorySelections, setCategorySelections] = useState<AgentCategorySelection[]>(() =>
    createDefaultCategorySelections(defaultAgentCategories),
  );
  const [generatedAgents, setGeneratedAgents] = useState<GeneratedAgentPersona[]>([]);
  const [executions, setExecutions] = useState<TaskExecution[]>([]);
  const [currentRunSnapshot, setCurrentRunSnapshot] = useState<TestRunSnapshot | null>(null);
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);
  const [qaHistory, setQAHistory] = useState<QAHistoryItem[]>([]);
  const [quantitativeMetrics, setQuantitativeMetrics] = useState<QuantitativeMetric[]>([]);
  const [qualitativeInsights, setQualitativeInsights] = useState<QualitativeInsight[]>([]);
  const [categorySummary, setCategorySummary] = useState<CategoryReportItem[]>([]);
  const [representativeSamples, setRepresentativeSamples] = useState<RepresentativeSample[]>([]);
  const [recommendations, setRecommendations] = useState<string[]>([]);
  const [finalReportBundle, setFinalReportBundle] = useState<FinalReportBundle | null>(null);

  const appendHistory = useCallback(
    (scope: 'case' | 'global', question: string, response: QAResponse, caseId?: string) => {
      setQAHistory((prev) => {
        const next: QAHistoryItem = {
          id: buildHistoryId(),
          createdAt: new Date().toISOString(),
          scope,
          caseId,
          question,
          response,
        };
        return [next, ...prev].slice(0, 40);
      });
    },
    [],
  );

  const goToStep = useCallback((step: Step) => {
    setCurrentStep(step);
  }, []);

  const updateUrl = useCallback((url: string) => {
    setTargetUrl(url);
  }, []);

  const generateDiagnosis = useCallback(async () => {
    const result = await safeGetDiagnosis(provider, targetUrl);
    setDiagnosis(result);
  }, [provider, targetUrl]);

  const toggleTask = useCallback((taskId: number) => {
    setTasks((prev) =>
      prev.map((task) =>
        task.id === taskId ? { ...task, selected: !task.selected } : task,
      ),
    );

    setSelectedTasks((prev) => {
      if (prev.includes(taskId)) {
        return prev.filter((id) => id !== taskId);
      }
      if (prev.length >= MAX_SELECTED_TASKS) {
        return prev;
      }
      return [...prev, taskId];
    });
  }, []);

  const updateCategoryCount = useCallback((categoryId: string, nextCount: number) => {
    setCategorySelections((prev) =>
      prev.map((selection) =>
        selection.categoryId === categoryId
          ? { ...selection, count: clamp(nextCount, 0, MAX_CATEGORY_COUNT) }
          : selection,
      ),
    );
  }, []);

  const incrementCategoryCount = useCallback((categoryId: string) => {
    setCategorySelections((prev) =>
      prev.map((selection) =>
        selection.categoryId === categoryId
          ? { ...selection, count: clamp(selection.count + 1, 0, MAX_CATEGORY_COUNT) }
          : selection,
      ),
    );
  }, []);

  const decrementCategoryCount = useCallback((categoryId: string) => {
    setCategorySelections((prev) =>
      prev.map((selection) =>
        selection.categoryId === categoryId
          ? { ...selection, count: clamp(selection.count - 1, 0, MAX_CATEGORY_COUNT) }
          : selection,
      ),
    );
  }, []);

  const resetCategorySelections = useCallback(() => {
    setCategorySelections(createDefaultCategorySelections(categoryTemplates));
  }, [categoryTemplates]);

  const generateExecutions = useCallback(async () => {
    const request: ExecutionRequest = {
      targetUrl,
      selectedTaskIds: selectedTasks,
      categorySelections,
      maxCases: MAX_EXECUTION_CASES,
    };

    const snapshot = await safeCreateRunSnapshot(provider, request);
    const nextExecutions =
      snapshot.executions.length > 0 ? snapshot.executions : await safeGetExecutions(provider, request);

    setCurrentRunSnapshot(snapshot);
    setExecutions(nextExecutions);
    setGeneratedAgents(snapshot.generatedAgents.length > 0 ? snapshot.generatedAgents : extractGeneratedAgents(nextExecutions));
    setSelectedCaseId(nextExecutions[0]?.caseId ?? null);
    setQAHistory([]);
    setFinalReportBundle(null);
  }, [categorySelections, provider, selectedTasks, targetUrl]);

  const generateReport = useCallback(async () => {
    const report = await safeGetReport(provider, executions);
    const bundle = buildFinalReportBundle({
      runSnapshot: currentRunSnapshot,
      quantitativeMetrics: report.quantitativeMetrics,
      categorySummary: report.categorySummary,
      representativeSamples: report.representativeSamples,
    });

    setQuantitativeMetrics(report.quantitativeMetrics);
    setQualitativeInsights(report.qualitativeInsights);
    setCategorySummary(report.categorySummary);
    setRepresentativeSamples(report.representativeSamples);
    setRecommendations(report.recommendations);
    setFinalReportBundle(bundle);
  }, [currentRunSnapshot, executions, provider]);

  const selectCase = useCallback((caseId: string) => {
    setSelectedCaseId(caseId);
  }, []);

  const askCaseQuestion = useCallback(
    async (question: string, caseIdOverride?: string) => {
      const normalizedQuestion = question.trim();
      if (!normalizedQuestion || !currentRunSnapshot) {
        return null;
      }

      const caseId = caseIdOverride ?? selectedCaseId ?? undefined;
      const request: QARequest = {
        runId: currentRunSnapshot.runId,
        question: normalizedQuestion,
        scope: 'case',
        caseId,
      };

      const response = await safeAskQuestion(provider, request, currentRunSnapshot);
      appendHistory('case', normalizedQuestion, response, caseId);

      if (caseIdOverride) {
        setSelectedCaseId(caseIdOverride);
      }

      return response;
    },
    [appendHistory, currentRunSnapshot, provider, selectedCaseId],
  );

  const askGlobalQuestion = useCallback(
    async (question: string, filters?: QAFilter) => {
      const normalizedQuestion = question.trim();
      if (!normalizedQuestion || !currentRunSnapshot) {
        return null;
      }

      const request: QARequest = {
        runId: currentRunSnapshot.runId,
        question: normalizedQuestion,
        scope: 'global',
        filters,
      };

      const response = await safeAskQuestion(provider, request, currentRunSnapshot);
      appendHistory('global', normalizedQuestion, response);
      return response;
    },
    [appendHistory, currentRunSnapshot, provider],
  );

  const reset = useCallback(() => {
    setCurrentStep('init');
    setTargetUrl('');
    setDiagnosis([]);
    setTasks(cloneTasks(defaultTasks));
    setSelectedTasks([]);
    setCategorySelections(createDefaultCategorySelections(categoryTemplates));
    setGeneratedAgents([]);
    setExecutions([]);
    setCurrentRunSnapshot(null);
    setSelectedCaseId(null);
    setQAHistory([]);
    setQuantitativeMetrics([]);
    setQualitativeInsights([]);
    setCategorySummary([]);
    setRepresentativeSamples([]);
    setRecommendations([]);
    setFinalReportBundle(null);
  }, [categoryTemplates]);

  return {
    currentStep,
    targetUrl,
    diagnosis,
    tasks,
    selectedTasks,
    categoryTemplates,
    categorySelections,
    generatedAgents,
    executions,
    currentRunSnapshot,
    selectedCaseId,
    qaHistory,
    quantitativeMetrics,
    qualitativeInsights,
    categorySummary,
    representativeSamples,
    recommendations,
    finalReportBundle,
    minSelectedTasks: MIN_SELECTED_TASKS,
    maxSelectedTasks: MAX_SELECTED_TASKS,
    goToStep,
    updateUrl,
    generateDiagnosis,
    toggleTask,
    updateCategoryCount,
    incrementCategoryCount,
    decrementCategoryCount,
    resetCategorySelections,
    generateExecutions,
    generateReport,
    selectCase,
    askCaseQuestion,
    askGlobalQuestion,
    reset,
  };
}
