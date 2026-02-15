import { useEffect, useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { defaultReportNavSections } from '@/services/finalReportBuilder';
import { reportTemplates } from '@/data/mock/reportTemplates';
import {
  AlertTriangle,
  CheckCircle,
  CheckCircle2,
  Clock,
  Lightbulb,
  ListTree,
  MessageSquare,
  MousePointer,
  Navigation,
  RefreshCw,
  Send,
  Target,
  TrendingUp,
  UserCircle2,
  Users,
  XCircle,
} from 'lucide-react';
import type {
  AgentEmotion,
  CategoryReportItem,
  FinalReportBundle,
  QAFilter,
  QAHistoryItem,
  QualitativeInsight,
  QuantitativeMetric,
  RepresentativeSample,
  TaskStatus,
  TestRunSnapshot,
} from '@/types';

interface ReportStepProps {
  targetUrl: string;
  quantitativeMetrics: QuantitativeMetric[];
  qualitativeInsights: QualitativeInsight[];
  categorySummary: CategoryReportItem[];
  representativeSamples: RepresentativeSample[];
  recommendations: string[];
  finalReportBundle: FinalReportBundle | null;
  runSnapshot: TestRunSnapshot | null;
  qaHistory: QAHistoryItem[];
  onAskCaseQuestion: (question: string, caseId?: string) => Promise<unknown> | unknown;
  onAskGlobalQuestion: (question: string, filters?: QAFilter) => Promise<unknown> | unknown;
  onRestart: () => void;
}

function emotionPeakClassName(emotionPeak: string): string {
  if (emotionPeak.includes('极高')) return 'bg-red-500/20 text-red-300 border-red-500/30';
  if (emotionPeak.includes('高')) return 'bg-orange-500/20 text-orange-300 border-orange-500/30';
  if (emotionPeak.includes('中')) return 'bg-amber-500/20 text-amber-300 border-amber-500/30';
  return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30';
}

function groupedSamplesByCategory(samples: RepresentativeSample[]): Map<string, RepresentativeSample[]> {
  const grouped = new Map<string, RepresentativeSample[]>();
  for (const sample of samples) {
    const key = `${sample.categoryId}::${sample.categoryName}`;
    const list = grouped.get(key) ?? [];
    list.push(sample);
    grouped.set(key, list);
  }
  return grouped;
}

function statusBadgeClass(status: TaskStatus): string {
  if (status === 'success') return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30';
  if (status === 'failed') return 'bg-red-500/20 text-red-300 border-red-500/30';
  if (status === 'running') return 'bg-blue-500/20 text-blue-300 border-blue-500/30';
  return 'bg-slate-800 text-slate-300 border-slate-700';
}

function taskPerformanceStatusClasses(status: 'healthy' | 'warning' | 'risk'): string {
  if (status === 'healthy') {
    return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30';
  }
  if (status === 'warning') {
    return 'bg-amber-500/20 text-amber-300 border-amber-500/30';
  }
  return 'bg-red-500/20 text-red-300 border-red-500/30';
}

function nasaToneClasses(tone: 'positive' | 'neutral' | 'negative'): {
  value: string;
  bar: string;
} {
  if (tone === 'positive') {
    return {
      value: 'text-emerald-600',
      bar: 'bg-emerald-500',
    };
  }
  if (tone === 'neutral') {
    return {
      value: 'text-amber-600',
      bar: 'bg-amber-500',
    };
  }
  return {
    value: 'text-orange-600',
    bar: 'bg-orange-500',
  };
}

function susRangeClasses(tone: 'positive' | 'neutral' | 'negative'): string {
  if (tone === 'positive') {
    return 'bg-emerald-400';
  }
  if (tone === 'neutral') {
    return 'bg-amber-400';
  }
  return 'bg-red-300';
}

function parseClockToSeconds(clock: string): number {
  const [m, s] = clock.split(':').map((part) => Number.parseInt(part, 10));
  if (!Number.isFinite(m) || !Number.isFinite(s)) {
    return 0;
  }
  return m * 60 + s;
}

export function ReportStep({
  targetUrl,
  quantitativeMetrics,
  qualitativeInsights,
  categorySummary,
  representativeSamples,
  recommendations,
  finalReportBundle,
  runSnapshot,
  qaHistory,
  onAskCaseQuestion,
  onAskGlobalQuestion,
  onRestart,
}: ReportStepProps) {
  const [globalQuestion, setGlobalQuestion] = useState('');
  const [filterTaskId, setFilterTaskId] = useState<string>('all');
  const [filterCategoryId, setFilterCategoryId] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterEmotion, setFilterEmotion] = useState<string>('all');
  const [localGeneratedAt] = useState(() => new Date().toISOString());

  const navSections = useMemo(
    () => finalReportBundle?.navigation ?? defaultReportNavSections,
    [finalReportBundle],
  );

  const [activeSectionId, setActiveSectionId] = useState<string>(navSections[0]?.id ?? 'overview');
  const effectiveActiveSectionId = navSections.some((section) => section.id === activeSectionId)
    ? activeSectionId
    : (navSections[0]?.id ?? 'overview');

  useEffect(() => {
    if (typeof window === 'undefined' || !('IntersectionObserver' in window)) {
      return;
    }

    const elements = navSections
      .map((section) => document.getElementById(section.id))
      .filter((element): element is HTMLElement => element !== null);

    if (elements.length === 0) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const visibleEntries = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio);

        if (visibleEntries[0]) {
          setActiveSectionId(visibleEntries[0].target.id);
        }
      },
      {
        root: null,
        rootMargin: '-25% 0px -60% 0px',
        threshold: [0.2, 0.35, 0.55],
      },
    );

    for (const element of elements) {
      observer.observe(element);
    }

    return () => observer.disconnect();
  }, [navSections]);

  const bundle = finalReportBundle;

  const derivedSuccessRate =
    quantitativeMetrics.length > 0
      ? Math.round(
          quantitativeMetrics.reduce((acc, metric) => acc + metric.successRate, 0) /
            quantitativeMetrics.length,
        )
      : 0;

  const fallbackTier = derivedSuccessRate >= 90
    ? 'excellent'
    : derivedSuccessRate >= 75
      ? 'medium'
      : 'needs-improvement';

  const fallbackTemplate = reportTemplates[fallbackTier];

  const fallbackAverageDuration = bundle?.taskPerformance && bundle.taskPerformance.length > 0
    ? (() => {
        const durations = bundle.taskPerformance
          .map((item) => parseClockToSeconds(item.averageDuration))
          .filter((value) => value > 0);
        if (durations.length === 0) {
          return fallbackTemplate.kpi.averageTaskDuration;
        }
        const total = durations.reduce((sum, value) => sum + value, 0);
        const avg = Math.round(total / durations.length);
        const minute = Math.floor(avg / 60);
        const second = avg % 60;
        return `${minute}:${String(second).padStart(2, '0')}`;
      })()
    : fallbackTemplate.kpi.averageTaskDuration;

  const kpi = bundle?.kpi ?? {
    averageCompletionRate: derivedSuccessRate,
    susScore: fallbackTemplate.kpi.susScore,
    averageTaskDuration: fallbackAverageDuration,
    averageErrorRate: fallbackTemplate.kpi.averageErrorRate,
  };

  const taskDetails = bundle?.taskDetails ?? [];
  const fallbackTaskPerformance = quantitativeMetrics.map((metric) => {
    const errorPerTask = Number((Math.max(0.15, (100 - metric.successRate) / 45)).toFixed(2));
    const helpRequests = Number((Math.max(0.05, (100 - metric.successRate) / 60)).toFixed(2));
    let status: 'healthy' | 'warning' | 'risk' = 'healthy';
    if (metric.successRate < 75) {
      status = 'risk';
    } else if (metric.successRate < 90) {
      status = 'warning';
    }

    return {
      taskId: metric.taskId,
      taskName: metric.taskName,
      completionRate: metric.successRate,
      averageDuration: fallbackTemplate.kpi.averageTaskDuration,
      errorPerTask,
      helpRequests,
      status,
    };
  });
  const taskPerformance = bundle?.taskPerformance ?? fallbackTaskPerformance;
  const susReport = bundle?.sus ?? fallbackTemplate.sus;
  const nasaTlxReport = bundle?.nasaTlx ?? fallbackTemplate.nasaTlx;

  const sampleGroups = groupedSamplesByCategory(representativeSamples);
  const globalHistory = useMemo(() => qaHistory.filter((item) => item.scope === 'global').slice(0, 8), [qaHistory]);
  const generatedAt = bundle?.generatedAt ?? runSnapshot?.createdAt ?? localGeneratedAt;

  const scrollToSection = (sectionId: string) => {
    const section = document.getElementById(sectionId);
    if (!section) {
      return;
    }
    section.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
    setActiveSectionId(sectionId);
  };

  const askGlobal = () => {
    const question = globalQuestion.trim();
    if (!question || !runSnapshot) {
      return;
    }

    const filters: QAFilter = {};
    if (filterTaskId !== 'all') {
      filters.taskId = Number(filterTaskId);
    }
    if (filterCategoryId !== 'all') {
      filters.categoryId = filterCategoryId;
    }
    if (filterStatus !== 'all') {
      filters.status = filterStatus as TaskStatus;
    }
    if (filterEmotion !== 'all') {
      filters.emotion = filterEmotion as AgentEmotion;
    }

    void onAskGlobalQuestion(question, Object.keys(filters).length > 0 ? filters : undefined);
    setGlobalQuestion('');
  };

  const kpiCards = [
    {
      key: 'completion',
      title: '平均完成率',
      value: `${kpi.averageCompletionRate}%`,
      hint: '目标: ≥85%',
      icon: CheckCircle2,
      className: 'bg-gradient-to-r from-emerald-500 to-emerald-600 text-white',
    },
    {
      key: 'sus',
      title: 'SUS评分',
      value: kpi.susScore.toFixed(1),
      hint: `等级: ${susReport.grade} ${susReport.acceptability}`,
      icon: TrendingUp,
      className: 'bg-gradient-to-r from-blue-500 to-blue-600 text-white',
    },
    {
      key: 'duration',
      title: '平均任务时间',
      value: kpi.averageTaskDuration,
      hint: `样本: ${runSnapshot?.executions.length ?? 0} 条`,
      icon: Clock,
      className: 'bg-gradient-to-r from-violet-500 to-purple-600 text-white',
    },
    {
      key: 'error',
      title: '平均错误率',
      value: kpi.averageErrorRate.toFixed(2),
      hint: '每任务平均错误',
      icon: MousePointer,
      className: 'bg-gradient-to-r from-orange-500 to-orange-600 text-white',
    },
  ];

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-3 sm:p-4 lg:p-6 text-slate-100 space-y-6">
      <div className="flex flex-col gap-3 rounded-xl border border-slate-800 bg-slate-900/60 p-4 sm:p-5">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-2xl font-bold text-slate-100">可用性测试最终报告</h2>
            <div className="mt-2 flex items-center gap-2 flex-wrap text-xs sm:text-sm text-slate-500">
              <Badge variant="outline" className="border-slate-800 text-slate-400 bg-slate-900/40">
                {targetUrl}
              </Badge>
              {runSnapshot && (
                <Badge variant="outline" className="border-slate-800 text-slate-400 bg-slate-900/40">
                  Run: {runSnapshot.runId}
                </Badge>
              )}
              <span>生成时间: {new Date(generatedAt).toLocaleString('zh-CN')}</span>
            </div>
          </div>
          <div className="rounded-lg bg-slate-800/60 px-4 py-2 text-right">
            <div className="text-xs text-slate-500">当前档位</div>
            <div className="text-sm font-semibold text-slate-200">{bundle?.tier ?? fallbackTier}</div>
          </div>
        </div>
      </div>

      <div className="lg:grid lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-6">
        <aside className="hidden lg:block">
          <div className="sticky top-28 rounded-xl border border-slate-800 bg-slate-900/50 p-3">
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-300">
              <Navigation className="w-4 h-4 text-blue-500" />
              报告目录
            </div>
            <div className="space-y-1">
              {navSections.map((section) => {
                const active = section.id === effectiveActiveSectionId;
                return (
                  <button
                    key={section.id}
                    type="button"
                    aria-current={active ? 'true' : undefined}
                    data-active={active ? 'true' : 'false'}
                    className={`w-full rounded-md px-3 py-2 text-left text-sm transition-colors ${
                      active
                        ? 'bg-slate-800 text-emerald-300 border border-emerald-500/40'
                        : 'text-slate-400 hover:bg-slate-800/60 border border-transparent'
                    }`}
                    onClick={() => scrollToSection(section.id)}
                  >
                    {section.label}
                  </button>
                );
              })}
            </div>
          </div>
        </aside>

        <div className="space-y-6 mt-4 lg:mt-0">
          <div className="lg:hidden sticky top-24 z-20 rounded-lg border border-slate-800 bg-slate-900/50 p-3 shadow-sm">
            <label htmlFor="report-mobile-nav" className="text-xs text-slate-500 block mb-1">
              报告目录
            </label>
            <select
              id="report-mobile-nav"
              aria-label="移动端报告目录"
              className="h-9 w-full rounded-md border border-slate-700 bg-slate-900/50 px-2 text-sm text-slate-300"
              value={effectiveActiveSectionId}
              onChange={(event) => scrollToSection(event.target.value)}
            >
              {navSections.map((section) => (
                <option key={section.id} value={section.id}>
                  {section.label}
                </option>
              ))}
            </select>
          </div>

          <section id="overview" className="scroll-mt-32 space-y-4">
            <h3 className="text-2xl font-bold text-slate-100">报告总览</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
              {kpiCards.map((card) => (
                <div key={card.key} className={`rounded-xl p-5 shadow-sm ${card.className}`}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-lg font-semibold opacity-95">{card.title}</div>
                    <card.icon className="w-5 h-5 opacity-90" />
                  </div>
                  <div className="text-5xl font-bold leading-tight">{card.value}</div>
                  <div className="mt-1 text-lg opacity-90">{card.hint}</div>
                </div>
              ))}
            </div>
          </section>

          <section id="task-details" className="scroll-mt-32 space-y-4">
            <div className="flex items-center gap-2">
              <ListTree className="w-5 h-5 text-blue-600" />
              <h3 className="text-2xl font-bold text-slate-100">任务详情</h3>
            </div>
            <div className="space-y-4">
              {taskDetails.map((detail) => (
                <Card key={detail.taskId} className="bg-slate-900/50 border-slate-800">
                  <CardHeader>
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div className="space-y-1">
                        <CardTitle className="text-slate-100 text-xl">
                          {detail.taskCode} {detail.title}
                        </CardTitle>
                        <CardDescription className="text-slate-400">
                          任务描述: {quantitativeMetrics.find((item) => item.taskId === detail.taskId)?.bottleneck ?? '基于当前任务模板生成'}
                        </CardDescription>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-500/30">{detail.difficulty}</Badge>
                        <Badge variant="outline" className="border-slate-800 text-slate-400">
                          {detail.estimatedDuration}
                        </Badge>
                        {detail.tags.map((tag) => (
                          <Badge key={`${detail.taskId}-${tag}`} variant="outline" className="border-slate-800 text-slate-400">
                            {tag}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="rounded-lg border border-blue-500/30 bg-blue-500/10 px-4 py-3">
                      <div className="text-sm font-semibold text-blue-300 mb-1">测试场景</div>
                      <p className="text-blue-100">{detail.testScenario}</p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <div className="font-semibold text-slate-100 mb-2">操作步骤</div>
                        <ol className="space-y-2">
                          {detail.operationSteps.map((step, index) => (
                            <li key={`${detail.taskId}-step-${index}`} className="flex items-start gap-2 text-sm text-slate-300">
                              <span className="mt-0.5 flex h-5 w-5 items-center justify-center rounded bg-slate-800/60 text-xs font-medium text-slate-400">
                                {index + 1}
                              </span>
                              <span>{step}</span>
                            </li>
                          ))}
                        </ol>
                      </div>

                      <div>
                        <div className="font-semibold text-slate-100 mb-2">成功标准</div>
                        <ul className="space-y-2">
                          {detail.successCriteria.map((criterion) => (
                            <li key={`${detail.taskId}-${criterion}`} className="flex items-start gap-2 text-sm text-slate-300">
                              <CheckCircle2 className="w-4 h-4 mt-0.5 text-emerald-600" />
                              <span>{criterion}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>

                    <div className="flex justify-end">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="border-slate-700 text-slate-300 hover:bg-slate-800"
                        onClick={() =>
                          void onAskGlobalQuestion(`请分析任务「${detail.title}」的分步骤失败风险。`, {
                            taskId: detail.taskId,
                          })
                        }
                      >
                        追问该任务流程
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}

              {taskDetails.length === 0 && (
                <div className="rounded-lg border border-dashed border-slate-700 bg-slate-900/50 p-4 text-sm text-slate-500">
                  当前 run 无任务详情数据。
                </div>
              )}
            </div>
          </section>

          <section id="task-performance" className="scroll-mt-32 space-y-4">
            <div className="flex items-center gap-2">
              <Target className="w-5 h-5 text-indigo-600" />
              <h3 className="text-2xl font-bold text-slate-100">任务完成绩效</h3>
            </div>

            <Card className="bg-slate-900/50 border-slate-800">
              <CardContent className="pt-6">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[760px]">
                    <thead>
                      <tr className="border-b border-slate-800 text-left">
                        <th className="px-3 py-3 text-sm text-slate-500 font-medium">任务</th>
                        <th className="px-3 py-3 text-sm text-slate-500 font-medium">完成率</th>
                        <th className="px-3 py-3 text-sm text-slate-500 font-medium">平均用时</th>
                        <th className="px-3 py-3 text-sm text-slate-500 font-medium">错误/任务</th>
                        <th className="px-3 py-3 text-sm text-slate-500 font-medium">求助次数</th>
                        <th className="px-3 py-3 text-sm text-slate-500 font-medium">状态</th>
                        <th className="px-3 py-3 text-sm text-slate-500 font-medium">追问</th>
                      </tr>
                    </thead>
                    <tbody>
                      {taskPerformance.map((item) => (
                        <tr key={item.taskId} className="border-b border-slate-800/60 hover:bg-slate-800/40">
                          <td className="px-3 py-3 text-sm text-slate-200">
                            <span className="text-blue-400 font-semibold mr-2">T{item.taskId}</span>
                            {item.taskName}
                          </td>
                          <td className="px-3 py-3">
                            <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-500/30">
                              {item.completionRate}%
                            </Badge>
                          </td>
                          <td className="px-3 py-3 text-sm text-slate-300">{item.averageDuration}</td>
                          <td className="px-3 py-3 text-sm text-slate-300">{item.errorPerTask.toFixed(2)}</td>
                          <td className="px-3 py-3 text-sm text-slate-300">{item.helpRequests.toFixed(2)}</td>
                          <td className="px-3 py-3">
                            <Badge className={`${taskPerformanceStatusClasses(item.status)} border`}>
                              {item.status === 'healthy' && <CheckCircle className="w-3 h-3 mr-1" />}
                              {item.status === 'warning' && <AlertTriangle className="w-3 h-3 mr-1" />}
                              {item.status === 'risk' && <XCircle className="w-3 h-3 mr-1" />}
                              {item.status === 'healthy' ? '正常' : item.status === 'warning' ? '关注' : '风险'}
                            </Badge>
                          </td>
                          <td className="px-3 py-3">
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="border-slate-700 text-slate-300 hover:bg-slate-800"
                              onClick={() =>
                                void onAskGlobalQuestion(`任务「${item.taskName}」为何出现当前完成率？`, {
                                  taskId: item.taskId,
                                })
                              }
                            >
                              追问任务
                            </Button>
                          </td>
                        </tr>
                      ))}

                      {taskPerformance.length === 0 && (
                        <tr>
                          <td colSpan={7} className="px-3 py-4 text-sm text-slate-500">
                            暂无任务绩效数据。
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </section>

          <section id="sus" className="scroll-mt-32 space-y-4">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-violet-600" />
              <h3 className="text-2xl font-bold text-slate-100">SUS可用性量表结果</h3>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-[300px_minmax(0,1fr)] gap-4">
              <Card className="bg-slate-900/50 border-slate-800">
                <CardContent className="pt-6">
                  <div className="space-y-3">
                    <div className="text-lg font-semibold text-slate-200">总体评分</div>
                    <div className="text-6xl font-bold text-violet-600 leading-none">
                      {susReport.totalScore.toFixed(1)}
                    </div>
                    <div className="text-2xl text-slate-500">/ 100</div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge className="bg-violet-500/20 text-violet-300 border-violet-500/30">{susReport.acceptability}</Badge>
                      <Badge className="bg-blue-500/20 text-blue-300 border-blue-500/30">等级 {susReport.grade}</Badge>
                    </div>
                    <div className="text-sm text-slate-400">百分位排名: {susReport.percentileRank}%</div>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-slate-900/50 border-slate-800">
                <CardHeader>
                  <CardTitle className="text-slate-100">评分量表参考</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {susReport.rangeReferences.map((range) => {
                    const inRange = susReport.totalScore >= range.min && susReport.totalScore <= range.max;
                    return (
                      <div key={`${range.label}-${range.level}`} className="grid grid-cols-[96px_minmax(0,1fr)_70px] items-center gap-3">
                        <div className="text-slate-500">{range.label}</div>
                        <div className="relative h-4 rounded bg-slate-800/60 overflow-hidden">
                          <div className={`h-full ${susRangeClasses(range.tone)}`} />
                          {inRange && (
                            <div
                              className="absolute top-0 h-full w-1 bg-rose-500"
                              style={{
                                left: `${((susReport.totalScore - range.min) / Math.max(1, range.max - range.min)) * 100}%`,
                              }}
                            />
                          )}
                        </div>
                        <div className="font-semibold text-slate-300">{range.level}</div>
                      </div>
                    );
                  })}
                  <p className="text-sm text-slate-400">
                    红色标记指示当前系统评分位置（{susReport.totalScore.toFixed(1)}分）。
                  </p>
                </CardContent>
              </Card>
            </div>

            <Card className="bg-slate-900/50 border-slate-800">
              <CardHeader>
                <CardTitle className="text-slate-100">各题项评分详情</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {susReport.questionScores.map((item) => (
                  <div key={item.id} className="grid grid-cols-[30px_minmax(0,1fr)_220px_42px] items-center gap-3 py-1">
                    <div className="text-slate-400">{item.id}</div>
                    <div className="text-slate-300 text-sm">{item.question}</div>
                    <div className="h-3 rounded bg-slate-800/60 overflow-hidden">
                      <div
                        className={`h-full ${item.polarity === 'positive' ? 'bg-blue-400' : 'bg-orange-400'}`}
                        style={{ width: `${(item.score / 5) * 100}%` }}
                      />
                    </div>
                    <div
                      className={`text-right font-semibold ${
                        item.polarity === 'positive' ? 'text-emerald-300' : 'text-orange-300'
                      }`}
                    >
                      {item.score}
                    </div>
                  </div>
                ))}
                <div className="pt-2 text-sm text-slate-500">蓝色为正向题，橙色为反向题。</div>
              </CardContent>
            </Card>
          </section>

          <section id="nasa-tlx" className="scroll-mt-32 space-y-4">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-orange-600" />
              <h3 className="text-2xl font-bold text-slate-100">NASA-TLX 工作负荷评估</h3>
            </div>

            <Card className="bg-slate-900/50 border-slate-800">
              <CardContent className="pt-6 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  {nasaTlxReport.dimensions.map((dimension) => {
                    const style = nasaToneClasses(dimension.tone);
                    return (
                      <div key={dimension.id} className="rounded-xl border border-slate-800 p-4 bg-slate-900/40">
                        <div className="flex items-center justify-between mb-3">
                          <div className="text-2xl font-semibold text-slate-200">{dimension.label}</div>
                          <div className={`text-4xl font-bold ${style.value}`}>{dimension.value}</div>
                        </div>
                        <div className="h-3 rounded bg-slate-800 overflow-hidden mb-2">
                          <div className={`h-full ${style.bar}`} style={{ width: `${dimension.value}%` }} />
                        </div>
                        <div className="text-sm text-slate-500">{dimension.description}</div>
                      </div>
                    );
                  })}
                </div>

                <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4 flex items-center justify-between gap-3 flex-wrap">
                  <div>
                    <div className="text-3xl font-semibold text-slate-200">加权工作负荷指数 (WWL)</div>
                    <div className="text-slate-400 mt-2">{nasaTlxReport.summary}</div>
                  </div>
                  <div className="text-6xl font-bold text-orange-600">{nasaTlxReport.wwl.toFixed(1)}</div>
                </div>

                <div className="rounded-xl bg-slate-800/60 p-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <div className="rounded-lg bg-slate-900/50 p-4 border border-slate-800">
                    <div className="text-2xl font-semibold text-slate-100 mb-2">优势表现</div>
                    <ul className="space-y-2">
                      {nasaTlxReport.strengths.map((item) => (
                        <li key={item} className="text-slate-300 flex items-start gap-2">
                          <CheckCircle2 className="w-4 h-4 mt-1 text-emerald-600" />
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className="rounded-lg bg-slate-900/50 p-4 border border-slate-800">
                    <div className="text-2xl font-semibold text-slate-100 mb-2">需改进</div>
                    <ul className="space-y-2">
                      {nasaTlxReport.risks.map((item) => (
                        <li key={item} className="text-slate-300 flex items-start gap-2">
                          <AlertTriangle className="w-4 h-4 mt-1 text-orange-600" />
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </CardContent>
            </Card>
          </section>

          <section id="category-summary" className="scroll-mt-32 space-y-4">
            <div className="flex items-center gap-2">
              <Users className="w-5 h-5 text-indigo-600" />
              <h3 className="text-2xl font-bold text-slate-100">类别汇总</h3>
            </div>

            <Card className="bg-slate-900/50 border-slate-800">
              <CardContent className="pt-6">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[760px]">
                    <thead>
                      <tr className="border-b border-slate-800 text-left">
                        <th className="px-3 py-3 text-sm text-slate-500 font-medium">类别</th>
                        <th className="px-3 py-3 text-sm text-slate-500 font-medium">投入人数</th>
                        <th className="px-3 py-3 text-sm text-slate-500 font-medium">覆盖样本</th>
                        <th className="px-3 py-3 text-sm text-slate-500 font-medium">成功率</th>
                        <th className="px-3 py-3 text-sm text-slate-500 font-medium">主要瓶颈</th>
                        <th className="px-3 py-3 text-sm text-slate-500 font-medium">情绪峰值</th>
                        <th className="px-3 py-3 text-sm text-slate-500 font-medium">追问</th>
                      </tr>
                    </thead>
                    <tbody>
                      {categorySummary.map((item) => (
                        <tr key={item.categoryId} className="border-b border-slate-800/60 hover:bg-slate-800/40">
                          <td className="px-3 py-3 text-sm text-slate-200">{item.categoryName}</td>
                          <td className="px-3 py-3 text-sm text-slate-300">{item.generatedCount}</td>
                          <td className="px-3 py-3 text-sm text-slate-300">{item.sampledCases}</td>
                          <td className="px-3 py-3">
                            <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-500/30">{item.successRate}%</Badge>
                          </td>
                          <td className="px-3 py-3 text-sm text-slate-300">{item.primaryBottleneck}</td>
                          <td className="px-3 py-3">
                            <Badge className={`${emotionPeakClassName(item.emotionPeak)} border`}>{item.emotionPeak}</Badge>
                          </td>
                          <td className="px-3 py-3">
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="border-slate-700 text-slate-300 hover:bg-slate-800"
                              onClick={() =>
                                void onAskGlobalQuestion(`类别「${item.categoryName}」的主要问题是什么？`, {
                                  categoryId: item.categoryId,
                                })
                              }
                            >
                              追问类别
                            </Button>
                          </td>
                        </tr>
                      ))}

                      {categorySummary.length === 0 && (
                        <tr>
                          <td colSpan={7} className="px-3 py-4 text-sm text-slate-500">
                            暂无类别汇总数据。
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </section>

          <section id="representative-samples" className="scroll-mt-32 space-y-4">
            <div className="flex items-center gap-2">
              <UserCircle2 className="w-5 h-5 text-cyan-600" />
              <h3 className="text-2xl font-bold text-slate-100">代表个体样例</h3>
            </div>

            <Card className="bg-slate-900/50 border-slate-800">
              <CardContent className="pt-6">
                <div className="space-y-4">
                  {Array.from(sampleGroups.entries()).map(([groupKey, samples]) => {
                    const categoryName = groupKey.split('::')[1] ?? '未知类别';
                    return (
                      <div key={groupKey} className="rounded-lg border border-slate-800 bg-slate-900/40 p-4">
                        <div className="text-base font-semibold text-slate-200 mb-3">{categoryName}</div>
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                          {samples.map((sample) => (
                            <div
                              key={`${sample.agentId}-${sample.taskId}-${sample.caseId ?? 'sample'}`}
                              className="rounded-lg border border-slate-800 bg-slate-900/50 p-3"
                            >
                              <div className="flex items-center justify-between gap-2 mb-2">
                                <span className="text-sm font-semibold text-slate-200">{sample.agentName}</span>
                                <Badge className={`${statusBadgeClass(sample.status)} border`}>
                                  {sample.status === 'failed' ? '失败样例' : '中位样例'}
                                </Badge>
                              </div>
                              <div className="text-xs text-slate-500 mb-1">任务: {sample.taskName}</div>
                              <div className="text-sm text-slate-300 mb-3">{sample.summary}</div>
                              <div className="flex items-center justify-between gap-2">
                                <Badge className={`${emotionPeakClassName(sample.emotionPeak)} border`}>{sample.emotionPeak}</Badge>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  className="border-slate-700 text-slate-300 hover:bg-slate-800"
                                  disabled={!sample.caseId}
                                  onClick={() =>
                                    void onAskCaseQuestion(
                                      `请解释案例 ${sample.caseId ?? ''} 在任务「${sample.taskName}」中的关键问题。`,
                                      sample.caseId,
                                    )
                                  }
                                >
                                  追问样例
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}

                  {representativeSamples.length === 0 && (
                    <div className="rounded-lg border border-dashed border-slate-700 bg-slate-900/50 p-4 text-sm text-slate-500">
                      暂无代表个体样例。
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </section>

          <section id="global-qa" className="scroll-mt-32 space-y-4">
            <div className="flex items-center gap-2">
              <MessageSquare className="w-5 h-5 text-fuchsia-600" />
              <h3 className="text-2xl font-bold text-slate-100">全局追问（当前 Run）</h3>
            </div>

            <Card className="bg-slate-900/50 border-slate-800">
              <CardContent className="pt-6 space-y-4">
                <Textarea
                  value={globalQuestion}
                  onChange={(event) => setGlobalQuestion(event.target.value)}
                  placeholder="例如：为什么银发族在结账任务上失败率更高？"
                  className="min-h-[90px] border-slate-700 bg-slate-900/50 text-slate-100"
                />

                <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
                  <select
                    value={filterTaskId}
                    onChange={(event) => setFilterTaskId(event.target.value)}
                    className="h-9 rounded-md border border-slate-700 bg-slate-900/50 text-slate-300 px-2 text-sm"
                  >
                    <option value="all">全部任务</option>
                    {taskPerformance.map((metric) => (
                      <option key={metric.taskId} value={metric.taskId}>
                        {metric.taskName}
                      </option>
                    ))}
                  </select>
                  <select
                    value={filterCategoryId}
                    onChange={(event) => setFilterCategoryId(event.target.value)}
                    className="h-9 rounded-md border border-slate-700 bg-slate-900/50 text-slate-300 px-2 text-sm"
                  >
                    <option value="all">全部类别</option>
                    {categorySummary.map((item) => (
                      <option key={item.categoryId} value={item.categoryId}>
                        {item.categoryName}
                      </option>
                    ))}
                  </select>
                  <select
                    value={filterStatus}
                    onChange={(event) => setFilterStatus(event.target.value)}
                    className="h-9 rounded-md border border-slate-700 bg-slate-900/50 text-slate-300 px-2 text-sm"
                  >
                    <option value="all">全部状态</option>
                    <option value="success">成功</option>
                    <option value="failed">失败</option>
                  </select>
                  <select
                    value={filterEmotion}
                    onChange={(event) => setFilterEmotion(event.target.value)}
                    className="h-9 rounded-md border border-slate-700 bg-slate-900/50 text-slate-300 px-2 text-sm"
                  >
                    <option value="all">全部情绪</option>
                    <option value="frustrated">沮丧</option>
                    <option value="angry">愤怒</option>
                    <option value="anxious">焦虑</option>
                    <option value="satisfied">满意</option>
                    <option value="neutral">平静</option>
                  </select>
                </div>

                <div className="flex justify-end">
                  <Button
                    type="button"
                    className="bg-emerald-600 hover:bg-emerald-700 text-white"
                    onClick={askGlobal}
                    disabled={!runSnapshot || globalQuestion.trim().length === 0}
                  >
                    <Send className="w-4 h-4 mr-2" />
                    提交全局提问
                  </Button>
                </div>

                <div className="space-y-2">
                  {globalHistory.map((item) => (
                    <div key={item.id} className="rounded-lg border border-slate-800 bg-slate-900/40 p-3">
                      <div className="text-xs text-slate-500 mb-1">问：{item.question}</div>
                      <div className="text-sm text-slate-200 mb-2">答：{item.response.answer}</div>
                      <div className="flex items-center gap-2 text-xs text-slate-500">
                        <Badge className="bg-slate-800 text-slate-200 border-slate-700">
                          {item.response.mode === 'evidence' ? '证据回答' : '推断回答'}
                        </Badge>
                        <span>可信度 {Math.round(item.response.confidence * 100)}%</span>
                      </div>
                      {item.response.evidence.length > 0 && (
                        <div className="mt-2 space-y-1">
                          {item.response.evidence.slice(0, 2).map((evidence) => (
                            <p key={`${item.id}-${evidence.caseId}-${evidence.step}`} className="text-xs text-slate-500">
                              证据: [{evidence.caseId}] {evidence.taskName} Step {evidence.step} - {evidence.excerpt}
                            </p>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}

                  {globalHistory.length === 0 && (
                    <div className="rounded-lg border border-dashed border-slate-700 bg-slate-900/50 p-4 text-sm text-slate-500">
                      还没有全局追问记录。
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </section>

          <section id="qualitative-insights" className="scroll-mt-32 space-y-4">
            <div className="flex items-center gap-2">
              <MessageSquare className="w-5 h-5 text-purple-600" />
              <h3 className="text-2xl font-bold text-slate-100">定性洞察（Gioia）</h3>
            </div>

            <div className="space-y-3">
              {qualitativeInsights.map((insight, index) => (
                <Card key={index} className="bg-slate-900/50 border-slate-800">
                  <CardContent className="pt-6 space-y-3">
                    <div className="rounded-lg border border-blue-500/30 bg-blue-500/10 p-3">
                      <div className="text-xs text-blue-300 mb-1">一阶概念</div>
                      <p className="text-sm text-blue-100">{insight.firstOrder}</p>
                    </div>
                    <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
                      <div className="text-xs text-amber-300 mb-1">二阶主题</div>
                      <p className="text-sm text-amber-100">{insight.secondOrder}</p>
                    </div>
                    <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3">
                      <div className="text-xs text-emerald-300 mb-1">聚合维度</div>
                      <p className="text-sm text-emerald-100">{insight.aggregate}</p>
                    </div>
                  </CardContent>
                </Card>
              ))}

              {qualitativeInsights.length === 0 && (
                <div className="rounded-lg border border-dashed border-slate-700 bg-slate-900/50 p-4 text-sm text-slate-500">
                  暂无定性洞察数据。
                </div>
              )}
            </div>
          </section>

          <section id="recommendations" className="scroll-mt-32 space-y-4">
            <div className="flex items-center gap-2">
              <Lightbulb className="w-5 h-5 text-emerald-600" />
              <h3 className="text-2xl font-bold text-slate-100">优化建议</h3>
            </div>

            <div className="space-y-3">
              {recommendations.map((rec, index) => {
                const priority = rec.includes('高优先级')
                  ? 'high'
                  : rec.includes('中优先级')
                    ? 'medium'
                    : 'low';

                const config = {
                  high: {
                    text: 'text-red-300',
                    bg: 'bg-red-500/10',
                    border: 'border-red-500/30',
                    label: '高优先级',
                  },
                  medium: {
                    text: 'text-amber-300',
                    bg: 'bg-amber-500/10',
                    border: 'border-amber-500/30',
                    label: '中优先级',
                  },
                  low: {
                    text: 'text-blue-300',
                    bg: 'bg-blue-500/10',
                    border: 'border-blue-500/30',
                    label: '体验优化',
                  },
                } as const;

                const style = config[priority];

                return (
                  <div key={index} className={`rounded-lg border p-4 ${style.bg} ${style.border}`}>
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5 rounded-full bg-slate-900/50 p-1.5 border border-slate-800">
                        <TrendingUp className={`w-4 h-4 ${style.text}`} />
                      </div>
                      <div>
                        <Badge className={`${style.bg} ${style.text} border ${style.border} mb-2`}>
                          {style.label}
                        </Badge>
                        <p className={`text-sm ${style.text}`}>
                          {rec.replace(/[高中]优先级: /, '').replace('体验优化: ', '')}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}

              {recommendations.length === 0 && (
                <div className="rounded-lg border border-dashed border-slate-700 bg-slate-900/50 p-4 text-sm text-slate-500">
                  暂无优化建议。
                </div>
              )}
            </div>
          </section>

          <div className="flex justify-center pt-2">
            <Button
              onClick={onRestart}
              variant="outline"
              className="border-slate-700 text-slate-300 hover:bg-slate-800"
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              开始新的测试
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
