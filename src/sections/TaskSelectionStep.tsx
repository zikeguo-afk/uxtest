import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { taskDetailTemplates } from '@/data/mock/taskDetailTemplates';
import { ArrowRight, ArrowLeft, Users, Target, AlertCircle, Minus, Plus, Info } from 'lucide-react';
import type { AgentCategorySelection, AgentCategoryTemplate, Task } from '@/types';

interface TaskSelectionStepProps {
  tasks: Task[];
  selectedTasks: number[];
  categoryTemplates: AgentCategoryTemplate[];
  categorySelections: AgentCategorySelection[];
  minSelectedTasks?: number;
  maxSelectedTasks?: number;
  onTaskToggle: (taskId: number) => void;
  onCategoryIncrement: (categoryId: string) => void;
  onCategoryDecrement: (categoryId: string) => void;
  onNext: () => Promise<void> | void;
  onBack: () => void;
}

function buildSelectionMap(selections: AgentCategorySelection[]): Map<string, number> {
  return new Map(selections.map((selection) => [selection.categoryId, selection.count]));
}

function resolveTaskDetail(task: Task) {
  if (task.testScenario || (task.operationSteps && task.operationSteps.length > 0) || (task.successCriteria && task.successCriteria.length > 0)) {
    return {
      taskId: task.id,
      title: task.name,
      difficulty: task.difficulty ?? '中等' as const,
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

export function TaskSelectionStep({
  tasks,
  selectedTasks,
  categoryTemplates,
  categorySelections,
  minSelectedTasks = 3,
  maxSelectedTasks = 10,
  onTaskToggle,
  onCategoryIncrement,
  onCategoryDecrement,
  onNext,
  onBack,
}: TaskSelectionStepProps) {
  const selectionMap = buildSelectionMap(categorySelections);
  const totalSelectedPeople = categorySelections.reduce((sum, item) => sum + item.count, 0);
  const [detailTaskId, setDetailTaskId] = useState<number | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const detailMap = useMemo(() => new Map(tasks.map((task) => [task.id, resolveTaskDetail(task)])), [tasks]);

  return (
    <div className="space-y-6 min-h-0">
      <div className="flex items-center gap-3 p-4 bg-amber-500/10 border border-amber-500/30 rounded-lg animate-fade-in">
        <AlertCircle className="w-5 h-5 text-amber-400 flex-shrink-0" />
        <div className="text-sm text-amber-200">
          请选择 <strong>{minSelectedTasks}-{maxSelectedTasks}个任务</strong> 进行测试，并配置 <strong>至少1名</strong> AI 被测试人员
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch min-h-0 overflow-hidden lg:min-h-[680px] lg:h-[72vh]">
        <div className="animate-slide-in-left flex h-[56vh] md:h-[62vh] lg:h-full" style={{ animationDelay: '100ms' }}>
          <Card data-testid="task-selection-left-panel" className="bg-slate-900/50 border-slate-800 h-full flex flex-col min-h-0 w-full overflow-hidden">
            <CardHeader className="shrink-0">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center">
                    <Target className="w-5 h-5 text-blue-400" />
                  </div>
                  <div>
                    <CardTitle className="text-slate-100">选择测试任务</CardTitle>
                    <CardDescription className="text-slate-400">
                      已选择 {selectedTasks.length}/{maxSelectedTasks} 个任务（至少 {minSelectedTasks} 个）
                    </CardDescription>
                  </div>
                </div>
                <Badge className="bg-blue-500/20 text-blue-400 border-0">
                  {selectedTasks.length}/{maxSelectedTasks}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="flex-1 min-h-0 overflow-hidden">
              <div className="space-y-2 h-full min-h-0 overflow-y-auto overscroll-contain pr-3">
                {tasks.map((task, index) => (
                  <div
                    key={task.id}
                    className={`
                      flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all animate-fade-in
                      ${task.selected ? 'bg-emerald-500/10 border-emerald-500/50' : 'bg-slate-950/50 border-slate-800 hover:border-slate-700'}
                      ${selectedTasks.length >= maxSelectedTasks && !task.selected ? 'opacity-50 cursor-not-allowed' : ''}
                    `}
                    style={{ animationDelay: `${100 + index * 20}ms` }}
                    onClick={() => {
                      if (selectedTasks.length < maxSelectedTasks || task.selected) {
                        onTaskToggle(task.id);
                      }
                    }}
                  >
                    <Checkbox
                      checked={task.selected}
                      className="mt-0.5 data-[state=checked]:bg-emerald-500 data-[state=checked]:border-emerald-500"
                    />
                    <div className="flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-xs font-mono text-slate-500">
                            #{String(task.id).padStart(2, '0')}
                          </span>
                          <span className={`text-sm font-medium truncate ${task.selected ? 'text-emerald-200' : 'text-slate-300'}`}>
                            {task.name}
                          </span>
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-7 px-2 border-slate-700 text-slate-400 hover:bg-slate-800"
                          onClick={(event) => {
                            event.stopPropagation();
                            setDetailTaskId((prev) => (prev === task.id ? null : task.id));
                          }}
                        >
                          <Info className="w-3 h-3 mr-1" />
                          详情
                        </Button>
                      </div>
                      <p className="text-xs text-slate-500 mt-1">{task.description}</p>

                      {detailTaskId === task.id && (
                        <div
                          data-testid="task-selection-task-detail"
                          className="mt-2 rounded-lg border border-slate-800 bg-slate-900/40 p-3 space-y-3 max-h-56 overflow-y-auto overscroll-contain"
                          onClick={(event) => event.stopPropagation()}
                        >
                          <div>
                            <div className="text-xs text-blue-300 mb-1">测试场景</div>
                            <p className="text-xs text-slate-300">{detailMap.get(task.id)?.testScenario}</p>
                          </div>
                          <div>
                            <div className="text-xs text-slate-400 mb-1">操作步骤</div>
                            <ol className="space-y-1 break-words">
                              {(detailMap.get(task.id)?.operationSteps ?? []).map((step, stepIndex) => (
                                <li key={`${task.id}-op-${stepIndex}`} className="text-xs text-slate-300">
                                  {stepIndex + 1}. {step}
                                </li>
                              ))}
                            </ol>
                          </div>
                          <div>
                            <div className="text-xs text-slate-400 mb-1">成功标准</div>
                            <ul className="space-y-1 break-words">
                              {(detailMap.get(task.id)?.successCriteria ?? []).map((criterion) => (
                                <li key={`${task.id}-criterion-${criterion}`} className="text-xs text-emerald-300">
                                  ✓ {criterion}
                                </li>
                              ))}
                            </ul>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="animate-slide-in-right flex h-[56vh] md:h-[62vh] lg:h-full" style={{ animationDelay: '200ms' }}>
          <Card data-testid="task-selection-right-panel" className="bg-slate-900/50 border-slate-800 h-full flex flex-col min-h-0 w-full overflow-hidden">
            <CardHeader className="shrink-0">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-purple-500/20 flex items-center justify-center">
                    <Users className="w-5 h-5 text-purple-400" />
                  </div>
                  <div>
                    <CardTitle className="text-slate-100">配置测试人群类别</CardTitle>
                    <CardDescription className="text-slate-400">
                      已配置 {totalSelectedPeople} 名被测个体
                    </CardDescription>
                  </div>
                </div>
                <Badge className="bg-purple-500/20 text-purple-400 border-0">{totalSelectedPeople}</Badge>
              </div>
            </CardHeader>
            <CardContent className="flex-1 min-h-0 overflow-hidden">
              <div className="space-y-3 h-full min-h-0 overflow-y-auto overscroll-contain pr-3">
                {categoryTemplates.map((category, index) => {
                  const count = selectionMap.get(category.id) ?? 0;
                  return (
                    <div
                      key={category.id}
                      className={`
                        p-4 rounded-lg border transition-all animate-fade-in
                        ${count > 0 ? 'bg-purple-500/10 border-purple-500/50' : 'bg-slate-950/50 border-slate-800 hover:border-slate-700'}
                      `}
                      style={{ animationDelay: `${200 + index * 50}ms` }}
                    >
                      <div className="flex items-start gap-4">
                        <div className={`w-12 h-12 rounded-full flex items-center justify-center text-2xl ${count > 0 ? 'bg-purple-500/20' : 'bg-slate-800'}`}>
                          {category.avatar}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-3 mb-1">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className={`font-medium truncate ${count > 0 ? 'text-purple-200' : 'text-slate-200'}`}>
                                {category.name}
                              </span>
                              <Badge variant="outline" className="text-xs border-slate-700 text-slate-500">
                                {category.goal}
                              </Badge>
                            </div>
                            <Badge className="text-xs bg-slate-800 text-slate-300 border-0">{count} 人</Badge>
                          </div>
                          <p className="text-xs text-slate-400 mb-2">{category.persona}</p>
                          <div className="text-xs text-slate-500 space-y-0.5">
                            {category.emotionalBase.map((line) => (
                              <p key={line}>{line}</p>
                            ))}
                          </div>

                          <div className="flex gap-3 mt-3">
                            {[
                              { label: '耐心', value: category.baseTraits.patience },
                              { label: '技术', value: category.baseTraits.techSavvy },
                              { label: '专注', value: category.baseTraits.attention },
                            ].map((trait) => (
                              <div key={trait.label} className="flex-1">
                                <div className="flex justify-between text-xs text-slate-600 mb-1">
                                  <span>{trait.label}</span>
                                  <span>{trait.value}%</span>
                                </div>
                                <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                                  <div
                                    className={`h-full rounded-full transition-all duration-500 ${
                                      trait.value > 70 ? 'bg-emerald-500' : trait.value > 40 ? 'bg-amber-500' : 'bg-red-500'
                                    }`}
                                    style={{ width: `${trait.value}%` }}
                                  />
                                </div>
                              </div>
                            ))}
                          </div>

                          <div className="mt-4 flex items-center justify-end gap-2">
                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              aria-label={`减少${category.name}人数`}
                              className="h-8 w-8 border-slate-700 text-slate-300 hover:bg-slate-800 disabled:opacity-40"
                              disabled={count <= 0}
                              onClick={() => onCategoryDecrement(category.id)}
                            >
                              <Minus className="w-4 h-4" />
                            </Button>
                            <div className="w-10 text-center text-sm text-slate-200 font-medium">{count}</div>
                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              aria-label={`增加${category.name}人数`}
                              className="h-8 w-8 border-slate-700 text-slate-300 hover:bg-slate-800"
                              onClick={() => onCategoryIncrement(category.id)}
                            >
                              <Plus className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

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
          onClick={async () => {
            if (isSubmitting) {
              return;
            }
            setIsSubmitting(true);
            try {
              await onNext();
            } finally {
              setIsSubmitting(false);
            }
          }}
          disabled={
            isSubmitting ||
            selectedTasks.length < minSelectedTasks ||
            selectedTasks.length > maxSelectedTasks ||
            totalSelectedPeople === 0
          }
          className="bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-50"
        >
          {isSubmitting ? '生成测试样本中...' : '开始测试执行'}
          <ArrowRight className="w-4 h-4 ml-2" />
        </Button>
      </div>
    </div>
  );
}
