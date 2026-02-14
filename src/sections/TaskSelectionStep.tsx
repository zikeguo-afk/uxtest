import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { ArrowRight, ArrowLeft, Users, Target, AlertCircle } from 'lucide-react';
import type { Task, AgentPersona } from '@/types';

interface TaskSelectionStepProps {
  tasks: Task[];
  selectedTasks: number[];
  agents: AgentPersona[];
  selectedAgents: string[];
  onTaskToggle: (taskId: number) => void;
  onAgentToggle: (agentId: string) => void;
  onNext: () => void;
  onBack: () => void;
}

export function TaskSelectionStep({
  tasks,
  selectedTasks,
  agents,
  selectedAgents,
  onTaskToggle,
  onAgentToggle,
  onNext,
  onBack,
}: TaskSelectionStepProps) {
  return (
    <div className="space-y-6">
      {/* 提示信息 */}
      <div className="flex items-center gap-3 p-4 bg-amber-500/10 border border-amber-500/30 rounded-lg animate-fade-in">
        <AlertCircle className="w-5 h-5 text-amber-400 flex-shrink-0" />
        <div className="text-sm text-amber-200">
          请选择 <strong>10个任务</strong> 进行测试，并配置 <strong>3-5名</strong> AI被测试人员
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 任务选择 */}
        <div className="animate-slide-in-left" style={{ animationDelay: '100ms' }}>
          <Card className="bg-slate-900/50 border-slate-800 h-full">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center">
                    <Target className="w-5 h-5 text-blue-400" />
                  </div>
                  <div>
                    <CardTitle className="text-slate-100">选择测试任务</CardTitle>
                    <CardDescription className="text-slate-400">
                      已选择 {selectedTasks.length}/10 个任务
                    </CardDescription>
                  </div>
                </div>
                <Badge className="bg-blue-500/20 text-blue-400 border-0">
                  {selectedTasks.length}/10
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 max-h-[500px] overflow-y-auto pr-2">
                {tasks.map((task, index) => (
                  <div
                    key={task.id}
                    className={`
                      flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all animate-fade-in
                      ${task.selected 
                        ? 'bg-emerald-500/10 border-emerald-500/50' 
                        : 'bg-slate-950/50 border-slate-800 hover:border-slate-700'
                      }
                      ${selectedTasks.length >= 10 && !task.selected ? 'opacity-50 cursor-not-allowed' : ''}
                    `}
                    style={{ animationDelay: `${100 + index * 20}ms` }}
                    onClick={() => {
                      if (selectedTasks.length < 10 || task.selected) {
                        onTaskToggle(task.id);
                      }
                    }}
                  >
                    <Checkbox
                      checked={task.selected}
                      className="mt-0.5 data-[state=checked]:bg-emerald-500 data-[state=checked]:border-emerald-500"
                    />
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono text-slate-500">
                          #{String(task.id).padStart(2, '0')}
                        </span>
                        <span className={`text-sm font-medium ${task.selected ? 'text-emerald-200' : 'text-slate-300'}`}>
                          {task.name}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 mt-1">{task.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* AI被测试人员选择 */}
        <div className="animate-slide-in-right" style={{ animationDelay: '200ms' }}>
          <Card className="bg-slate-900/50 border-slate-800 h-full">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-purple-500/20 flex items-center justify-center">
                    <Users className="w-5 h-5 text-purple-400" />
                  </div>
                  <div>
                    <CardTitle className="text-slate-100">配置 AI 被测试人员</CardTitle>
                    <CardDescription className="text-slate-400">
                      选择 {selectedAgents.length} 名测试人员
                    </CardDescription>
                  </div>
                </div>
                <Badge className="bg-purple-500/20 text-purple-400 border-0">
                  {selectedAgents.length}
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {agents.map((agent, index) => (
                  <div
                    key={agent.id}
                    className={`
                      p-4 rounded-lg border cursor-pointer transition-all animate-fade-in
                      ${selectedAgents.includes(agent.id)
                        ? 'bg-purple-500/10 border-purple-500/50'
                        : 'bg-slate-950/50 border-slate-800 hover:border-slate-700'
                      }
                    `}
                    style={{ animationDelay: `${200 + index * 50}ms` }}
                    onClick={() => onAgentToggle(agent.id)}
                  >
                    <div className="flex items-start gap-4">
                      <div className={`
                        w-12 h-12 rounded-full flex items-center justify-center text-2xl
                        ${selectedAgents.includes(agent.id) ? 'bg-purple-500/20' : 'bg-slate-800'}
                      `}>
                        {agent.avatar}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`font-medium ${selectedAgents.includes(agent.id) ? 'text-purple-200' : 'text-slate-200'}`}>
                            {agent.name}
                          </span>
                          <Badge variant="outline" className="text-xs border-slate-700 text-slate-500">
                            {agent.goal}
                          </Badge>
                          {selectedAgents.includes(agent.id) && (
                            <Badge className="text-xs bg-purple-500 text-white border-0">
                              已选择
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-slate-400 mb-2">{agent.persona}</p>
                        <div 
                          className="text-xs text-slate-500"
                          dangerouslySetInnerHTML={{ __html: agent.emotionalBase }}
                        />
                        {/* 特质条 */}
                        <div className="flex gap-3 mt-3">
                          {[
                            { label: '耐心', value: agent.traits.patience },
                            { label: '技术', value: agent.traits.techSavvy },
                            { label: '专注', value: agent.traits.attention },
                          ].map((trait) => (
                            <div key={trait.label} className="flex-1">
                              <div className="flex justify-between text-xs text-slate-600 mb-1">
                                <span>{trait.label}</span>
                                <span>{trait.value}%</span>
                              </div>
                              <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                                <div
                                  className={`h-full rounded-full transition-all duration-500 ${
                                    trait.value > 70 ? 'bg-emerald-500' :
                                    trait.value > 40 ? 'bg-amber-500' : 'bg-red-500'
                                  }`}
                                  style={{ width: `${trait.value}%` }}
                                />
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* 按钮组 */}
      <div className="flex justify-between animate-fade-in" style={{ animationDelay: '500ms' }}>
        <Button
          variant="outline"
          onClick={onBack}
          className="border-slate-700 text-slate-400 hover:text-slate-200 hover:bg-slate-800"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          返回
        </Button>
        <Button
          onClick={onNext}
          disabled={selectedTasks.length !== 10 || selectedAgents.length === 0}
          className="bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-50"
        >
          开始测试执行
          <ArrowRight className="w-4 h-4 ml-2" />
        </Button>
      </div>
    </div>
  );
}
