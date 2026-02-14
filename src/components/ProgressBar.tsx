import type { Step } from '@/types';
import { Check, Globe, Search, Users, Play, FileText } from 'lucide-react';

interface ProgressBarProps {
  currentStep: Step;
}

const steps = [
  { id: 'init', label: '系统初始化', icon: Globe },
  { id: 'analysis', label: '代码分析', icon: Search },
  { id: 'task-selection', label: '任务配置', icon: Users },
  { id: 'execution', label: '执行测试', icon: Play },
  { id: 'report', label: '生成报告', icon: FileText },
] as const;

export function ProgressBar({ currentStep }: ProgressBarProps) {
  const currentIndex = steps.findIndex(s => s.id === currentStep);

  return (
    <div className="border-b border-slate-800/50 bg-slate-900/30">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
        <div className="flex items-center justify-between">
          {steps.map((step, index) => {
            const Icon = step.icon;
            const isCompleted = index < currentIndex;
            const isCurrent = index === currentIndex;
            const isPending = index > currentIndex;

            return (
              <div key={step.id} className="flex items-center">
                <div className="flex flex-col items-center gap-2">
                  <div
                    className={`
                      w-10 h-10 rounded-full flex items-center justify-center transition-all duration-300
                      ${isCompleted ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/50' : ''}
                      ${isCurrent ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/25' : ''}
                      ${isPending ? 'bg-slate-800 text-slate-500 border border-slate-700' : ''}
                    `}
                  >
                    {isCompleted ? (
                      <Check className="w-5 h-5" />
                    ) : (
                      <Icon className="w-5 h-5" />
                    )}
                  </div>
                  <span
                    className={`
                      text-xs font-medium transition-colors duration-300 hidden sm:block
                      ${isCompleted ? 'text-emerald-400' : ''}
                      ${isCurrent ? 'text-emerald-400' : ''}
                      ${isPending ? 'text-slate-500' : ''}
                    `}
                  >
                    {step.label}
                  </span>
                </div>
                {index < steps.length - 1 && (
                  <div
                    className={`
                      w-12 sm:w-24 h-0.5 mx-2 sm:mx-4 transition-colors duration-300
                      ${index < currentIndex ? 'bg-emerald-500/50' : 'bg-slate-800'}
                    `}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
