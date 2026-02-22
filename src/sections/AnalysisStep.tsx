import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  AlertTriangle,
  ArrowRight,
  Check,
  ChevronDown,
  ChevronUp,
  Code,
  FileCode,
  Layers,
  Loader2,
  ShieldAlert,
  X,
} from 'lucide-react';
import type { AnalysisProgressStatus, DiagnosisItem, Task, TaskGenerationStatus } from '@/types';

interface AnalysisStepProps {
  targetUrl: string;
  diagnosis: DiagnosisItem[];
  taskGeneration: TaskGenerationStatus;
  tasks: Task[];
  analysisProgress: AnalysisProgressStatus | null;
  isAnalyzing: boolean;
  onNext: () => void;
}

const statusConfig = {
  success: {
    icon: Check,
    color: 'text-emerald-400',
    bg: 'bg-emerald-500/10',
    border: 'border-emerald-500/30',
    label: '正常',
  },
  warning: {
    icon: AlertTriangle,
    color: 'text-amber-400',
    bg: 'bg-amber-500/10',
    border: 'border-amber-500/30',
    label: '警告',
  },
  error: {
    icon: X,
    color: 'text-red-400',
    bg: 'bg-red-500/10',
    border: 'border-red-500/30',
    label: '错误',
  },
} as const;

const fallbackStages = [
  { id: 'crawl', label: '页面抓取', detail: '等待后端执行日志', status: 'pending' as const, detailSource: 'runtime-log' as const },
  { id: 'structure', label: '结构解析', detail: '等待后端执行日志', status: 'pending' as const, detailSource: 'runtime-log' as const },
  { id: 'risk', label: '风险检查', detail: '等待后端执行日志', status: 'pending' as const, detailSource: 'runtime-log' as const },
  { id: 'tasks', label: '任务生成', detail: '等待后端执行日志', status: 'pending' as const, detailSource: 'runtime-log' as const },
];

function resolveTaskDetail(task: Task) {
  if (task.testScenario || (task.operationSteps && task.operationSteps.length > 0) || (task.successCriteria && task.successCriteria.length > 0)) {
    return {
      taskId: task.id,
      title: task.name,
      difficulty: task.difficulty ?? '中等',
      estimatedDuration: task.estimatedDuration ?? '8-12分钟',
      testScenario: task.testScenario ?? task.description,
      operationSteps: task.operationSteps && task.operationSteps.length > 0
        ? task.operationSteps
        : ['定位功能入口', '执行关键操作', '验证系统反馈'],
      successCriteria: task.successCriteria && task.successCriteria.length > 0
        ? task.successCriteria
        : ['流程可闭环完成', '反馈明确且可理解'],
      tags: task.tags ?? ['API生成'],
    };
  }

  return {
    taskId: task.id,
    title: task.name,
    difficulty: '中等' as const,
    estimatedDuration: '8-12分钟',
    testScenario: task.description,
    operationSteps: ['定位入口', '执行操作', '确认反馈', '完成并复核'],
    successCriteria: ['任务目标完成', '反馈可理解', '结果可确认'],
    tags: ['默认模板'],
  };
}

