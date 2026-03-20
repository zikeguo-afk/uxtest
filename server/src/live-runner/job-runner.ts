import path from 'node:path';
import { defaultAgentCategories } from '../data/agent-categories';
import { defaultTasks } from '../data/tasks';
import { generatePersonasWithLLM } from '../domain/persona-llm-generator';
import { sampleExecutionPairs } from '../domain/execution-sampler';
import { toCaseRefs } from '../domain/execution-builder';
import { runLiveCase } from './case-runner';
import type { LLMAdapter } from '../llm/adapter';
import type {
  ExecutionJobProgress,
  LiveExecutionCaseState,
  Task,
  TaskExecution,
  TestRunSnapshot,
} from '../types/domain';
import { ExecutionJobStore } from '../store/execution-job-store';
import { RunStore } from '../store/run-store';

const DEFAULT_MAX_CASES = 40;

export interface LiveRunnerConfig {
  enabled: boolean;
  headless: boolean;
  concurrency: number;
  maxSteps: number;
  caseTimeoutMs: number;
  stepTimeoutMs: number;
  screenshotEnabled: boolean;
  artifactRootDir: string;
}

export interface StartExecutionJobResult {
  jobId: string;
  status: ExecutionJobProgress['status'];
  progress: ExecutionJobProgress;
  createdAt: string;
}

interface JobCasePlan {
  caseId: string;
  taskId: number;
  generatedAgentId: string;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function cloneSnapshot(snapshot: TestRunSnapshot): TestRunSnapshot {
  return structuredClone(snapshot);
}

function resolveMaxCases(snapshot: TestRunSnapshot): number {
  if (snapshot.executions.length > 0) {
    return clamp(snapshot.executions.length, 1, DEFAULT_MAX_CASES);
  }

  const selectedPeople = snapshot.categorySelections.reduce(
    (sum, selection) => sum + Math.max(0, selection.count),
    0,
  );
  const heuristic = snapshot.selectedTaskIds.length * Math.max(1, selectedPeople);
  return clamp(heuristic, 1, DEFAULT_MAX_CASES);
}

function createCaseId(runId: string, index: number): string {
  return `${runId}-case-${String(index + 1).padStart(3, '0')}`;
}

function createTaskCatalogMap(snapshot: TestRunSnapshot): Map<number, Task> {
  const map = new Map<number, Task>();
  for (const task of defaultTasks) {
    map.set(task.id, { ...task });
  }
  for (const task of snapshot.taskCatalog ?? []) {
    map.set(task.id, { ...task, selected: false });
  }
  return map;
}

function buildQueuedCaseStates(
  casePlans: JobCasePlan[],
  taskMap: Map<number, Task>,
  agentNameMap: Map<string, string>,
): LiveExecutionCaseState[] {
  return casePlans.map((plan) => ({
    caseId: plan.caseId,
    taskId: plan.taskId,
    taskName: taskMap.get(plan.taskId)?.name ?? `任务 #${plan.taskId}`,
    agentId: plan.generatedAgentId,
    agentName: agentNameMap.get(plan.generatedAgentId) ?? plan.generatedAgentId,
    status: 'queued',
    stepCount: 0,
  }));
}

function compactExecutions(executionsByIndex: Array<TaskExecution | undefined>): TaskExecution[] {
  const output: TaskExecution[] = [];
  for (const execution of executionsByIndex) {
    if (execution) {
      output.push(execution);
    }
  }
  return output;
}

export class LiveExecutionJobRunner {
  constructor(
    private readonly runStore: RunStore,
    private readonly executionJobStore: ExecutionJobStore,
    private readonly llmAdapter: LLMAdapter,
    private readonly config: LiveRunnerConfig,
  ) {}

  start(snapshot: TestRunSnapshot): StartExecutionJobResult {
    const caseHint = resolveMaxCases(snapshot);
    const job = this.executionJobStore.create(snapshot.runId, caseHint);
    const initialSnapshot = cloneSnapshot(snapshot);

    void this.runJob(job.jobId, initialSnapshot).catch((error) => {
      const message = error instanceof Error ? error.message : '执行任务异常';
      this.executionJobStore.update(job.jobId, (entry) => {
        const updatedAt = new Date().toISOString();
        return {
          ...entry,
          status: 'failed',
          updatedAt,
          error: message,
          progress: {
            ...entry.progress,
            status: 'failed',
            message,
            updatedAt,
          },
        };
      });
    });

    return {
      jobId: job.jobId,
      status: job.status,
      progress: job.progress,
      createdAt: job.createdAt,
    };
  }

