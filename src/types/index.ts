// UXAgent 类型定义

export type Step = 'init' | 'analysis' | 'task-selection' | 'execution' | 'report';

export type TaskStatus = 'pending' | 'running' | 'success' | 'failed';

export type AgentEmotion = 'neutral' | 'frustrated' | 'angry' | 'anxious' | 'satisfied';

export interface Task {
  id: number;
  name: string;
  description: string;
  selected: boolean;
}

export interface DiagnosisItem {
  dimension: string;
  status: 'success' | 'warning' | 'error';
  description: string;
}

export interface AgentPersona {
  id: string;
  name: string;
  avatar: string;
  persona: string;
  emotionalBase: string;
  goal: string;
  traits: {
    patience: number;
    techSavvy: number;
    attention: number;
  };
}

export interface ExecutionStep {
  step: number;
  role: 'observer' | 'decider' | 'executor' | 'feedback';
  content: string;
  emotion?: AgentEmotion;
  emotionValue?: number;
}

export interface TaskExecution {
  taskId: number;
  taskName: string;
  agentId: string;
  agentName: string;
  status: TaskStatus;
  steps: ExecutionStep[];
  duration: number;
  result: string;
}

export interface QuantitativeMetric {
  taskId: number;
  taskName: string;
  successRate: number;
  bottleneck: string;
  emotionPeak: string;
}

export interface QualitativeInsight {
  firstOrder: string;
  secondOrder: string;
  aggregate: string;
}

export interface AppState {
  currentStep: Step;
  targetUrl: string;
  diagnosis: DiagnosisItem[];
  tasks: Task[];
  selectedTasks: number[];
  agents: AgentPersona[];
  selectedAgents: string[];
  executions: TaskExecution[];
  quantitativeMetrics: QuantitativeMetric[];
  qualitativeInsights: QualitativeInsight[];
  recommendations: string[];
}
