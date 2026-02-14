import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  BarChart3, MessageSquare, Lightbulb, 
  CheckCircle, TrendingUp,
  Clock, MousePointer, Zap, RefreshCw
} from 'lucide-react';
import type { QuantitativeMetric, QualitativeInsight } from '@/types';

interface ReportStepProps {
  targetUrl: string;
  quantitativeMetrics: QuantitativeMetric[];
  qualitativeInsights: QualitativeInsight[];
  recommendations: string[];
  onRestart: () => void;
}

export function ReportStep({ 
  targetUrl, 
  quantitativeMetrics, 
  qualitativeInsights, 
  recommendations,
  onRestart 
}: ReportStepProps) {
  // 计算总体指标
  const overallSuccessRate = Math.round(
    quantitativeMetrics.reduce((acc, m) => acc + m.successRate, 0) / quantitativeMetrics.length
  );
  const avgDuration = '1分45秒';
  const rageClickRate = '15%';

  return (
    <div className="space-y-6">
      {/* 报告头部 */}
      <div className="flex items-center justify-between p-6 bg-gradient-to-r from-emerald-500/10 to-teal-500/10 border border-emerald-500/30 rounded-lg animate-fade-in">
        <div>
          <h2 className="text-2xl font-bold text-slate-100">可用性测试报告</h2>
          <div className="flex items-center gap-4 mt-2">
            <Badge variant="outline" className="border-slate-700 text-slate-400">
              {targetUrl}
            </Badge>
            <span className="text-sm text-slate-500">
              生成时间: {new Date().toLocaleString('zh-CN')}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <div className="text-sm text-slate-400">总体成功率</div>
            <div className={`text-3xl font-bold ${overallSuccessRate >= 80 ? 'text-emerald-400' : overallSuccessRate >= 60 ? 'text-amber-400' : 'text-red-400'}`}>
              {overallSuccessRate}%
            </div>
          </div>
        </div>
      </div>

      {/* 量化指标面板 */}
      <div className="animate-slide-up" style={{ animationDelay: '100ms' }}>
        <Card className="bg-slate-900/50 border-slate-800">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center">
                <BarChart3 className="w-5 h-5 text-blue-400" />
              </div>
              <div>
                <CardTitle className="text-slate-100">量化指标面板</CardTitle>
                <CardDescription className="text-slate-400">
                  Quantitative Metrics Dashboard
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {/* 关键指标卡片 */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
              {[
                { 
                  label: '总体任务成功率', 
                  value: `${overallSuccessRate}%`, 
                  icon: CheckCircle,
                  color: overallSuccessRate >= 80 ? 'text-emerald-400' : overallSuccessRate >= 60 ? 'text-amber-400' : 'text-red-400',
                  bg: overallSuccessRate >= 80 ? 'bg-emerald-500/10' : overallSuccessRate >= 60 ? 'bg-amber-500/10' : 'bg-red-500/10'
                },
                { 
                  label: '平均任务耗时', 
                  value: avgDuration, 
                  icon: Clock,
                  color: 'text-blue-400',
                  bg: 'bg-blue-500/10'
                },
                { 
                  label: '平均点击深度', 
                  value: '5.2 次', 
                  icon: MousePointer,
                  color: 'text-purple-400',
                  bg: 'bg-purple-500/10'
                },
                { 
                  label: '愤怒点击率', 
                  value: rageClickRate, 
                  icon: Zap,
                  color: 'text-red-400',
                  bg: 'bg-red-500/10'
                },
              ].map((metric, index) => (
                <div
                  key={index}
                  className={`p-4 rounded-lg ${metric.bg} border border-slate-800 animate-fade-in`}
                  style={{ animationDelay: `${200 + index * 50}ms` }}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <metric.icon className={`w-4 h-4 ${metric.color}`} />
                    <span className="text-xs text-slate-500">{metric.label}</span>
                  </div>
                  <div className={`text-2xl font-bold ${metric.color}`}>{metric.value}</div>
                </div>
              ))}
            </div>

            {/* 任务详细指标 */}
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-800">
                    <th className="text-left py-3 px-4 text-sm font-medium text-slate-400">任务ID</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-slate-400">任务名称</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-slate-400">成功率</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-slate-400">主要瓶颈</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-slate-400">情感负面峰值</th>
                  </tr>
                </thead>
                <tbody>
                  {quantitativeMetrics.map((metric, index) => (
                    <tr
                      key={metric.taskId}
                      className="border-b border-slate-800/50 hover:bg-slate-800/30 animate-fade-in"
                      style={{ animationDelay: `${300 + index * 50}ms` }}
                    >
                      <td className="py-3 px-4 text-sm text-slate-500">
                        #{String(metric.taskId).padStart(2, '0')}
                      </td>
                      <td className="py-3 px-4 text-sm text-slate-300">{metric.taskName}</td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <div className="w-16 h-2 bg-slate-800 rounded-full overflow-hidden">
                            <div 
                              className={`h-full rounded-full ${
                                metric.successRate >= 80 ? 'bg-emerald-500' :
                                metric.successRate >= 50 ? 'bg-amber-500' :
                                'bg-red-500'
                              }`}
                              style={{ width: `${metric.successRate}%` }}
                            />
                          </div>
                          <span className={`text-sm font-medium ${
                            metric.successRate >= 80 ? 'text-emerald-400' :
                            metric.successRate >= 50 ? 'text-amber-400' :
                            'text-red-400'
                          }`}>
                            {metric.successRate}%
                          </span>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-sm text-slate-400">{metric.bottleneck}</td>
                      <td className="py-3 px-4">
                        <Badge 
                          className={`
                            ${metric.emotionPeak.includes('极高') ? 'bg-red-500/20 text-red-400' : ''}
                            ${metric.emotionPeak.includes('高') && !metric.emotionPeak.includes('极高') ? 'bg-orange-500/20 text-orange-400' : ''}
                            ${metric.emotionPeak.includes('中') ? 'bg-amber-500/20 text-amber-400' : ''}
                            ${metric.emotionPeak.includes('低') ? 'bg-emerald-500/20 text-emerald-400' : ''}
                            border-0
                          `}
                        >
                          {metric.emotionPeak}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 定性洞察 */}
      <div className="animate-slide-up" style={{ animationDelay: '300ms' }}>
        <Card className="bg-slate-900/50 border-slate-800">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-purple-500/20 flex items-center justify-center">
                <MessageSquare className="w-5 h-5 text-purple-400" />
              </div>
              <div>
                <CardTitle className="text-slate-100">定性洞察：Gioia 方法自动编码</CardTitle>
                <CardDescription className="text-slate-400">
                  Qualitative Insights - Auto-Coding & Gioia Analysis
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {qualitativeInsights.map((insight, index) => (
                <div
                  key={index}
                  className="relative animate-slide-in-left"
                  style={{ animationDelay: `${400 + index * 100}ms` }}
                >
                  <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-emerald-500 via-amber-500 to-red-500 rounded-full" />
                  <div className="ml-6 space-y-3">
                    {/* 一阶概念 */}
                    <div className="p-3 bg-slate-950/50 border border-slate-800 rounded-lg">
                      <div className="flex items-center gap-2 mb-2">
                        <Badge className="bg-blue-500/20 text-blue-400 border-0 text-xs">一阶概念</Badge>
                        <span className="text-xs text-slate-500">原始反馈</span>
                      </div>
                      <p className="text-sm text-slate-300 italic">&quot;{insight.firstOrder}&quot;</p>
                    </div>
                    
                    {/* 二阶主题 */}
                    <div className="p-3 bg-amber-500/5 border border-amber-500/20 rounded-lg">
                      <div className="flex items-center gap-2 mb-2">
                        <Badge className="bg-amber-500/20 text-amber-400 border-0 text-xs">二阶主题</Badge>
                        <span className="text-xs text-slate-500">归纳</span>
                      </div>
                      <p className="text-sm text-amber-200">{insight.secondOrder}</p>
                    </div>
                    
                    {/* 聚合维度 */}
                    <div className="p-3 bg-emerald-500/5 border border-emerald-500/20 rounded-lg">
                      <div className="flex items-center gap-2 mb-2">
                        <Badge className="bg-emerald-500/20 text-emerald-400 border-0 text-xs">聚合维度</Badge>
                        <span className="text-xs text-slate-500">最终结论</span>
                      </div>
                      <p className="text-sm text-emerald-200">{insight.aggregate}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 改进建议 */}
      <div className="animate-slide-up" style={{ animationDelay: '500ms' }}>
        <Card className="bg-slate-900/50 border-slate-800">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-emerald-500/20 flex items-center justify-center">
                <Lightbulb className="w-5 h-5 text-emerald-400" />
              </div>
              <div>
                <CardTitle className="text-slate-100">改进建议 (Actionable Insights)</CardTitle>
                <CardDescription className="text-slate-400">
                  基于测试结果的可执行优化方案
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {recommendations.map((rec, index) => {
                const priority = rec.includes('高优先级') ? 'high' : rec.includes('中优先级') ? 'medium' : 'low';
                const priorityConfig = {
                  high: { color: 'text-red-400', bg: 'bg-red-500/10', border: 'border-red-500/30', label: '高优先级' },
                  medium: { color: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/30', label: '中优先级' },
                  low: { color: 'text-blue-400', bg: 'bg-blue-500/10', border: 'border-blue-500/30', label: '体验优化' },
                };
                const config = priorityConfig[priority];
                
                return (
                  <div
                    key={index}
                    className={`flex items-start gap-4 p-4 rounded-lg border ${config.bg} ${config.border} animate-slide-in-left`}
                    style={{ animationDelay: `${600 + index * 50}ms` }}
                  >
                    <div className={`w-8 h-8 rounded-full bg-slate-950/50 flex items-center justify-center flex-shrink-0`}>
                      <TrendingUp className={`w-4 h-4 ${config.color}`} />
                    </div>
                    <div className="flex-1">
                      <Badge className={`${config.bg} ${config.color} border-0 text-xs mb-2`}>
                        {config.label}
                      </Badge>
                      <p className={`text-sm ${config.color}`}>
                        {rec.replace(/[高中]优先级: /, '').replace('体验优化: ', '')}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 重新开始按钮 */}
      <div className="flex justify-center animate-fade-in" style={{ animationDelay: '700ms' }}>
        <Button
          onClick={onRestart}
          variant="outline"
          className="border-slate-700 text-slate-400 hover:text-slate-200 hover:bg-slate-800"
        >
          <RefreshCw className="w-4 h-4 mr-2" />
          开始新的测试
        </Button>
      </div>
    </div>
  );
}
