import { useCallback, useState } from 'react';
import { defaultAgentCategories } from '@/data/mock/agentCategories';
import { apiProvider } from '@/services/apiProvider';
import { mockProvider } from '@/services/mockProvider';
import { buildFinalReportBundle } from '@/services/finalReportBuilder';
import type { DiagnosisResult, UXAgentProvider, UXAgentReport } from '@/services/uxAgentProvider';
import type {
  AnalysisProgressStatus,
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
  RuntimePhase,
  RuntimeStatus,
  Step,
  Task,
  TaskGenerationStatus,
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
const EXECUTION_JOB_POLL_INTERVAL_MS = (() => {
  const raw = Number(import.meta.env.VITE_EXECUTION_POLL_INTERVAL_MS ?? 800);
  if (!Number.isFinite(raw) || raw < 300) {
    return 800;
  }
  return Math.floor(raw);
})();
const EXECUTION_JOB_TIMEOUT_MS = (() => {
  const raw = Number(import.meta.env.VITE_EXECUTION_TIMEOUT_MS ?? 30 * 60 * 1000);
  if (!Number.isFinite(raw) || raw < 60_000) {
    return 30 * 60 * 1000;
  }
  return Math.floor(raw);
})();
const DEFAULT_TARGET_URL =
  import.meta.env.VITE_DEFAULT_TARGET_URL ?? 'https://frbe2kpuvbfve.ok.kimi.link';

const providers: Record<string, UXAgentProvider> = {
  api: apiProvider,
  mock: mockProvider,
};

const runtimePhaseLabels: Record<RuntimePhase, string> = {
  idle: '空闲',
  analysis: '分析中',
  sampling: '采样中',
  reporting: '生成报告中',
  qa: '追问处理中',
  error: '异常',
};

function resolveDefaultProvider(): UXAgentProvider {
  if (import.meta.env.MODE === 'test') {
    return mockProvider;
  }
  const providerName = import.meta.env.VITE_UX_AGENT_PROVIDER ?? 'api';
  return providers[providerName] ?? mockProvider;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
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

async function safeGetDiagnosis(
  provider: UXAgentProvider,
  targetUrl: string,
  onProgress?: (progress: AnalysisProgressStatus) => void,
): Promise<DiagnosisResult> {
  return provider.getDiagnosis(targetUrl, { onProgress });
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

async function safeStartExecutionJob(
  provider: UXAgentProvider,
  runId: string,
): Promise<{ jobId: string }> {
  try {
    return await provider.startExecutionJob(runId);
  } catch (error) {
    console.error('Provider startExecutionJob failed, falling back to mockProvider.', error);
    return mockProvider.startExecutionJob(runId);
  }
}

async function safeGetExecutionJobStatus(
  provider: UXAgentProvider,
  runId: string,
  jobId: string,
): Promise<{
  status: 'queued' | 'running' | 'completed' | 'failed';
  progress: {
    totalCases: number;
    finishedCases: number;
    currentCaseId: string | null;
    message: string;
    updatedAt: string;
  };
  snapshot: TestRunSnapshot | null;
  error: string | null;
}> {
  try {
    return await provider.getExecutionJobStatus(runId, jobId);
  } catch (error) {
    console.error('Provider getExecutionJobStatus failed, falling back to mockProvider.', error);
    return mockProvider.getExecutionJobStatus(runId, jobId);
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

function createRuntimeStatus(phase: RuntimePhase, lastError: string | null = null): RuntimeStatus {
  return {
    phase,
    label: runtimePhaseLabels[phase],
    isBusy: phase !== 'idle' && phase !== 'error',
    updatedAt: new Date().toISOString(),
    lastError,
  };
}

function toErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }
  return fallback;
}

function createTaskGenerationStatus(
  status: TaskGenerationStatus['status'] = 'failed',
  code = 'NOT_STARTED',
  message = '尚未生成任务。',
  blocked = true,
): TaskGenerationStatus {
  return {
    status,
    code,
    message,
    blocked,
  };
}

function cloneDiagnosisResult(result: DiagnosisResult): DiagnosisResult {
  return {
    items: result.items.map((item) => ({ ...item })),
    tasks: result.tasks.map((task) => ({
      ...task,
      selected: Boolean(task.selected),
      operationSteps: task.operationSteps ? [...task.operationSteps] : undefined,
      successCriteria: task.successCriteria ? [...task.successCriteria] : undefined,
      tags: task.tags ? [...task.tags] : undefined,
      evidenceRefs: task.evidenceRefs ? [...task.evidenceRefs] : undefined,
      evidenceReason: task.evidenceReason,
    })),
    taskGeneration: { ...result.taskGeneration },
    source: result.source,
  };
}

function cloneAnalysisProgress(progress: AnalysisProgressStatus): AnalysisProgressStatus {
  return {
    ...progress,
    stages: progress.stages.map((stage) => ({ ...stage })),
  };
}

export function useUXAgent(provider: UXAgentProvider = resolveDefaultProvider()) {
  const [currentStep, setCurrentStep] = useState<Step>('init');
  const [targetUrl, setTargetUrl] = useState(DEFAULT_TARGET_URL);
  const [runtimeStatus, setRuntimeStatus] = useState<RuntimeStatus>(() => createRuntimeStatus('idle'));
  const [analysisProgress, setAnalysisProgress] = useState<AnalysisProgressStatus | null>(null);
  const [diagnosis, setDiagnosis] = useState<DiagnosisItem[]>([]);
  const [taskGeneration, setTaskGeneration] = useState<TaskGenerationStatus>(() =>
    createTaskGenerationStatus(),
  );
  const [tasks, setTasks] = useState<Task[]>([]);
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

  const markRuntime = useCallback((phase: RuntimePhase, lastError: string | null = null) => {
    setRuntimeStatus(createRuntimeStatus(phase, lastError));
  }, []);

  const markRuntimeError = useCallback((error: unknown, fallbackMessage: string) => {
    setRuntimeStatus(createRuntimeStatus('error', toErrorMessage(error, fallbackMessage)));
  }, []);

  const updateUrl = useCallback((url: string) => {
    setTargetUrl(url);
  }, []);

  const generateDiagnosis = useCallback(async () => {
    markRuntime('analysis');
    setDiagnosis([]);
    setTaskGeneration(createTaskGenerationStatus());
    setTasks([]);
    setSelectedTasks([]);
    setAnalysisProgress(null);
    try {
      const result = await safeGetDiagnosis(provider, targetUrl, (progress) => {
        setAnalysisProgress(cloneAnalysisProgress(progress));
      });
      const normalized = cloneDiagnosisResult(result);
      setDiagnosis(normalized.items);
      setTaskGeneration(normalized.taskGeneration);
      setTasks(normalized.tasks.map((task) => ({ ...task, selected: false })));
      markRuntime('idle');
    } catch (error) {
      setTaskGeneration(
        createTaskGenerationStatus(
          'failed',
          'DIAGNOSIS_REQUEST_FAILED',
          toErrorMessage(error, '页面分析失败，请重试'),
          true,
        ),
      );
      markRuntimeError(error, '页面分析失败，请重试');
      throw error;
    }
  }, [markRuntime, markRuntimeError, provider, targetUrl]);

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
    const selectedTaskCatalog = tasks
      .filter((task) => selectedTasks.includes(task.id))
      .map((task) => ({
        id: task.id,
        name: task.name,
        description: task.description,
        difficulty: task.difficulty,
        estimatedDuration: task.estimatedDuration,
        testScenario: task.testScenario,
        operationSteps: task.operationSteps ? [...task.operationSteps] : undefined,
        successCriteria: task.successCriteria ? [...task.successCriteria] : undefined,
        tags: task.tags ? [...task.tags] : undefined,
        evidenceRefs: task.evidenceRefs ? [...task.evidenceRefs] : undefined,
        evidenceReason: task.evidenceReason,
      }));

    const request: ExecutionRequest = {
      targetUrl,
      selectedTaskIds: selectedTasks,
      taskCatalog: selectedTaskCatalog,
      categorySelections,
      maxCases: MAX_EXECUTION_CASES,
    };
    markRuntime('sampling');
    try {
      const snapshot = await safeCreateRunSnapshot(provider, request);
      setCurrentRunSnapshot(snapshot);
      setExecutions(snapshot.executions);
      setGeneratedAgents(snapshot.generatedAgents.length > 0 ? snapshot.generatedAgents : extractGeneratedAgents(snapshot.executions));
      setSelectedCaseId(snapshot.executions[0]?.caseId ?? null);
      setQAHistory([]);
      setFinalReportBundle(null);

      const { jobId } = await safeStartExecutionJob(provider, snapshot.runId);
      const startedAt = Date.now();
      let completedSnapshot: TestRunSnapshot | null = null;

      while (Date.now() - startedAt <= EXECUTION_JOB_TIMEOUT_MS) {
        await new Promise((resolve) => setTimeout(resolve, EXECUTION_JOB_POLL_INTERVAL_MS));
        const status = await safeGetExecutionJobStatus(provider, snapshot.runId, jobId);
        if (status.snapshot) {
          completedSnapshot = status.snapshot;
          setCurrentRunSnapshot(status.snapshot);
          setExecutions(status.snapshot.executions);
          setGeneratedAgents(
            status.snapshot.generatedAgents.length > 0
              ? status.snapshot.generatedAgents
              : extractGeneratedAgents(status.snapshot.executions),
          );
          setSelectedCaseId((prev) => prev ?? status.snapshot?.executions[0]?.caseId ?? null);
        }

        if (status.status === 'completed') {
          break;
        }
        if (status.status === 'failed') {
          throw new Error(status.error ?? status.progress.message ?? '执行任务失败，请重试');
        }
      }

      if (!completedSnapshot) {
        // Fallback for providers that don't expose progressive snapshot updates.
        const nextExecutions = await safeGetExecutions(provider, request);
        setExecutions(nextExecutions);
        setGeneratedAgents(extractGeneratedAgents(nextExecutions));
        setSelectedCaseId(nextExecutions[0]?.caseId ?? null);
      }

      if (Date.now() - startedAt > EXECUTION_JOB_TIMEOUT_MS) {
        throw new Error('执行任务超时，请稍后重试');
      }

      setQAHistory([]);
      setFinalReportBundle(null);
      markRuntime('idle');
    } catch (error) {
      markRuntimeError(error, '测试样本生成失败，请重试');
      throw error;
    }
  }, [categorySelections, markRuntime, markRuntimeError, provider, selectedTasks, targetUrl, tasks]);

  const generateReport = useCallback(async () => {
    markRuntime('reporting');
    try {
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
      markRuntime('idle');
    } catch (error) {
      markRuntimeError(error, '报告生成失败，请重试');
      throw error;
    }
  }, [currentRunSnapshot, executions, markRuntime, markRuntimeError, provider]);

  const selectCase = useCallback((caseId: string) => {
    setSelectedCaseId(caseId);
  }, []);

  const askCaseQuestion = useCallback(
    async (question: string, caseIdOverride?: string) => {
      const normalizedQuestion = question.trim();
      if (!normalizedQuestion || !currentRunSnapshot) {
        return null;
      }
      markRuntime('qa');
      try {
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
        markRuntime('idle');
        return response;
      } catch (error) {
        markRuntimeError(error, '案例追问失败，请稍后重试');
        return null;
      }
    },
    [appendHistory, currentRunSnapshot, markRuntime, markRuntimeError, provider, selectedCaseId],
  );

  const askGlobalQuestion = useCallback(
    async (question: string, filters?: QAFilter) => {
      const normalizedQuestion = question.trim();
      if (!normalizedQuestion || !currentRunSnapshot) {
        return null;
      }
      markRuntime('qa');
      try {
        const request: QARequest = {
          runId: currentRunSnapshot.runId,
          question: normalizedQuestion,
          scope: 'global',
          filters,
        };

        const response = await safeAskQuestion(provider, request, currentRunSnapshot);
        appendHistory('global', normalizedQuestion, response);
        markRuntime('idle');
        return response;
      } catch (error) {
        markRuntimeError(error, '全局追问失败，请稍后重试');
        return null;
      }
    },
    [appendHistory, currentRunSnapshot, markRuntime, markRuntimeError, provider],
  );

  const reset = useCallback(() => {
    setCurrentStep('init');
    setTargetUrl(DEFAULT_TARGET_URL);
    setRuntimeStatus(createRuntimeStatus('idle'));
    setAnalysisProgress(null);
    setDiagnosis([]);
    setTaskGeneration(createTaskGenerationStatus());
    setTasks([]);
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
    runtimeStatus,
    analysisProgress,
    diagnosis,
    taskGeneration,
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
