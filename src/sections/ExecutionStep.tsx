import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';
import { taskDetailTemplates } from '@/data/mock/taskDetailTemplates';
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
import type { QAHistoryItem, TaskExecution, TaskStatus } from '@/types';

interface ExecutionStepProps {
  executions: TaskExecution[];
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

function resolveTaskDetail(taskId: number, taskName: string) {
  const detail = taskDetailTemplates[taskId];
  if (detail) {
    return detail;
  }

  return {
    taskId,
    title: taskName,
    difficulty: '中等' as const,
    estimatedDuration: '8-12分钟',
    testScenario: '请按既定流程完成任务并记录异常。',
    operationSteps: ['定位入口', '执行主要操作', '确认反馈', '完成并复核'],
    successCriteria: ['任务目标完成', '反馈可理解', '结果可确认'],
    tags: ['默认模板'],
  };
}

export function ExecutionStep({
  executions,
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
    ? resolveTaskDetail(selectedCase.taskId, selectedCase.taskName)
    : null;
  const standardOperationSteps = selectedTaskDetail?.operationSteps ?? [];
  const standardizedVisibleSteps = standardOperationSteps.map((operationStep, index) => ({
    order: index + 1,
    operationStep,
    executionStep: visibleSelectedSteps[index],
  }));
  const extraExecutionSteps = visibleSelectedSteps.slice(standardOperationSteps.length);

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
          disabled={playback.isFinished || executionViews.length === 0}
        >
          {playback.isPlaying ? <Pause className="w-4 h-4 mr-2" /> : <Play className="w-4 h-4 mr-2" />}
          {playback.isPlaying ? '暂停' : '继续'}
        </Button>

        <Button
          type="button"
          variant="outline"
          className="border-slate-700 text-slate-300 hover:bg-slate-800"
          onClick={toggleSpeed}
          disabled={executionViews.length === 0}
        >
          <Zap className="w-4 h-4 mr-2" />
          速度 {playback.speed}x
        </Button>

        <Button
          type="button"
          variant="outline"
          className="border-slate-700 text-slate-300 hover:bg-slate-800"
          onClick={skipToComplete}
          disabled={playback.isFinished || executionViews.length === 0}
        >
          <FastForward className="w-4 h-4 mr-2" />
          跳过到完成
        </Button>
      </div>

      {blockedHint && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-300">
          {blockedHint}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-4 animate-slide-in-left" style={{ animationDelay: '80ms' }}>
          <Card className="bg-slate-900/50 border-slate-800 h-full">
            <CardHeader>
              <CardTitle className="text-slate-100 flex items-center gap-2">
                <Layers className="w-4 h-4 text-blue-400" />
                任务汇总
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 max-h-[560px] overflow-y-auto pr-1">
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
          <Card className="bg-slate-900/50 border-slate-800 h-full">
            <CardHeader>
              <CardTitle className="text-slate-100 flex items-center gap-2">
                <Search className="w-4 h-4 text-cyan-400" />
                任务样本列表
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 max-h-[560px] overflow-y-auto pr-1">
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
          <Card className="bg-slate-900/50 border-slate-800 h-full">
            <CardHeader>
              <CardTitle className="text-slate-100 flex items-center gap-2">
                <User className="w-4 h-4 text-emerald-400" />
                案例详情与追问
              </CardTitle>
            </CardHeader>
            <CardContent>
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
                    <p className="text-xs text-blue-100">{selectedTaskDetail?.testScenario ?? '无测试场景描述'}</p>
                  </div>

                  <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-3">
                    <div className="text-xs text-slate-400 mb-2">成功标准</div>
                    <ul className="space-y-1">
                      {(selectedTaskDetail?.successCriteria ?? []).map((criterion) => (
                        <li key={`${selectedCase.resolvedCaseId}-criterion-${criterion}`} className="text-xs text-emerald-300">
                          ✓ {criterion}
                        </li>
                      ))}
                    </ul>
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

                          <div className="text-xs text-slate-500 mt-2">该用户完成情况</div>
                          {item.executionStep ? (
                            <div className="mt-1 space-y-1">
                              <p className="text-sm text-slate-300">{item.executionStep.content}</p>
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
                        </div>
                      ))}

                      {standardizedVisibleSteps.length === 0 && (
                        <div className="p-2 rounded border border-slate-800 bg-slate-950/40 text-xs text-slate-500">
                          该案例尚未执行到可展示步骤。
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
                        disabled={!selectedCaseVisible || visibleSelectedSteps.length === 0}
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
          disabled={!playback.isFinished || executions.length === 0 || isCompleting}
        >
          {isCompleting ? '生成报告中...' : '查看完整报告'}
          <ArrowRight className="w-4 h-4 ml-2" />
        </Button>
      </div>
    </div>
  );
}
