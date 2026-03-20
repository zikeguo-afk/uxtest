import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';
import {
  ArrowRight,
  CheckCircle,
  ClipboardList,
  FastForward,
  Layers,
  MessageSquare,
  Pause,
  Play,
  Search,
  User,
  XCircle,
  Zap,
} from 'lucide-react';
import type { QAHistoryItem, Task, TaskExecution, TaskStatus } from '@/types';

interface ExecutionStepProps {
  executions: TaskExecution[];
  taskCatalog?: Task[];
  selectedCaseId: string | null;
  qaHistory: QAHistoryItem[];
  onSelectCase: (caseId: string) => void;
  onAskCaseQuestion: (question: string, caseId?: string) => Promise<unknown> | unknown;
  onComplete: () => Promise<void> | void;
}

interface ExecutionViewItem extends TaskExecution {
  resolvedCaseId: string;
  executionIndex: number;
}

interface TaskSummary {
  taskId: number;
  taskName: string;
  total: number;
  success: number;
  failed: number;
  pending: number;
  running: number;
  emotionPeak: string;
  firstAppearance: number;
  cases: ExecutionViewItem[];
}

interface PlaybackState {
  currentCaseIndex: number;
  currentStepIndex: number;
  isPlaying: boolean;
  isFinished: boolean;
  speed: 1 | 2;
}

interface TaskDetailView {
  taskId: number;
  title: string;
  testScenario: string;
  operationSteps: string[];
  successCriteria: string[];
  isComplete: boolean;
  missingReasons: string[];
}

const TICK_MS_1X = 1200;
const TICK_MS_2X = 650;

function resolveCaseId(execution: TaskExecution, index: number): string {
  return execution.caseId ?? `case-${String(index + 1).padStart(3, '0')}`;
}

function emotionSeverity(emotionPeak: string): number {
  if (emotionPeak.includes('极高')) return 4;
  if (emotionPeak.includes('高')) return 3;
  if (emotionPeak.includes('中')) return 2;
  return 1;
}

function emotionBadgeClass(emotionPeak: string): string {
  if (emotionPeak.includes('极高')) return 'bg-red-500/20 text-red-400';
  if (emotionPeak.includes('高')) return 'bg-orange-500/20 text-orange-400';
  if (emotionPeak.includes('中')) return 'bg-amber-500/20 text-amber-400';
  return 'bg-emerald-500/20 text-emerald-400';
}

function statusBadgeClass(status: TaskStatus): string {
  if (status === 'success') return 'bg-emerald-500/20 text-emerald-400';
  if (status === 'failed') return 'bg-red-500/20 text-red-400';
  if (status === 'running') return 'bg-blue-500/20 text-blue-400';
  return 'bg-slate-700 text-slate-300';
}

function statusLabel(status: TaskStatus): string {
  if (status === 'success') return '成功';
  if (status === 'failed') return '失败';
  if (status === 'running') return '执行中';
  return '待执行';
}

function formatActionSummary(action?: TaskExecution['steps'][number]['actualAction']): string {
  if (!action) {
    return '未记录动作';
  }

  const base = action.type.toUpperCase();
  if (action.type === 'click') {
    return action.selector ? `${base} ${action.selector}` : base;
  }
  if (action.type === 'type') {
    return action.selector ? `${base} ${action.selector}` : base;
  }
  if (action.type === 'select') {
    const option = action.optionValue ?? action.text ?? '';
    return option ? `${base} ${option}` : base;
  }
  if (action.type === 'wait') {
    return `${base} ${action.waitMs ?? 0}ms`;
  }
  if (action.type === 'assert') {
    return action.expected ? `${base} ${action.expected}` : base;
  }
  if (action.type === 'scroll') {
    return action.direction ? `${base} ${action.direction}` : base;
  }
  return base;
}

function deriveCaseStatus(
  caseIndex: number,
  playback: PlaybackState,
  finalStatus: TaskStatus,
): TaskStatus {
  if (playback.isFinished) {
    return finalStatus;
  }
  if (caseIndex < playback.currentCaseIndex) {
    return finalStatus;
  }
  if (caseIndex === playback.currentCaseIndex) {
    return 'running';
  }
  return 'pending';
}