  private updateJobState(
    jobId: string,
    payload: {
      status: ExecutionJobProgress['status'];
      snapshot: TestRunSnapshot;
      cases: LiveExecutionCaseState[];
      finishedCases: number;
      message: string;
      error?: string | null;
      currentCaseId?: string | null;
    },
  ): void {
    const nextSnapshot = cloneSnapshot(payload.snapshot);
    this.runStore.set(nextSnapshot);

    this.executionJobStore.update(jobId, (entry) => {
      const updatedAt = new Date().toISOString();
      return {
        ...entry,
        status: payload.status,
        updatedAt,
        snapshot: nextSnapshot,
        error: payload.error ?? null,
        progress: {
          ...entry.progress,
          status: payload.status,
          totalCases: payload.cases.length,
          finishedCases: payload.finishedCases,
          currentCaseId: payload.currentCaseId ?? null,
          cases: payload.cases.map((item) => ({ ...item })),
          message: payload.message,
          updatedAt,
        },
      };
    });
  }

  private async runJob(jobId: string, snapshot: TestRunSnapshot): Promise<void> {
    const workingSnapshot = cloneSnapshot(snapshot);
    const taskMap = createTaskCatalogMap(workingSnapshot);

    const validSelections = workingSnapshot.categorySelections.filter((item) => item.count > 0);
    const personaResult = await generatePersonasWithLLM(
      validSelections,
      defaultAgentCategories,
      this.llmAdapter,
      workingSnapshot.targetUrl,
    );

    workingSnapshot.generatedAgents = personaResult.personas;
    workingSnapshot.personaVersion = personaResult.source === 'llm' ? 'llm-v1' : 'fallback-v1';

    if (workingSnapshot.generatedAgents.length === 0) {
      throw new Error('未生成可用测试人群，无法启动执行任务。');
    }

    if (!this.config.enabled) {
      workingSnapshot.runnerMode = 'simulated';
      workingSnapshot.caseRefs = toCaseRefs(workingSnapshot.executions);
      const fallbackCases: LiveExecutionCaseState[] = workingSnapshot.executions.map(
        (execution, index) => ({
          caseId: execution.caseId ?? createCaseId(workingSnapshot.runId, index),
          taskId: execution.taskId,
          taskName: execution.taskName,
          agentId: execution.agentId,
          agentName: execution.agentName,
          status: execution.status,
          stepCount: execution.steps.length,
          lastStepPreview:
            execution.steps[execution.steps.length - 1]?.content ?? execution.result,
          error: execution.status === 'failed' ? execution.result : undefined,
        }),
      );

      this.updateJobState(jobId, {
        status: 'completed',
        snapshot: workingSnapshot,
        cases: fallbackCases,
        finishedCases: fallbackCases.length,
        message: 'LIVE_RUNNER_ENABLED=false，已使用模拟执行结果。',
      });
      return;
    }

    const targetUrl = workingSnapshot.targetUrl;
    if (!targetUrl) {
      throw new Error('目标网址为空，无法执行真实浏览器测试。');
    }

    workingSnapshot.runnerMode = 'live-browser';
    const maxCases = resolveMaxCases(workingSnapshot);
    const pairs = sampleExecutionPairs(
      workingSnapshot.selectedTaskIds,
      workingSnapshot.generatedAgents,
      maxCases,
    );

    if (pairs.length === 0) {
      throw new Error('没有可执行的任务-人群组合，请检查任务和人群配置。');
    }

    const casePlans: JobCasePlan[] = pairs.map((pair, index) => ({
      caseId: createCaseId(workingSnapshot.runId, index),
      taskId: pair.taskId,
      generatedAgentId: pair.generatedAgentId,
    }));
    const agentMap = new Map(workingSnapshot.generatedAgents.map((item) => [item.id, item]));
    const agentNameMap = new Map(workingSnapshot.generatedAgents.map((item) => [item.id, item.name]));
    const caseStates = buildQueuedCaseStates(casePlans, taskMap, agentNameMap);
    const executionsByIndex: Array<TaskExecution | undefined> = new Array(casePlans.length);
    let finishedCases = 0;
    let cursor = 0;

    workingSnapshot.executions = [];
    workingSnapshot.caseRefs = [];
    this.updateJobState(jobId, {
      status: 'running',
      snapshot: workingSnapshot,
      cases: caseStates,
      finishedCases,
      message: `已启动真实浏览器执行，共 ${casePlans.length} 条样本。`,
      currentCaseId: null,
    });

    const workerCount = clamp(this.config.concurrency, 1, Math.max(1, casePlans.length));
    const runCaseAtIndex = async (index: number): Promise<void> => {
      const plan = casePlans[index];
      const persona = agentMap.get(plan.generatedAgentId);
      const task = taskMap.get(plan.taskId);
      if (!persona || !task) {
        caseStates[index] = {
          ...caseStates[index],
          status: 'failed',
          error: '案例缺少任务或人群数据',
          lastStepPreview: '执行前置数据异常',
        };
        finishedCases += 1;
        this.updateJobState(jobId, {
          status: 'running',
          snapshot: workingSnapshot,
          cases: caseStates,
          finishedCases,
          message: `执行中 ${finishedCases}/${casePlans.length}`,
          currentCaseId: null,
        });
        return;
      }

      caseStates[index] = {
        ...caseStates[index],
        status: 'running',
      };
      this.updateJobState(jobId, {
        status: 'running',
        snapshot: workingSnapshot,
        cases: caseStates,
        finishedCases,
        message: `执行中 ${finishedCases}/${casePlans.length}`,
        currentCaseId: plan.caseId,
      });

      const execution = await runLiveCase({
        caseId: plan.caseId,
        targetUrl,
        task,
        persona,
        llmAdapter: this.llmAdapter,
        artifactDir: path.join(this.config.artifactRootDir, workingSnapshot.runId, plan.caseId),
        screenshotEnabled: this.config.screenshotEnabled,
        headless: this.config.headless,
        maxSteps: this.config.maxSteps,
        caseTimeoutMs: this.config.caseTimeoutMs,
        stepTimeoutMs: this.config.stepTimeoutMs,
        onStep: (payload) => {
          caseStates[index] = {
            ...caseStates[index],
            status: 'running',
            stepCount: payload.stepCount,
            lastStepPreview: payload.lastStepPreview,
          };
          executionsByIndex[index] = payload.partialExecution;
          workingSnapshot.executions = compactExecutions(executionsByIndex);
          workingSnapshot.caseRefs = toCaseRefs(workingSnapshot.executions);
          this.updateJobState(jobId, {
            status: 'running',
            snapshot: workingSnapshot,
            cases: caseStates,
            finishedCases,
            message: `执行中 ${finishedCases}/${casePlans.length}，当前 ${plan.caseId}`,
            currentCaseId: plan.caseId,
          });
        },
      });

      executionsByIndex[index] = execution;
      caseStates[index] = {
        ...caseStates[index],
        status: execution.status,
        stepCount: execution.steps.length,
        lastStepPreview: execution.steps[execution.steps.length - 1]?.content ?? execution.result,
        error: execution.status === 'failed' ? execution.result : undefined,
      };
      finishedCases += 1;

      workingSnapshot.executions = compactExecutions(executionsByIndex);
      workingSnapshot.caseRefs = toCaseRefs(workingSnapshot.executions);
      this.updateJobState(jobId, {
        status: 'running',
        snapshot: workingSnapshot,
        cases: caseStates,
        finishedCases,
        message: `执行中 ${finishedCases}/${casePlans.length}`,
        currentCaseId: null,
      });
    };

    const workers = Array.from({ length: workerCount }, async () => {
      while (cursor < casePlans.length) {
        const caseIndex = cursor;
        cursor += 1;
        await runCaseAtIndex(caseIndex);
      }
    });
    await Promise.all(workers);

    workingSnapshot.executions = compactExecutions(executionsByIndex);
    workingSnapshot.caseRefs = toCaseRefs(workingSnapshot.executions);
    this.updateJobState(jobId, {
      status: 'completed',
      snapshot: workingSnapshot,
      cases: caseStates,
      finishedCases: caseStates.length,
      message: `执行完成，共完成 ${caseStates.length} 条样本。`,
      currentCaseId: null,
    });
  }
}
