import path from 'node:path';
import fs from 'node:fs/promises';
import { createBrowserSession } from './browser-session';
import { executeAction } from './action-executor';
import { observePage } from './page-observer';
import { safeParseExecutionAction } from './action-schema';
import type { LLMAdapter } from '../llm/adapter';
import type {
  ExecutionStep,
  GeneratedAgentPersona,
  LiveExecutionAction,
  Task,
  TaskExecution,
  TaskStatus,
} from '../types/domain';

export interface LiveCaseRunnerOptions {
  caseId: string;
  targetUrl: string;
  task: Task;
  persona: GeneratedAgentPersona;
  llmAdapter: LLMAdapter;
  artifactDir: string;
  screenshotEnabled: boolean;
  headless: boolean;
  maxSteps: number;
  caseTimeoutMs: number;
  stepTimeoutMs: number;
  onStep?: (payload: {
    caseId: string;
    stepCount: number;
    lastStepPreview: string;
    partialExecution: TaskExecution;
  }) => void;
}

function fallbackPlan(task: Task): string[] {
  if (task.operationSteps && task.operationSteps.length > 0) {
    return task.operationSteps.slice(0, 8);
  }
  return ['进入目标页面并定位入口', '执行关键操作', '确认结果反馈'];
}

function toTaskInput(task: Task): Omit<Task, 'selected'> {
  return {
    id: task.id,
    name: task.name,
    description: task.description,
    difficulty: task.difficulty,
    estimatedDuration: task.estimatedDuration,
    testScenario: task.testScenario,
    operationSteps: task.operationSteps,
    successCriteria: task.successCriteria,
    tags: task.tags,
    evidenceRefs: task.evidenceRefs,
    evidenceReason: task.evidenceReason,
  };
}

function fallbackAction(index: number, plannedSteps: string[], actionHints: Array<{ selector: string }>): LiveExecutionAction {
  if (index >= plannedSteps.length) {
    return {
      type: 'finish',
      reason: '标准步骤已走完',
    };
  }
  if (actionHints.length > 0) {
    return {
      type: 'click',
      selector: actionHints[index % actionHints.length].selector,
      reason: `执行计划步骤 ${index + 1}`,
    };
  }
  return {
    type: 'wait',
    waitMs: 1000,
    reason: '未发现可操作元素，等待页面变化',
  };
}

async function ensureDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
}

function createPartialExecution(
  base: Omit<TaskExecution, 'status' | 'steps' | 'duration' | 'result'>,
  steps: ExecutionStep[],
): TaskExecution {
  return {
    ...base,
    status: 'running',
    steps: [...steps],
    duration: 0,
    result: '执行中',
  };
}