export function AnalysisStep({
  targetUrl,
  diagnosis,
  taskGeneration,
  tasks,
  analysisProgress,
  isAnalyzing,
  onNext,
}: AnalysisStepProps) {
  const [expandedTaskId, setExpandedTaskId] = useState<number | null>(null);

  const stages = analysisProgress?.stages?.length ? analysisProgress.stages : fallbackStages;
  const activeStage = analysisProgress?.currentStageId
    ? stages.find((stage) => stage.id === analysisProgress.currentStageId) ?? null
    : stages.find((stage) => stage.status === 'running') ??
      stages.find((stage) => stage.status === 'pending') ??
      stages[stages.length - 1] ??
      null;

  const progressPercent = analysisProgress?.percent ?? (diagnosis.length > 0 ? 100 : 0);
  const isTaskDegraded = taskGeneration.status === 'degraded';
  const canProceed =
    !isAnalyzing &&
    diagnosis.length > 0 &&
    tasks.length > 0 &&
    taskGeneration.status !== 'failed' &&
    !taskGeneration.blocked;
  const progressMessage = analysisProgress?.message ?? (canProceed ? '分析完成' : '等待执行');

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4 p-4 bg-slate-900/50 border border-slate-800 rounded-lg animate-fade-in">
        <div className={`w-10 h-10 rounded-full bg-emerald-500/20 flex items-center justify-center ${isAnalyzing ? 'animate-spin' : ''}`}>
          <Code className="w-5 h-5 text-emerald-400" />
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className="text-slate-100 font-medium">{isAnalyzing ? '正在分析页面' : '页面分析结果已就绪'}</span>
            <Badge variant="outline" className="text-xs border-slate-700 text-slate-400">
              {targetUrl}
            </Badge>
          </div>
          <div className="text-sm text-slate-500 mt-1">{progressMessage}</div>
        </div>
      </div>

      <Card className="bg-slate-900/50 border-slate-800 animate-slide-up" style={{ animationDelay: '60ms' }}>
        <CardHeader>
          <CardTitle className="text-slate-100 text-base">实时检查状态</CardTitle>
          <CardDescription className="text-slate-400">
            {activeStage
              ? `当前阶段：${activeStage.label} · ${activeStage.detail}`
              : '等待后端返回分析进度'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="h-2 rounded-full bg-slate-800 overflow-hidden">
            <div
              className="h-full rounded-full bg-emerald-500 transition-all duration-300"
              style={{ width: `${Math.max(0, Math.min(100, progressPercent))}%` }}
            />
          </div>
          <div className="text-xs text-slate-500">后端进度：{Math.round(progressPercent)}%</div>
          <div className="space-y-2">
            {stages.map((stage) => {
              const isActive = stage.status === 'running';
              const isCompleted = stage.status === 'done';
              const isError = stage.status === 'error';

              return (
                <div
                  key={stage.id}
                  className={`rounded-lg border px-3 py-2 flex items-center justify-between ${
                    isActive
                      ? 'border-emerald-500/40 bg-emerald-500/10'
                      : isCompleted
                        ? 'border-blue-500/30 bg-blue-500/10'
                        : isError
                          ? 'border-red-500/30 bg-red-500/10'
                          : 'border-slate-800 bg-slate-950/40'
                  }`}
                >
                  <div className="text-sm">
                    <div className={`${isActive ? 'text-emerald-200' : isCompleted ? 'text-blue-200' : isError ? 'text-red-200' : 'text-slate-300'}`}>
                      {stage.label}
                    </div>
                    <div className="text-xs text-slate-500">{stage.detail}</div>
                    <div className="mt-1">
                      <Badge
                        variant="outline"
                        className="text-[10px] border-slate-700 text-slate-500"
                      >
                        {stage.detailSource === 'llm-summary' ? 'LLM摘要' : '运行日志'}
                      </Badge>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    {isActive && (
                      <>
                        <Loader2 className="w-3 h-3 text-emerald-300 animate-spin" />
                        <span className="text-emerald-300">检查中</span>
                      </>
                    )}
                    {isCompleted && (
                      <>
                        <Check className="w-3 h-3 text-blue-300" />
                        <span className="text-blue-300">已完成</span>
                      </>
                    )}
                    {isError && (
                      <>
                        <AlertTriangle className="w-3 h-3 text-red-300" />
                        <span className="text-red-300">异常</span>
                      </>
                    )}
                    {!isActive && !isCompleted && !isError && <span className="text-slate-500">等待中</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <div className="animate-slide-up" style={{ animationDelay: '100ms' }}>
        <Card className="bg-slate-900/50 border-slate-800">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center">
                <FileCode className="w-5 h-5 text-blue-400" />
              </div>
              <div>
                <CardTitle className="text-slate-100">A. 初步技术诊断报告</CardTitle>
                <CardDescription className="text-slate-400">基于实时页面分析与模型诊断生成</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {diagnosis.length === 0 ? (
              <div className="text-sm text-slate-500">等待诊断结果...</div>
            ) : (
              <div className="space-y-3">
                {diagnosis.map((item, index) => {
                  const config = statusConfig[item.status];
                  const Icon = config.icon;
                  return (
                    <div
                      key={`${item.dimension}-${index}`}
                      className={`flex items-start gap-4 p-4 rounded-lg border animate-slide-in-left ${config.bg} ${config.border}`}
                      style={{ animationDelay: `${200 + index * 100}ms` }}
                    >
                      <div className="w-8 h-8 rounded-full bg-slate-950/50 flex items-center justify-center flex-shrink-0">
                        <Icon className={`w-4 h-4 ${config.color}`} />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-1">
                          <span className="text-slate-200 font-medium">{item.dimension}</span>
                          <Badge className={`text-xs ${config.bg} ${config.color} border-0`}>
                            {config.label}
                          </Badge>
                        </div>
                        <p className="text-sm text-slate-400">{item.description}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="animate-slide-up" style={{ animationDelay: '400ms' }}>
        {isTaskDegraded && (
          <Card className="bg-amber-500/10 border-amber-500/30 mb-4">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-amber-500/20 flex items-center justify-center">
                  <AlertTriangle className="w-5 h-5 text-amber-300" />
                </div>
                <div>
                  <CardTitle className="text-amber-100">任务已自动补全（可继续）</CardTitle>
                  <CardDescription className="text-amber-200/80">
                    本次任务由 LLM 二轮补全后输出为 15 条，可直接进入下一步。
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="text-sm text-amber-100 space-y-1">
              <div>状态码：{taskGeneration.code}</div>
              <div>说明：{taskGeneration.message}</div>
              <div>
                补全统计：自动补字段 {taskGeneration.quality?.autoFilledCount ?? 0}，补齐任务{' '}
                {taskGeneration.quality?.syntheticCount ?? 0}，名称重写{' '}
                {taskGeneration.quality?.rewrittenNameCount ?? 0}，弱门禁告警{' '}
                {taskGeneration.quality?.weakGateWarnings ?? 0}
              </div>
              <div>
                来源统计：LLM 补全轮次 {taskGeneration.quality?.llmCompletionPasses ?? 0}，LLM 生成{' '}
                {taskGeneration.quality?.llmGeneratedCount ?? tasks.length}，非 LLM 任务{' '}
                {taskGeneration.quality?.nonLlmGeneratedCount ?? 0}
              </div>
              <div>
                命名可读化：可读名称 {taskGeneration.quality?.nameReadableCount ?? tasks.length}，名称改写{' '}
                {taskGeneration.quality?.nameRewrittenCount ??
                  taskGeneration.quality?.rewrittenNameCount ??
                  0}
                ，术语替换 {taskGeneration.quality?.nameJargonRejectedCount ?? 0}，修正轮次{' '}
                {taskGeneration.quality?.namePolishPasses ?? 0}
              </div>
            </CardContent>
          </Card>
        )}

        {taskGeneration.status === 'failed' && (
          <Card className="bg-red-500/10 border-red-500/30 mb-4">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-red-500/20 flex items-center justify-center">
                  <ShieldAlert className="w-5 h-5 text-red-300" />
                </div>
                <div>
                  <CardTitle className="text-red-100">任务生成失败（已阻断）</CardTitle>
                  <CardDescription className="text-red-200/80">
                    当前仅展示诊断结果，不展示模板任务。请重试或更换网址。
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="text-sm text-red-100 space-y-1">
              <div>错误码：{taskGeneration.code}</div>
              <div>原因：{taskGeneration.message}</div>
            </CardContent>
          </Card>
        )}

        <Card className="bg-slate-900/50 border-slate-800">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-purple-500/20 flex items-center justify-center">
                <Layers className="w-5 h-5 text-purple-400" />
              </div>
              <div>
                <CardTitle className="text-slate-100">B. 生成的可用性任务建议 ({tasks.length}项)</CardTitle>
                <CardDescription className="text-slate-400">
                  该任务列表由 API 分析目标网址后实时生成
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {taskGeneration.status === 'failed' ? (
              <div className="text-sm text-red-200">
                任务生成被阻断：{taskGeneration.message}
              </div>
            ) : tasks.length === 0 ? (
              <div className="text-sm text-slate-500">等待任务建议生成...</div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {tasks.map((task, index) => (
                  <div
                    key={task.id}
                    className="p-3 bg-slate-950/50 border border-slate-800 rounded-lg hover:border-slate-700 transition-colors animate-scale-in"
                    style={{ animationDelay: `${500 + index * 30}ms` }}
                  >
                    <button
                      type="button"
                      className="w-full text-left"
                      onClick={() =>
                        setExpandedTaskId((prev) => (prev === task.id ? null : task.id))
                      }
                    >
                      <div className="flex items-start gap-3">
                        <span className="text-xs font-mono text-slate-600 mt-0.5">
                          {String(task.id).padStart(2, '0')}
                        </span>
                        <div className="flex-1">
                          <div className="text-sm font-medium text-slate-300 flex items-center justify-between gap-2">
                            <span>{task.name}</span>
                            {expandedTaskId === task.id ? (
                              <ChevronUp className="w-4 h-4 text-slate-500" />
                            ) : (
                              <ChevronDown className="w-4 h-4 text-slate-500" />
                            )}
                          </div>
                          <div className="text-xs text-slate-500 mt-0.5">{task.description}</div>
                        </div>
                      </div>
                    </button>

                    {expandedTaskId === task.id && (
                      <div className="mt-3 rounded-lg border border-slate-800 bg-slate-900/40 p-3 space-y-3">
                        {task.evidenceReason && (
                          <div>
                            <div className="text-xs text-cyan-300 mb-1">证据说明</div>
                            <p className="text-xs text-slate-300">{task.evidenceReason}</p>
                          </div>
                        )}
                        {task.evidenceRefs && task.evidenceRefs.length > 0 && (
                          <div>
                            <div className="text-xs text-cyan-300 mb-1">证据引用</div>
                            <div className="flex flex-wrap gap-1">
                              {task.evidenceRefs.map((evidenceRef) => (
                                <Badge
                                  key={`${task.id}-${evidenceRef}`}
                                  variant="outline"
                                  className="text-[10px] border-cyan-500/30 text-cyan-200"
                                >
                                  {evidenceRef}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        )}
                        <div>
                          <div className="text-xs text-blue-300 mb-1">测试场景</div>
                          <p className="text-xs text-slate-300">{resolveTaskDetail(task).testScenario}</p>
                        </div>
                        <div className="grid grid-cols-1 gap-3">
                          <div>
                            <div className="text-xs text-slate-400 mb-1">操作步骤</div>
                            <ol className="space-y-1">
                              {resolveTaskDetail(task).operationSteps.map((step, stepIndex) => (
                                <li key={`${task.id}-op-${stepIndex}`} className="text-xs text-slate-300">
                                  {stepIndex + 1}. {step}
                                </li>
                              ))}
                            </ol>
                          </div>
                          <div>
                            <div className="text-xs text-slate-400 mb-1">成功标准</div>
                            <ul className="space-y-1">
                              {resolveTaskDetail(task).successCriteria.map((criterion) => (
                                <li key={`${task.id}-criterion-${criterion}`} className="text-xs text-emerald-300">
                                  ✓ {criterion}
                                </li>
                              ))}
                            </ul>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="flex justify-end animate-fade-in" style={{ animationDelay: '800ms' }}>
        <Button
          onClick={onNext}
          disabled={!canProceed}
          className="bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-50"
        >
          下一步：选择任务与测试人员
          <ArrowRight className="w-4 h-4 ml-2" />
        </Button>
      </div>
    </div>
  );
}
