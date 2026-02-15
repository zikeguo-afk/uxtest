import { useUXAgent } from '@/hooks/useUXAgent';
import { InitStep } from '@/sections/InitStep';
import { AnalysisStep } from '@/sections/AnalysisStep';
import { TaskSelectionStep } from '@/sections/TaskSelectionStep';
import { ExecutionStep } from '@/sections/ExecutionStep';
import { ReportStep } from '@/sections/ReportStep';
import { ProgressBar } from '@/components/ProgressBar';
import { Toaster } from '@/components/ui/sonner';

function App() {
  const {
    currentStep,
    targetUrl,
    diagnosis,
    tasks,
    selectedTasks,
    categoryTemplates,
    categorySelections,
    executions,
    currentRunSnapshot,
    selectedCaseId,
    qaHistory,
    quantitativeMetrics,
    qualitativeInsights,
    categorySummary,
    representativeSamples,
    recommendations,
    finalReportBundle,
    minSelectedTasks,
    maxSelectedTasks,
    goToStep,
    updateUrl,
    generateDiagnosis,
    toggleTask,
    incrementCategoryCount,
    decrementCategoryCount,
    generateExecutions,
    generateReport,
    selectCase,
    askCaseQuestion,
    askGlobalQuestion,
    reset,
  } = useUXAgent();

  const renderStep = () => {
    switch (currentStep) {
      case 'init':
        return (
          <InitStep
            targetUrl={targetUrl}
            onUrlChange={updateUrl}
            onNext={async () => {
              await generateDiagnosis();
              goToStep('analysis');
            }}
          />
        );
      case 'analysis':
        return (
          <AnalysisStep
            targetUrl={targetUrl}
            diagnosis={diagnosis}
            tasks={tasks}
            onNext={() => goToStep('task-selection')}
          />
        );
      case 'task-selection':
        return (
          <TaskSelectionStep
            tasks={tasks}
            selectedTasks={selectedTasks}
            categoryTemplates={categoryTemplates}
            categorySelections={categorySelections}
            minSelectedTasks={minSelectedTasks}
            maxSelectedTasks={maxSelectedTasks}
            onTaskToggle={toggleTask}
            onCategoryIncrement={incrementCategoryCount}
            onCategoryDecrement={decrementCategoryCount}
            onNext={async () => {
              await generateExecutions();
              goToStep('execution');
            }}
            onBack={() => goToStep('analysis')}
          />
        );
      case 'execution':
        return (
          <ExecutionStep
            executions={executions}
            selectedCaseId={selectedCaseId}
            qaHistory={qaHistory}
            onSelectCase={selectCase}
            onAskCaseQuestion={askCaseQuestion}
            onComplete={async () => {
              await generateReport();
              goToStep('report');
            }}
          />
        );
      case 'report':
        return (
          <ReportStep
            targetUrl={targetUrl}
            quantitativeMetrics={quantitativeMetrics}
            qualitativeInsights={qualitativeInsights}
            categorySummary={categorySummary}
            representativeSamples={representativeSamples}
            recommendations={recommendations}
            finalReportBundle={finalReportBundle}
            runSnapshot={currentRunSnapshot}
            qaHistory={qaHistory}
            onAskCaseQuestion={askCaseQuestion}
            onAskGlobalQuestion={askGlobalQuestion}
            onRestart={() => {
              reset();
            }}
          />
        );
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-slate-100">
      {/* Header */}
      <header className="border-b border-slate-800/50 bg-slate-950/50 backdrop-blur-xl sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center">
              <span className="text-white font-bold text-sm">UX</span>
            </div>
            <h1 className="text-xl font-bold bg-gradient-to-r from-emerald-400 to-teal-400 bg-clip-text text-transparent">
              UXAgent
            </h1>
            <span className="text-xs text-slate-500 hidden sm:inline">AI可用性测试平台</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-900/80 border border-slate-800">
              <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-xs text-slate-400">系统就绪</span>
            </div>
          </div>
        </div>
      </header>

      {/* Progress Bar */}
      <ProgressBar currentStep={currentStep} />

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {renderStep()}
      </main>

      <Toaster />
    </div>
  );
}

export default App;