export async function runLiveCase(options: LiveCaseRunnerOptions): Promise<TaskExecution> {
  const startedAt = Date.now();
  const stepTimeline: ExecutionStep[] = [];
  const taskInput = toTaskInput(options.task);

  const baseExecution: Omit<TaskExecution, 'status' | 'steps' | 'duration' | 'result'> = {
    caseId: options.caseId,
    taskId: options.task.id,
    taskName: options.task.name,
    agentId: options.persona.id,
    agentName: options.persona.name,
    agentCategoryId: options.persona.categoryId,
    agentCategoryName: options.persona.categoryName,
    agentAvatar: options.persona.avatar,
    agentGoal: options.persona.goal,
  };

  let status: TaskStatus = 'failed';
  let result = '未开始执行';
  let bottleneck = '流程未启动';
  let emotionPeak = '低';

  if (!options.targetUrl) {
    return {
      ...baseExecution,
      status: 'failed',
      steps: [
        {
          step: 1,
          role: 'feedback',
          content: '目标网址为空，无法执行真实浏览器测试。',
          result: 'failed',
        },
      ],
      duration: 1,
      result: '执行失败',
      bottleneck: '无可用目标网址',
      emotionPeak: '高 (焦虑)',
    };
  }

  await ensureDir(options.artifactDir);

  const session = await createBrowserSession(options.targetUrl, {
    headless: options.headless,
    timeoutMs: options.stepTimeoutMs,
  });

  try {
    const planOutput = options.llmAdapter.planExecutionCase
      ? await options.llmAdapter.planExecutionCase({
          targetUrl: options.targetUrl,
          task: taskInput,
          persona: options.persona,
        })
      : {
          summary: `默认计划：执行任务 ${options.task.name}`,
          plannedSteps: fallbackPlan(options.task),
        };

    const plannedSteps = planOutput.plannedSteps && planOutput.plannedSteps.length >= 3
      ? planOutput.plannedSteps.slice(0, options.maxSteps)
      : fallbackPlan(options.task);

    stepTimeline.push({
      step: 1,
      role: 'observer',
      content: options.task.testScenario
        ? `测试场景：${options.task.testScenario}`
        : `执行任务：${options.task.name}`,
      plannedStep: plannedSteps[0],
      result: 'success',
    });

    const executedStepSummaries: string[] = [];
    const deadline = startedAt + options.caseTimeoutMs;
    let finishedByAction = false;

    for (let index = 0; index < options.maxSteps; index += 1) {
      if (Date.now() >= deadline) {
        result = '执行超时';
        bottleneck = '案例超时';
        emotionPeak = '高 (焦虑)';
        break;
      }

      const observation = await observePage(session.page);
      const urlBefore = observation.url;

      const llmDecision = options.llmAdapter.decideExecutionStep
        ? await options.llmAdapter.decideExecutionStep({
            targetUrl: options.targetUrl,
            task: taskInput,
            persona: options.persona,
            plannedSteps,
            currentStepIndex: index,
            executedStepSummaries,
            pageObservation: {
              url: observation.url,
              title: observation.title,
              textSnippet: observation.textSnippet,
              elementHints: observation.elementHints.slice(0, 20),
            },
          })
        : { action: fallbackAction(index, plannedSteps, observation.elementHints) };

      const action = safeParseExecutionAction(llmDecision.action) ?? fallbackAction(index, plannedSteps, observation.elementHints);
      const actionResult = await executeAction(session.page, action, options.stepTimeoutMs);
      const postObservation = await observePage(session.page);

      let screenshotPath: string | undefined;
      if (options.screenshotEnabled) {
        const screenshotFile = `${options.caseId}-step-${String(index + 1).padStart(2, '0')}.png`;
        const absolutePath = path.join(options.artifactDir, screenshotFile);
        await session.page.screenshot({ path: absolutePath, fullPage: true });
        screenshotPath = absolutePath;
      }

      const step: ExecutionStep = {
        step: stepTimeline.length + 1,
        role: 'executor',
        plannedStep: plannedSteps[index] ?? plannedSteps[plannedSteps.length - 1],
        actualAction: action,
        content: `${action.reason ?? '执行步骤'}：${plannedSteps[index] ?? '未定义步骤'}`,
        observation: postObservation.textSnippet.slice(0, 220),
        result: actionResult.ok ? 'success' : 'failed',
        evidence: {
          urlBefore,
          urlAfter: actionResult.urlAfter,
          domExcerpt: postObservation.domExcerpt.slice(0, 800),
          screenshotPath,
        },
      };

      stepTimeline.push(step);
      executedStepSummaries.push(
        `step${index + 1}:${action.type}:${actionResult.ok ? 'ok' : 'fail'}:${actionResult.message}`,
      );

      options.onStep?.({
        caseId: options.caseId,
        stepCount: stepTimeline.length,
        lastStepPreview: step.content,
        partialExecution: createPartialExecution(baseExecution, stepTimeline),
      });

      if (action.type === 'finish') {
        status = 'success';
        result = action.reason ?? '已完成任务';
        bottleneck = stepTimeline.length > plannedSteps.length + 1 ? '流程有冗余步骤' : '无明显瓶颈';
        emotionPeak = '中 (满意)';
        finishedByAction = true;
        break;
      }

      if (action.type === 'fail') {
        status = 'failed';
        result = action.reason ?? 'LLM 判定任务失败';
        bottleneck = action.reason ?? '关键步骤无法推进';
        emotionPeak = '高 (沮丧)';
        finishedByAction = true;
        break;
      }
    }

    if (!finishedByAction) {
      const hasEnoughSteps = stepTimeline.length > Math.max(3, plannedSteps.length - 1);
      if (hasEnoughSteps) {
        status = 'success';
        result = '达到计划步数，任务结束';
        bottleneck = '无明显瓶颈';
        emotionPeak = '中 (满意)';
      } else {
        status = 'failed';
        result = result === '未开始执行' ? '未达到成功条件' : result;
        bottleneck = bottleneck === '流程未启动' ? '页面交互推进不足' : bottleneck;
        emotionPeak = '高 (焦虑)';
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : '执行异常';
    stepTimeline.push({
      step: stepTimeline.length + 1,
      role: 'feedback',
      content: `执行异常：${message}`,
      result: 'failed',
    });
    status = 'failed';
    result = `执行异常：${message}`;
    bottleneck = '执行异常';
    emotionPeak = '高 (焦虑)';
  } finally {
    await session.close();
  }

  const duration = Math.max(1, Math.round((Date.now() - startedAt) / 1000));

  stepTimeline.push({
    step: stepTimeline.length + 1,
    role: 'feedback',
    content: status === 'success' ? '任务执行完成。' : '任务执行失败。',
    result: status === 'success' ? 'success' : 'failed',
  });

  return {
    ...baseExecution,
    status,
    steps: stepTimeline,
    duration,
    result,
    bottleneck,
    emotionPeak,
  };
}