function computeVisibleStepCount(
  caseIndex: number,
  playback: PlaybackState,
  stepCount: number,
): number {
  if (stepCount === 0) {
    return 0;
  }
  if (playback.isFinished) {
    return stepCount;
  }
  if (caseIndex < playback.currentCaseIndex) {
    return stepCount;
  }
  if (caseIndex === playback.currentCaseIndex) {
    return Math.min(stepCount, playback.currentStepIndex + 1);
  }
  return 0;
}

function isCaseVisible(caseIndex: number, playback: PlaybackState): boolean {
  if (playback.isFinished) {
    return true;
  }
  return caseIndex <= playback.currentCaseIndex;
}

function sanitizeDetailList(list?: string[]): string[] {
  return (list ?? []).map((item) => item.trim()).filter(Boolean);
}

function resolveTaskDetail(taskId: number, taskName: string, task?: Task): TaskDetailView {
  const testScenario = task?.testScenario?.trim() ?? '';
  const operationSteps = sanitizeDetailList(task?.operationSteps);
  const successCriteria = sanitizeDetailList(task?.successCriteria);
  const missingReasons: string[] = [];

  if (!testScenario) {
    missingReasons.push('缺少测试场景');
  }
  if (operationSteps.length < 3) {
    missingReasons.push('操作步骤少于 3 条');
  }
  if (successCriteria.length < 2) {
    missingReasons.push('成功标准少于 2 条');
  }

  return {
    taskId,
    title: taskName,
    testScenario,
    operationSteps,
    successCriteria,
    isComplete: missingReasons.length === 0,
    missingReasons,
  };
}

