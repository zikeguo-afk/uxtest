import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  Play, Eye, Brain, Hand, Activity, 
  CheckCircle, XCircle, Clock,
  Terminal, ArrowRight
} from 'lucide-react';
import type { TaskExecution, AgentPersona } from '@/types';

interface ExecutionStepProps {
  executions: TaskExecution[];
  agents: AgentPersona[];
  onComplete: () => void;
}

const roleConfig = {
  observer: { icon: Eye, color: 'text-blue-400', bg: 'bg-blue-500/10', label: '观察者' },
  decider: { icon: Brain, color: 'text-purple-400', bg: 'bg-purple-500/10', label: '决策者' },
  executor: { icon: Hand, color: 'text-emerald-400', bg: 'bg-emerald-500/10', label: '执行者' },
  feedback: { icon: Activity, color: 'text-amber-400', bg: 'bg-amber-500/10', label: '反馈循环' },
};

const emotionConfig = {
  neutral: { color: 'text-slate-400', bg: 'bg-slate-800' },
  frustrated: { color: 'text-amber-400', bg: 'bg-amber-500/20' },
  angry: { color: 'text-red-400', bg: 'bg-red-500/20' },
  anxious: { color: 'text-orange-400', bg: 'bg-orange-500/20' },
  satisfied: { color: 'text-emerald-400', bg: 'bg-emerald-500/20' },
};

