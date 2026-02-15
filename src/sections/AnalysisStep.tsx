import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { taskDetailTemplates } from '@/data/mock/taskDetailTemplates';
import { Check, AlertTriangle, X, FileCode, Layers, ArrowRight, Code, ChevronDown, ChevronUp, Loader2 } from 'lucide-react';
import type { DiagnosisItem, Task } from '@/types';

interface AnalysisStepProps {
  targetUrl: string;
  diagnosis: DiagnosisItem[];
  tasks: Task[];
  onNext: () => void;
}

const statusConfig = {
  success: { icon: Check, color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/30', label: '正常' },
  warning: { icon: AlertTriangle, color: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/30', label: '警告' },
  error: { icon: X, color: 'text-red-400', bg: 'bg-red-500/10', border: 'border-red-500/30', label: '错误' },
};

const analysisStages = [
  { id: 'crawl', label: '页面抓取', detail: '抓取 DOM 结构与交互元素清单' },
  { id: 'structure', label: '结构解析', detail: '进行 DOM 分块并提取关键路径节点' },
  { id: 'risk', label: '风险检查', detail: '检查无障碍、回环与异常状态风险' },
  { id: 'tasks', label: '任务生成', detail: '生成并映射可用性任务模板' },
];

function resolveTaskDetail(task: Task) {
  const detail = taskDetailTemplates[task.id];
  if (detail) {
    return detail;
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

export function AnalysisStep({ targetUrl, diagnosis, tasks, onNext }: AnalysisStepProps) {
  const [activeStageIndex, setActiveStageIndex] = useState(0);
  const [expandedTaskId, setExpandedTaskId] = useState<number | null>(null);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setActiveStageIndex((prev) => (prev + 1) % analysisStages.length);
    }, 1100);

    return () => {
      window.clearInterval(timer);
    };
  }, []);

  const activeStage = analysisStages[activeStageIndex];
  const completedStageIds = useMemo(
    () =>
      new Set(
        analysisStages
          .slice(0, activeStageIndex)
          .map((stage) => stage.id),
      ),
    [activeStageIndex],
  );

  return (
    <div className="space-y-6">
      {/* 页面分析中动画 */}
      <div className="flex items-center gap-4 p-4 bg-slate-900/50 border border-slate-800 rounded-lg animate-fade-in">
        <div className="w-10 h-10 rounded-full bg-emerald-500/20 flex items-center justify-center animate-spin">
          <Code className="w-5 h-5 text-emerald-400" />
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className="text-slate-100 font-medium">正在分析页面</span>
            <Badge variant="outline" className="text-xs border-slate-700 text-slate-400">
              {targetUrl}
            </Badge>
          </div>
          <div className="text-sm text-slate-500 mt-1">
            观察者 (Observer) 抓取页面源代码 · 执行 DOM 分块 · 构建抽象交互图
          </div>
        </div>
      </div>

      <Card className="bg-slate-900/50 border-slate-800 animate-slide-up" style={{ animationDelay: '60ms' }}>
        <CardHeader>
          <CardTitle className="text-slate-100 text-base">实时检查状态</CardTitle>
          <CardDescription className="text-slate-400">
            当前正在检查：{activeStage.label} · {activeStage.detail}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {analysisStages.map((stage) => {
              const isActive = stage.id === activeStage.id;
              const isCompleted = completedStageIds.has(stage.id);

              return (
                <div
                  key={stage.id}
                  className={`rounded-lg border px-3 py-2 flex items-center justify-between ${
                    isActive
                      ? 'border-emerald-500/40 bg-emerald-500/10'
                      : isCompleted
                        ? 'border-blue-500/30 bg-blue-500/10'
                        : 'border-slate-800 bg-slate-950/40'
                  }`}
                >
                  <div className="text-sm">
                    <div className={`${isActive ? 'text-emerald-200' : isCompleted ? 'text-blue-200' : 'text-slate-300'}`}>
                      {stage.label}
                    </div>
                    <div className="text-xs text-slate-500">{stage.detail}</div>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    {isActive && (
                      <>
                        <Loader2 className="w-3 h-3 text-emerald-300 animate-spin" />
                        <span className="text-emerald-300">检查中</span>
                      </>
                    )}
                    {!isActive && isCompleted && (
                      <>
                        <Check className="w-3 h-3 text-blue-300" />
                        <span className="text-blue-300">已检查</span>
                      </>
                    )}
                    {!isActive && !isCompleted && <span className="text-slate-500">等待中</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* 技术诊断报告 */}
      <div className="animate-slide-up" style={{ animationDelay: '100ms' }}>
        <Card className="bg-slate-900/50 border-slate-800">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center">
                <FileCode className="w-5 h-5 text-blue-400" />
              </div>
              <div>
                <CardTitle className="text-slate-100">A. 初步技术诊断报告</CardTitle>
                <CardDescription className="text-slate-400">
                  基于 DOM 分析和抽象交互图构建
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {diagnosis.map((item, index) => {
                const config = statusConfig[item.status];
                const Icon = config.icon;
                
                return (
                  <div
                    key={index}
                    className={`
                      flex items-start gap-4 p-4 rounded-lg border animate-slide-in-left
                      ${config.bg} ${config.border}
                    `}
                    style={{ animationDelay: `${200 + index * 100}ms` }}
                  >
                    <div className={`w-8 h-8 rounded-full bg-slate-950/50 flex items-center justify-center flex-shrink-0`}>
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
          </CardContent>
        </Card>
      </div>

      {/* 可用性任务建议 */}
      <div className="animate-slide-up" style={{ animationDelay: '400ms' }}>
        <Card className="bg-slate-900/50 border-slate-800">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-purple-500/20 flex items-center justify-center">
                <Layers className="w-5 h-5 text-purple-400" />
              </div>
              <div>
                <CardTitle className="text-slate-100">B. 生成的可用性任务建议 (15项)</CardTitle>
                <CardDescription className="text-slate-400">
                  系统基于抽象交互图自动生成以下任务
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
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
          </CardContent>
        </Card>
      </div>

      {/* 下一步按钮 */}
      <div className="flex justify-end animate-fade-in" style={{ animationDelay: '800ms' }}>
        <Button
          onClick={onNext}
          className="bg-emerald-600 hover:bg-emerald-700 text-white"
        >
          下一步：选择任务与测试人员
          <ArrowRight className="w-4 h-4 ml-2" />
        </Button>
      </div>
    </div>
  );
}