export function ExecutionStep({
  executions,
  taskCatalog,
  selectedCaseId,
  qaHistory,
  onSelectCase,
  onAskCaseQuestion,
  onComplete,
}: ExecutionStepProps) {
  const [activeTaskId, setActiveTaskId] = useState<number | null>(null);
  const [caseQuestion, setCaseQuestion] = useState('');
  const [blockedHint, setBlockedHint] = useState<string | null>(null);
  const [isCompleting, setIsCompleting] = useState(false);

  const executionViews = useMemo<ExecutionViewItem[]>(
    () => executions.map((execution, index) => ({
      ...execution,
      resolvedCaseId: resolveCaseId(execution, index),
      executionIndex: index,
    })),
    [executions],
  );

  const taskCatalogMap = useMemo(() => {
    const map = new Map<number, Task>();
    for (const task of taskCatalog ?? []) {
      map.set(task.id, task);
    }
    return map;
  }, [taskCatalog]);

  const missingDetailTaskIds = useMemo(() => {
    const missing = new Set<number>();
    for (const execution of executionViews) {
      const detail = resolveTaskDetail(
        execution.taskId,
        execution.taskName,
        taskCatalogMap.get(execution.taskId),
      );
      if (!detail.isComplete) {
        missing.add(execution.taskId);
      }
    }
    return [...missing].sort((left, right) => left - right);
  }, [executionViews, taskCatalogMap]);

  const hasBlockingDetailError = missingDetailTaskIds.length > 0;

  const totalSteps = useMemo(
    () => executionViews.reduce((sum, item) => sum + item.steps.length, 0),
    [executionViews],
  );

  const [playback, setPlayback] = useState<PlaybackState>({
    currentCaseIndex: 0,
    currentStepIndex: 0,
    isPlaying: executionViews.length > 0,
    isFinished: executionViews.length === 0,
    speed: 1,
  });

  useEffect(() => {
    if (!hasBlockingDetailError) {
      return;
    }
    setPlayback((prev) => ({
      ...prev,
      isPlaying: false,
    }));
  }, [hasBlockingDetailError]);

  useEffect(() => {
    if (executionViews[0]) {
      onSelectCase(executionViews[0].resolvedCaseId);
    }
  }, [executionViews, onSelectCase]);

  useEffect(() => {
    if (!playback.isPlaying || playback.isFinished || executionViews.length === 0) {
      return;
    }

    const delay = playback.speed === 2 ? TICK_MS_2X : TICK_MS_1X;
    const timer = window.setTimeout(() => {
      setPlayback((prev) => {
        if (!prev.isPlaying || prev.isFinished) {
          return prev;
        }

        const currentCase = executionViews[prev.currentCaseIndex];
        if (!currentCase) {
          return {
            ...prev,
            isPlaying: false,
            isFinished: true,
          };
        }

        const lastStepIndex = Math.max(currentCase.steps.length - 1, 0);
        if (prev.currentStepIndex < lastStepIndex) {
          return {
            ...prev,
            currentStepIndex: prev.currentStepIndex + 1,
          };
        }

        const nextCaseIndex = prev.currentCaseIndex + 1;
        if (nextCaseIndex >= executionViews.length) {
          return {
            ...prev,
            isPlaying: false,
            isFinished: true,
          };
        }

        return {
          ...prev,
          currentCaseIndex: nextCaseIndex,
          currentStepIndex: 0,
        };
      });
    }, delay);

    return () => {
      window.clearTimeout(timer);
    };
  }, [
    executionViews,
    playback.currentCaseIndex,
    playback.currentStepIndex,
    playback.isFinished,
    playback.isPlaying,
    playback.speed,
  ]);

  const activeAutoCase = executionViews[playback.currentCaseIndex] ?? null;
  const activeAutoStepTotal = activeAutoCase?.steps.length ?? 0;
  const activeAutoStepIndex = playback.isFinished
    ? activeAutoStepTotal
    : Math.min(activeAutoStepTotal, playback.currentStepIndex + 1);

  useEffect(() => {
    if (!activeAutoCase) {
      return;
    }

    if (selectedCaseId !== activeAutoCase.resolvedCaseId && (!selectedCaseId || !executionViews.some((item) => item.resolvedCaseId === selectedCaseId))) {
      onSelectCase(activeAutoCase.resolvedCaseId);
    }
  }, [activeAutoCase, executionViews, onSelectCase, selectedCaseId]);

  const completedSteps = useMemo(() => {
    if (totalSteps === 0) {
      return 0;
    }
    if (playback.isFinished) {
      return totalSteps;
    }

    return executionViews.reduce((sum, item, caseIndex) => {
      return sum + computeVisibleStepCount(caseIndex, playback, item.steps.length);
    }, 0);
  }, [executionViews, playback, totalSteps]);

  const taskSummaries = useMemo<TaskSummary[]>(() => {
    const byTask = new Map<number, ExecutionViewItem[]>();
    for (const execution of executionViews) {
      const list = byTask.get(execution.taskId) ?? [];
      list.push(execution);
      byTask.set(execution.taskId, list);
    }

    return [...byTask.entries()]
      .map(([taskId, cases]) => {
        const caseStatuses = cases.map((item) =>
          deriveCaseStatus(item.executionIndex, playback, item.status),
        );

        const success = caseStatuses.filter((status) => status === 'success').length;
        const failed = caseStatuses.filter((status) => status === 'failed').length;
        const pending = caseStatuses.filter((status) => status === 'pending').length;
        const running = caseStatuses.filter((status) => status === 'running').length;

        const visibleCases = cases.filter((item) => isCaseVisible(item.executionIndex, playback));
        const emotionPeak =
          [...visibleCases]
            .map((item) => item.emotionPeak ?? '低')
            .sort((a, b) => emotionSeverity(b) - emotionSeverity(a))[0] ?? '低';

        const firstAppearance = Math.min(...cases.map((item) => item.executionIndex));

        return {
          taskId,
          taskName: cases[0]?.taskName ?? `任务#${taskId}`,
          total: cases.length,
          success,
          failed,
          pending,
          running,
          emotionPeak,
          firstAppearance,
          cases,
        };
      })
      .sort((a, b) => a.firstAppearance - b.firstAppearance);
  }, [executionViews, playback]);

  const effectiveActiveTaskId = taskSummaries.some((task) => task.taskId === activeTaskId)
    ? activeTaskId
    : (taskSummaries[0]?.taskId ?? null);

  const activeTask = taskSummaries.find((task) => task.taskId === effectiveActiveTaskId) ?? taskSummaries[0];
  const activeTaskCases = useMemo(() => activeTask?.cases ?? [], [activeTask]);

  const fallbackSelectedCase = activeTaskCases.find((item) => isCaseVisible(item.executionIndex, playback))
    ?? activeTaskCases[0]
    ?? null;

  const selectedFromProp = activeTaskCases.find((item) => item.resolvedCaseId === selectedCaseId) ?? null;
  const selectedCase = selectedFromProp ?? fallbackSelectedCase;

  useEffect(() => {
    if (!selectedCase) {
      return;
    }

    if (!isCaseVisible(selectedCase.executionIndex, playback)) {
      const fallback = activeTaskCases.find((item) => isCaseVisible(item.executionIndex, playback));
      if (fallback && fallback.resolvedCaseId !== selectedCaseId) {
        onSelectCase(fallback.resolvedCaseId);
      }
      return;
    }

    if (selectedCaseId !== selectedCase.resolvedCaseId) {
      onSelectCase(selectedCase.resolvedCaseId);
    }
  }, [activeTaskCases, onSelectCase, playback, selectedCase, selectedCaseId]);

  const selectedCaseVisible = selectedCase ? isCaseVisible(selectedCase.executionIndex, playback) : false;

  const visibleSelectedSteps = selectedCase
    ? selectedCase.steps.slice(
        0,
        computeVisibleStepCount(selectedCase.executionIndex, playback, selectedCase.steps.length),
      )
    : [];

  const selectedCaseDisplayStatus = selectedCase
    ? deriveCaseStatus(selectedCase.executionIndex, playback, selectedCase.status)
    : 'pending';
  const selectedTaskDetail = selectedCase
    ? resolveTaskDetail(
      selectedCase.taskId,
      selectedCase.taskName,
      taskCatalogMap.get(selectedCase.taskId),
    )
    : null;
  const standardOperationSteps = selectedTaskDetail?.operationSteps ?? [];
  const visibleExecutorSteps = visibleSelectedSteps.filter((step) => step.role === 'executor');
  const standardizedVisibleSteps = standardOperationSteps.map((operationStep, index) => ({
    order: index + 1,
    operationStep,
    executionStep: visibleExecutorSteps[index],
  }));
  const extraExecutionSteps = [
    ...visibleSelectedSteps.filter((step) => step.role !== 'executor'),
    ...visibleExecutorSteps.slice(standardOperationSteps.length),
  ];

  const caseHistory = qaHistory
    .filter((item) => item.scope === 'case' && item.caseId === selectedCase?.resolvedCaseId)
    .slice(0, 6);

  const submitCaseQuestion = () => {
    const question = caseQuestion.trim();
    if (!question || !selectedCase || !selectedCaseVisible) {
      return;
    }
    void onAskCaseQuestion(question, selectedCase.resolvedCaseId);
    setCaseQuestion('');
  };

  const togglePlayback = () => {
    setPlayback((prev) => {
      if (prev.isFinished) {
        return prev;
      }
      return {
        ...prev,
        isPlaying: !prev.isPlaying,
      };
    });
  };

  const toggleSpeed = () => {
    setPlayback((prev) => ({
      ...prev,
      speed: prev.speed === 1 ? 2 : 1,
    }));
  };

  const skipToComplete = () => {
    if (executionViews.length === 0) {
      return;
    }

    const lastCaseIndex = executionViews.length - 1;
    const lastStepIndex = Math.max(executionViews[lastCaseIndex].steps.length - 1, 0);

    setPlayback((prev) => ({
      ...prev,
      currentCaseIndex: lastCaseIndex,
      currentStepIndex: lastStepIndex,
      isPlaying: false,
      isFinished: true,
    }));

    onSelectCase(executionViews[lastCaseIndex].resolvedCaseId);
    setBlockedHint(null);
  };

  const handleCaseSelect = (item: ExecutionViewItem) => {
    if (!isCaseVisible(item.executionIndex, playback)) {
      setBlockedHint(`案例 ${item.resolvedCaseId} 尚未执行到该阶段，请等待播放或点击“跳过到完成”。`);
      return;
    }

    setBlockedHint(null);
    onSelectCase(item.resolvedCaseId);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between p-4 bg-slate-900/50 border border-slate-800 rounded-lg animate-fade-in">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-emerald-500/20 flex items-center justify-center">
            <ClipboardList className="w-5 h-5 text-emerald-400" />
          </div>
          <div>
            <div className="text-slate-100 font-medium">{playback.isFinished ? '执行完成' : '自动执行中'}</div>
            <div className="text-sm text-slate-500">
              已完成步骤 {completedSteps}/{totalSteps} · 当前案例 {executionViews.length > 0 ? playback.currentCaseIndex + 1 : 0}/{executionViews.length}
            </div>
            <div className="text-xs text-slate-400 mt-1">
              当前任务: {activeAutoCase?.taskName ?? '暂无'} · 当前步骤: {activeAutoStepIndex}/{activeAutoStepTotal}
            </div>
          </div>
        </div>
        <Badge className={playback.isFinished ? 'bg-emerald-500/20 text-emerald-300 border-0' : 'bg-blue-500/20 text-blue-300 border-0'}>
          {playback.isFinished ? '执行完成' : '自动播放'}
        </Badge>
      </div>

      <div className="flex flex-wrap gap-2 items-center justify-end">
        <Button
          type="button"
          variant="outline"
          className="border-slate-700 text-slate-300 hover:bg-slate-800"
          onClick={togglePlayback}
          disabled={hasBlockingDetailError || playback.isFinished || executionViews.length === 0}
        >
          {playback.isPlaying ? <Pause className="w-4 h-4 mr-2" /> : <Play className="w-4 h-4 mr-2" />}
          {playback.isPlaying ? '暂停' : '继续'}
        </Button>

        <Button
          type="button"
          variant="outline"
          className="border-slate-700 text-slate-300 hover:bg-slate-800"
          onClick={toggleSpeed}
          disabled={hasBlockingDetailError || executionViews.length === 0}
        >
          <Zap className="w-4 h-4 mr-2" />
          速度 {playback.speed}x
        </Button>

        <Button
          type="button"
          variant="outline"
          className="border-slate-700 text-slate-300 hover:bg-slate-800"
          onClick={skipToComplete}
          disabled={hasBlockingDetailError || playback.isFinished || executionViews.length === 0}
        >
          <FastForward className="w-4 h-4 mr-2" />
          跳过到完成
        </Button>
      </div>

      {hasBlockingDetailError && (
        <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">
          执行已阻断：任务详情缺失，无法继续播放和生成报告。缺失任务 ID：
          {' '}
          {missingDetailTaskIds.map((taskId) => `#${String(taskId).padStart(2, '0')}`).join('、')}
        </div>
      )}

      {blockedHint && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-300">
          {blockedHint}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-4 animate-slide-in-left" style={{ animationDelay: '80ms' }}>
          <Card className="bg-slate-900/50 border-slate-800 h-full flex flex-col min-h-0">
            <CardHeader className="border-b border-slate-800/60">
              <CardTitle className="text-slate-100 flex items-center gap-2">
                <Layers className="w-4 h-4 text-blue-400" />
                任务汇总
              </CardTitle>
            </CardHeader>
            <CardContent className="flex-1 min-h-0 pt-4">
              <div className="space-y-2 h-full overflow-y-auto pr-1">
                {taskSummaries.map((summary) => {
                  const active = summary.taskId === activeTask?.taskId;
                  const doneCases = summary.success + summary.failed;
                  const progress = summary.total > 0 ? Math.round((doneCases / summary.total) * 100) : 0;

                  return (
                    <button
                      key={summary.taskId}
                      type="button"
                      onClick={() => setActiveTaskId(summary.taskId)}
                      className={`w-full text-left p-3 rounded-lg border transition-colors ${
                        active
                          ? 'border-blue-500/50 bg-blue-500/10'
                          : 'border-slate-800 bg-slate-950/40 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className={`text-sm font-medium ${active ? 'text-blue-200' : 'text-slate-200'}`}>
                          #{String(summary.taskId).padStart(2, '0')} {summary.taskName}
                        </span>
                        <Badge className={`${emotionBadgeClass(summary.emotionPeak)} border-0`}>{summary.emotionPeak}</Badge>
                      </div>

                      <div className="flex items-center gap-3 text-xs text-slate-400 flex-wrap">
                        <span>样本: {summary.total}</span>
                        <span className="text-emerald-400">成功: {summary.success}</span>
                        <span className="text-red-400">失败: {summary.failed}</span>
                        <span className="text-blue-400">执行中: {summary.running}</span>
                        <span>待执行: {summary.pending}</span>
                        <span>进度: {progress}%</span>
                      </div>
                    </button>
                  );
                })}

                {taskSummaries.length === 0 && (
                  <div className="text-sm text-slate-500">暂无执行数据。</div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="lg:col-span-4 animate-slide-in-up" style={{ animationDelay: '140ms' }}>
          <Card className="bg-slate-900/50 border-slate-800 h-full flex flex-col min-h-0">
            <CardHeader className="border-b border-slate-800/60">
              <CardTitle className="text-slate-100 flex items-center gap-2">
                <Search className="w-4 h-4 text-cyan-400" />
                任务样本列表
              </CardTitle>
            </CardHeader>
            <CardContent className="flex-1 min-h-0 pt-4">
              <div className="space-y-2 h-full overflow-y-auto pr-1">
                {activeTaskCases.map((item) => {
                  const active = item.resolvedCaseId === selectedCase?.resolvedCaseId;
                  const visible = isCaseVisible(item.executionIndex, playback);
                  const displayStatus = deriveCaseStatus(item.executionIndex, playback, item.status);

                  return (
                    <button
                      key={item.resolvedCaseId}
                      type="button"
                      onClick={() => handleCaseSelect(item)}
                      className={`w-full p-3 rounded-lg border text-left transition-colors ${
                        active
                          ? 'border-purple-500/50 bg-purple-500/10'
                          : visible
                            ? 'border-slate-800 bg-slate-950/40 hover:border-slate-700'
                            : 'border-slate-800/70 bg-slate-950/20 opacity-70 hover:border-slate-700/70'
                      }`}
                      aria-label={`${item.agentName}-${statusLabel(displayStatus)}`}
                    >
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span className={`text-sm font-medium ${active ? 'text-purple-200' : 'text-slate-200'}`}>
                          {item.agentName}
                        </span>
                        <Badge className={`${statusBadgeClass(displayStatus)} border-0`}>
                          {displayStatus === 'success' && <CheckCircle className="w-3 h-3 mr-1" />}
                          {displayStatus === 'failed' && <XCircle className="w-3 h-3 mr-1" />}
                          {statusLabel(displayStatus)}
                        </Badge>
                      </div>
                      <div className="text-xs text-slate-500 mb-1">
                        {item.agentCategoryName ?? '未知类别'} · {item.resolvedCaseId}
                      </div>
                      <div className="text-xs text-slate-400">
                        {visible ? `瓶颈: ${item.bottleneck ?? '交互反馈不足'}` : '待执行：尚未展示步骤'}
                      </div>
                    </button>
                  );
                })}
                {activeTaskCases.length === 0 && <div className="text-sm text-slate-500">请先选择任务。</div>}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="lg:col-span-4 animate-slide-in-right" style={{ animationDelay: '200ms' }}>
          <Card className="bg-slate-900/50 border-slate-800 h-full flex flex-col min-h-0">
            <CardHeader className="border-b border-slate-800/60">
              <CardTitle className="text-slate-100 flex items-center gap-2">
                <User className="w-4 h-4 text-emerald-400" />
                案例详情与追问
              </CardTitle>
            </CardHeader>
            <CardContent className="flex-1 min-h-0 pt-4">
              {selectedCase ? (
                <div className="space-y-4">
                  <div className="p-3 rounded-lg border border-slate-800 bg-slate-950/50">
                    <div className="text-sm text-slate-200 font-medium">{selectedCase.taskName}</div>
                    <div className="text-xs text-slate-500 mt-1">
                      {selectedCase.resolvedCaseId} · {selectedCase.agentName}
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      <Badge className={`${statusBadgeClass(selectedCaseDisplayStatus)} border-0`}>
                        {statusLabel(selectedCaseDisplayStatus)}
                      </Badge>
                      <Badge className={`${emotionBadgeClass(selectedCase.emotionPeak ?? '低')} border-0`}>
                        {selectedCase.emotionPeak ?? '低'}
                      </Badge>
                    </div>
                  </div>

                  <div className="rounded-lg border border-blue-500/30 bg-blue-500/10 p-3">
                    <div className="text-xs text-blue-300 mb-1">测试场景</div>
                    {selectedTaskDetail?.testScenario ? (
                      <p className="text-xs text-blue-100">{selectedTaskDetail.testScenario}</p>
                    ) : (
                      <p className="text-xs text-amber-200">详情缺失：该任务未提供测试场景。</p>
                    )}
                  </div>

                  <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-3">
                    <div className="text-xs text-slate-400 mb-2">成功标准</div>
                    <ul className="space-y-1">
                      {(selectedTaskDetail?.successCriteria ?? []).length > 0 ? (
                        (selectedTaskDetail?.successCriteria ?? []).map((criterion) => (
                          <li key={`${selectedCase.resolvedCaseId}-criterion-${criterion}`} className="text-xs text-emerald-300">
                            ✓ {criterion}
                          </li>
                        ))
                      ) : (
                        <li className="text-xs text-amber-300">详情缺失：该任务未提供成功标准。</li>
                      )}
                    </ul>
                    {selectedTaskDetail && !selectedTaskDetail.isComplete && (
                      <div className="mt-2 rounded border border-amber-500/30 bg-amber-500/10 p-2 text-xs text-amber-300">
                        缺失项：{selectedTaskDetail.missingReasons.join('；')}
                      </div>
                    )}
                  </div>

                  <ScrollArea className="h-[260px] pr-3">
                    <div className="space-y-2">
                      {standardizedVisibleSteps.map((item) => (
                        <div
                          key={`${selectedCase.resolvedCaseId}-std-${item.order}`}
                          className="p-3 rounded border border-slate-800 bg-slate-950/40"
                        >
                          <div className="text-xs text-slate-500">标准步骤 {item.order}</div>
                          <p className="text-sm text-slate-200 mt-1">{item.operationStep}</p>

                          <div className="text-xs text-slate-500 mt-2">该用户执行情况</div>
                          {item.executionStep ? (
                            <div className="mt-1 space-y-1">
                              <p className="text-sm text-slate-300">{item.executionStep.content}</p>
                              {item.executionStep.plannedStep && (
                                <p className="text-xs text-slate-400">
                                  计划步骤：{item.executionStep.plannedStep}
                                </p>
                              )}
                              <p className="text-xs text-slate-400">
                                实际动作：{formatActionSummary(item.executionStep.actualAction)}
                              </p>
                              {item.executionStep.observation && (
                                <p className="text-xs text-slate-500">
                                  页面反馈：{item.executionStep.observation}
                                </p>
                              )}
                              {item.executionStep.result && (
                                <Badge
                                  className={
                                    item.executionStep.result === 'success'
                                      ? 'bg-emerald-500/20 text-emerald-300 border-0'
                                      : item.executionStep.result === 'failed'
                                        ? 'bg-red-500/20 text-red-300 border-0'
                                        : 'bg-slate-700 text-slate-300 border-0'
                                  }
                                >
                                  结果：{item.executionStep.result === 'success' ? '成功' : item.executionStep.result === 'failed' ? '失败' : '跳过'}
                                </Badge>
                              )}
                              {item.executionStep.evidence && (
                                <div className="rounded border border-slate-800 bg-slate-950/60 p-2 text-xs text-slate-400 space-y-1">
                                  <div>证据 URL：{item.executionStep.evidence.urlBefore} → {item.executionStep.evidence.urlAfter}</div>
                                  <div>DOM 摘录：{item.executionStep.evidence.domExcerpt.slice(0, 120)}</div>
                                  {item.executionStep.evidence.screenshotPath && (
                                    <div>截图：{item.executionStep.evidence.screenshotPath}</div>
                                  )}
                                </div>
                              )}
                              {item.executionStep.emotion && (
                                <Badge className="bg-slate-800 text-slate-300 border-0">
                                  情绪: {item.executionStep.emotion} ({item.executionStep.emotionValue ?? 0})
                                </Badge>
                              )}
                            </div>
                          ) : (
                            <p className="text-xs text-slate-500 mt-1">尚未执行到该步骤。</p>
                          )}
                        </div>
                      ))}

                      {extraExecutionSteps.map((step) => (
                        <div
                          key={`${selectedCase.resolvedCaseId}-extra-${step.step}`}
                          className="p-3 rounded border border-slate-800 bg-slate-950/30"
                        >
                          <div className="text-xs text-slate-500">补充执行记录</div>
                          <p className="text-sm text-slate-300 mt-1">{step.content}</p>
                          {step.actualAction && (
                            <p className="text-xs text-slate-500 mt-1">
                              动作：{formatActionSummary(step.actualAction)}
                            </p>
                          )}
                          {step.observation && (
                            <p className="text-xs text-slate-500 mt-1">反馈：{step.observation}</p>
                          )}
                        </div>
                      ))}

                      {standardizedVisibleSteps.length === 0 && (
                        <div className="p-2 rounded border border-slate-800 bg-slate-950/40 text-xs text-slate-500">
                          {selectedTaskDetail?.operationSteps.length
                            ? '该案例尚未执行到可展示步骤。'
                            : '详情缺失：该任务未提供标准操作步骤。'}
                        </div>
                      )}
                    </div>
                  </ScrollArea>

                  <div className="space-y-2">
                    <Textarea
                      value={caseQuestion}
                      onChange={(event) => setCaseQuestion(event.target.value)}
                      placeholder="针对该案例提问，例如：这条失败的关键原因是什么？"
                      className="min-h-[90px] bg-slate-950/50 border-slate-700 text-slate-200"
                    />
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        className="border-slate-700 text-slate-300 hover:bg-slate-800"
                        onClick={() => setCaseQuestion('这个案例失败的直接触发点是什么？')}
                      >
                        填充问题
                      </Button>
                      <Button
                        type="button"
                        className="bg-emerald-600 hover:bg-emerald-700 text-white"
                        onClick={submitCaseQuestion}
                        disabled={hasBlockingDetailError || !selectedCaseVisible || visibleSelectedSteps.length === 0}
                      >
                        <MessageSquare className="w-4 h-4 mr-2" />
                        提交追问
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    {caseHistory.map((item) => (
                      <div key={item.id} className="p-3 rounded border border-slate-800 bg-slate-950/40">
                        <div className="text-xs text-slate-400 mb-1">问：{item.question}</div>
                        <div className="text-sm text-slate-200 mb-2">答：{item.response.answer}</div>
                        <div className="flex items-center gap-2 text-xs text-slate-500">
                          <Badge className="bg-slate-800 text-slate-300 border-0">
                            {item.response.mode === 'evidence' ? '证据回答' : '推断回答'}
                          </Badge>
                          <span>可信度 {Math.round(item.response.confidence * 100)}%</span>
                        </div>
                        {item.response.evidence[0] && (
                          <p className="text-xs text-slate-500 mt-2">
                            证据: [{item.response.evidence[0].caseId}] Step {item.response.evidence[0].step} - {item.response.evidence[0].excerpt}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="text-sm text-slate-500">暂无可查看的案例。</div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="flex justify-end animate-fade-in">
        <Button
          onClick={async () => {
            if (isCompleting) {
              return;
            }
            setIsCompleting(true);
            try {
              await onComplete();
            } finally {
              setIsCompleting(false);
            }
          }}
          className="bg-emerald-600 hover:bg-emerald-700 text-white"
          disabled={hasBlockingDetailError || !playback.isFinished || executions.length === 0 || isCompleting}
        >
          {isCompleting ? '生成报告中...' : '查看完整报告'}
          <ArrowRight className="w-4 h-4 ml-2" />
        </Button>
      </div>
    </div>
  );
}