export function ExecutionStep({ executions, agents, onComplete }: ExecutionStepProps) {
  const [currentExecutionIndex, setCurrentExecutionIndex] = useState(0);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [isRunning, setIsRunning] = useState(true);
  const [completedExecutions, setCompletedExecutions] = useState<number[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  const currentExecution = executions[currentExecutionIndex];
  const currentAgent = agents.find(a => a.id === currentExecution?.agentId);

  useEffect(() => {
    if (!isRunning || !currentExecution) return;

    const timer = setTimeout(() => {
      if (currentStepIndex < currentExecution.steps.length - 1) {
        setCurrentStepIndex(prev => prev + 1);
      } else {
        // 当前任务完成
        setCompletedExecutions(prev => [...prev, currentExecutionIndex]);
        
        if (currentExecutionIndex < executions.length - 1) {
          // 执行下一个任务
          setTimeout(() => {
            setCurrentExecutionIndex(prev => prev + 1);
            setCurrentStepIndex(0);
          }, 1000);
        } else {
          // 所有任务完成
          setIsRunning(false);
        }
      }
    }, 1500);

    return () => clearTimeout(timer);
  }, [currentStepIndex, currentExecution, isRunning, currentExecutionIndex, executions.length]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [currentStepIndex]);

  return (
    <div className="space-y-6">
      {/* 执行状态栏 */}
      <div className="flex items-center justify-between p-4 bg-slate-900/50 border border-slate-800 rounded-lg animate-fade-in">
        <div className="flex items-center gap-4">
          <div className={`w-10 h-10 rounded-full bg-emerald-500/20 flex items-center justify-center ${isRunning ? 'animate-spin' : ''}`}>
            <Terminal className="w-5 h-5 text-emerald-400" />
          </div>
          <div>
            <div className="text-slate-100 font-medium">
              {isRunning ? '多智能体协作执行中...' : '所有测试任务已完成'}
            </div>
            <div className="text-sm text-slate-500">
              任务 {completedExecutions.length + (isRunning ? 1 : 0)} / {executions.length}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {executions.map((_, index) => (
            <div
              key={index}
              className={`w-2 h-2 rounded-full transition-colors ${
                completedExecutions.includes(index) ? 'bg-emerald-500' :
                index === currentExecutionIndex ? 'bg-emerald-400 animate-pulse' :
                'bg-slate-700'
              }`}
            />
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 左侧：当前执行信息 */}
        <div className="space-y-4">
          {/* 当前任务卡片 */}
          <div className="animate-slide-in-left" style={{ animationDelay: '100ms' }}>
            <Card className="bg-slate-900/50 border-slate-800">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm text-slate-400">当前执行任务</CardTitle>
              </CardHeader>
              <CardContent>
                {currentExecution ? (
                  <div className="space-y-3">
                    <div>
                      <div className="text-lg font-medium text-slate-100">
                        {currentExecution.taskName}
                      </div>
                      <div className="text-xs text-slate-500">
                        任务 #{String(currentExecution.taskId).padStart(2, '0')}
                      </div>
                    </div>
                    <Badge 
                      className={`
                        ${currentExecution.status === 'success' ? 'bg-emerald-500/20 text-emerald-400' : ''}
                        ${currentExecution.status === 'failed' ? 'bg-red-500/20 text-red-400' : ''}
                        ${currentExecution.status === 'running' ? 'bg-blue-500/20 text-blue-400' : ''}
                      `}
                    >
                      {currentExecution.status === 'success' && <CheckCircle className="w-3 h-3 mr-1" />}
                      {currentExecution.status === 'failed' && <XCircle className="w-3 h-3 mr-1" />}
                      {currentExecution.status === 'running' && <Play className="w-3 h-3 mr-1" />}
                      {currentExecution.status === 'success' ? '成功' : 
                       currentExecution.status === 'failed' ? '失败' : '执行中'}
                    </Badge>
                  </div>
                ) : (
                  <div className="text-slate-500 text-sm">等待执行...</div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* 当前Agent卡片 */}
          <div className="animate-slide-in-left" style={{ animationDelay: '200ms' }}>
            <Card className="bg-slate-900/50 border-slate-800">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm text-slate-400">执行智能体</CardTitle>
              </CardHeader>
              <CardContent>
                {currentAgent ? (
                  <div className="flex items-start gap-3">
                    <div className="w-12 h-12 rounded-full bg-purple-500/20 flex items-center justify-center text-2xl">
                      {currentAgent.avatar}
                    </div>
                    <div>
                      <div className="font-medium text-slate-200">{currentAgent.name}</div>
                      <div className="text-xs text-slate-500">{currentAgent.id}</div>
                      <Badge variant="outline" className="mt-2 text-xs border-slate-700 text-slate-400">
                        {currentAgent.goal}
                      </Badge>
                    </div>
                  </div>
                ) : (
                  <div className="text-slate-500 text-sm">等待分配...</div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* 情感状态 */}
          {currentExecution && currentExecution.steps[currentStepIndex]?.emotion && (
            <div className="animate-scale-in">
              <Card className="bg-slate-900/50 border-slate-800">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm text-slate-400">情感状态</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-slate-400">当前情绪</span>
                      <Badge 
                        className={`
                          ${emotionConfig[currentExecution.steps[currentStepIndex].emotion!].bg}
                          ${emotionConfig[currentExecution.steps[currentStepIndex].emotion!].color}
                          border-0
                        `}
                      >
                        {currentExecution.steps[currentStepIndex].emotion === 'neutral' && '平静'}
                        {currentExecution.steps[currentStepIndex].emotion === 'frustrated' && '沮丧'}
                        {currentExecution.steps[currentStepIndex].emotion === 'angry' && '愤怒'}
                        {currentExecution.steps[currentStepIndex].emotion === 'anxious' && '焦虑'}
                        {currentExecution.steps[currentStepIndex].emotion === 'satisfied' && '满意'}
                      </Badge>
                    </div>
                    {currentExecution.steps[currentStepIndex].emotionValue && (
                      <div>
                        <div className="flex justify-between text-xs text-slate-500 mb-1">
                          <span>情感强度</span>
                          <span>{currentExecution.steps[currentStepIndex].emotionValue}%</span>
                        </div>
                        <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-500 ${
                              (currentExecution.steps[currentStepIndex].emotionValue || 0) > 70 ? 'bg-red-500' :
                              (currentExecution.steps[currentStepIndex].emotionValue || 0) > 40 ? 'bg-amber-500' :
                              'bg-emerald-500'
                            }`}
                            style={{ width: `${currentExecution.steps[currentStepIndex].emotionValue}%` }}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </div>

        {/* 右侧：执行日志 */}
        <div className="lg:col-span-2 animate-slide-in-right" style={{ animationDelay: '300ms' }}>
          <Card className="bg-slate-900/50 border-slate-800 h-full">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-slate-100">执行日志</CardTitle>
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-slate-500" />
                  <span className="text-sm text-slate-500">
                    Step {currentStepIndex + 1} / {currentExecution?.steps.length || 0}
                  </span>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[500px] pr-4" ref={scrollRef}>
                <div className="space-y-3">
                  {currentExecution?.steps.slice(0, currentStepIndex + 1).map((step, index) => {
                    const config = roleConfig[step.role];
                    const Icon = config.icon;
                    
                    return (
                      <div
                        key={index}
                        className={`
                          flex items-start gap-3 p-3 rounded-lg border animate-fade-in
                          ${config.bg} ${config.color.replace('text-', 'border-').replace('400', '500/30')}
                          ${index === currentStepIndex ? 'ring-2 ring-emerald-500/30' : ''}
                        `}
                      >
                        <div className="w-8 h-8 rounded-full bg-slate-950/50 flex items-center justify-center flex-shrink-0">
                          <Icon className={`w-4 h-4 ${config.color}`} />
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className={`text-xs font-medium ${config.color}`}>
                              {config.label}
                            </span>
                            <span className="text-xs text-slate-600">
                              Step {step.step}
                            </span>
                            {step.emotion && (
                              <Badge 
                                className={`text-xs ${emotionConfig[step.emotion].bg} ${emotionConfig[step.emotion].color} border-0`}
                              >
                                {step.emotion === 'neutral' && '😊'}
                                {step.emotion === 'frustrated' && '😤'}
                                {step.emotion === 'angry' && '😡'}
                                {step.emotion === 'anxious' && '😰'}
                                {step.emotion === 'satisfied' && '😄'}
                              </Badge>
                            )}
                          </div>
                          <p className="text-sm text-slate-300">{step.content}</p>
                        </div>
                      </div>
                    );
                  })}
                  
                  {isRunning && (
                    <div className="flex items-center gap-2 p-3 animate-pulse">
                      <div className="w-2 h-2 rounded-full bg-emerald-500" />
                      <span className="text-sm text-slate-500">执行中...</span>
                    </div>
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* 完成按钮 */}
      {!isRunning && (
        <div className="flex justify-end animate-fade-in">
          <Button
            onClick={onComplete}
            className="bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            查看完整报告
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        </div>
      )}
    </div>
  );
}
