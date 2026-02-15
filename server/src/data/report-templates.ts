import type {
  NasaTlxReport,
  ReportKPIOverview,
  ReportTemplateTier,
  SUSReport,
  TaskDetailCard,
} from '../types/domain';

export interface TaskPerformanceDefaults {
  durationMultiplier: number;
  durationFloorSeconds: number;
  errorBaseline: number;
  errorPenaltyFactor: number;
  helpBaseline: number;
  helpPenaltyFactor: number;
}

export interface ReportTemplateModel {
  kpi: Omit<ReportKPIOverview, 'averageCompletionRate'>;
  sus: SUSReport;
  nasaTlx: NasaTlxReport;
  taskDetailDefault: Omit<TaskDetailCard, 'taskId' | 'taskCode' | 'title'>;
  performanceDefaults: TaskPerformanceDefaults;
}

const susRanges: SUSReport['rangeReferences'] = [
  { min: 90, max: 100, label: '90-100', level: '最佳', tone: 'positive' },
  { min: 80, max: 89, label: '80-89', level: '优秀', tone: 'positive' },
  { min: 70, max: 79, label: '70-79', level: '良好', tone: 'neutral' },
  { min: 60, max: 69, label: '60-69', level: '一般', tone: 'negative' },
  { min: 0, max: 59, label: '0-59', level: '较差', tone: 'negative' },
];

export const reportTemplates: Record<ReportTemplateTier, ReportTemplateModel> = {
  excellent: {
    kpi: {
      susScore: 86.2,
      averageTaskDuration: '7:48',
      averageErrorRate: 0.38,
    },
    sus: {
      totalScore: 86.2,
      grade: 'A',
      acceptability: '优秀',
      percentileRank: 88,
      rangeReferences: susRanges,
      questionScores: [
        { id: 1, question: '我会频繁使用这个系统', score: 4.6, polarity: 'positive' },
        { id: 2, question: '系统功能过于复杂', score: 1.8, polarity: 'negative' },
        { id: 3, question: '系统易于使用', score: 4.5, polarity: 'positive' },
        { id: 4, question: '需要技术人员支持', score: 1.7, polarity: 'negative' },
        { id: 5, question: '系统功能整合良好', score: 4.4, polarity: 'positive' },
        { id: 6, question: '系统存在太多不一致', score: 1.9, polarity: 'negative' },
        { id: 7, question: '大多数人能快速学会', score: 4.4, polarity: 'positive' },
        { id: 8, question: '系统操作繁琐', score: 1.8, polarity: 'negative' },
        { id: 9, question: '我对使用系统感到自信', score: 4.3, polarity: 'positive' },
        { id: 10, question: '需要学习很多内容', score: 2.0, polarity: 'negative' },
      ],
    },
    nasaTlx: {
      dimensions: [
        { id: 'mental', label: '脑力需求', value: 42, description: '思考、决策、计算等脑力劳动', tone: 'neutral' },
        { id: 'physical', label: '体力需求', value: 18, description: '体力劳动强度', tone: 'positive' },
        { id: 'temporal', label: '时间压力', value: 36, description: '完成任务的时间紧迫程度', tone: 'positive' },
        { id: 'performance', label: '绩效水平', value: 78, description: '对自己表现的满意度', tone: 'positive' },
        { id: 'effort', label: '努力程度', value: 40, description: '为完成任务付出的努力', tone: 'neutral' },
        { id: 'frustration', label: '挫折程度', value: 22, description: '感到沮丧、紧张的程度', tone: 'positive' },
      ],
      wwl: 39.5,
      summary: '整体工作负荷较低，主要压力来自复杂任务切换。',
      strengths: ['核心流程完成效率高', '关键路径反馈清晰', '学习成本低，上手快'],
      risks: ['高级功能入口层级偏深', '复杂筛选的可解释性有待增强'],
    },
    taskDetailDefault: {
      difficulty: '中等',
      estimatedDuration: '6-10分钟',
      testScenario: '你正在完成一个关键业务流程，请在限定时间内完成目标并记录异常。',
      operationSteps: ['确认入口位置', '执行核心操作', '验证反馈与状态', '完成提交并复核结果'],
      successCriteria: ['流程可顺畅完成', '反馈明确且可理解', '关键结果保存成功'],
      tags: ['核心流程', '效率优先'],
    },
    performanceDefaults: {
      durationMultiplier: 0.94,
      durationFloorSeconds: 220,
      errorBaseline: 0.18,
      errorPenaltyFactor: 0.018,
      helpBaseline: 0.08,
      helpPenaltyFactor: 0.013,
    },
  },
  medium: {
    kpi: {
      susScore: 78.5,
      averageTaskDuration: '8:51',
      averageErrorRate: 0.65,
    },
    sus: {
      totalScore: 78.5,
      grade: 'B+',
      acceptability: '良好',
      percentileRank: 75,
      rangeReferences: susRanges,
      questionScores: [
        { id: 1, question: '我会频繁使用这个系统', score: 4.2, polarity: 'positive' },
        { id: 2, question: '系统功能过于复杂', score: 2.1, polarity: 'negative' },
        { id: 3, question: '系统易于使用', score: 4.3, polarity: 'positive' },
        { id: 4, question: '需要技术人员支持', score: 2.3, polarity: 'negative' },
        { id: 5, question: '系统功能整合良好', score: 4.0, polarity: 'positive' },
        { id: 6, question: '系统存在太多不一致', score: 1.8, polarity: 'negative' },
        { id: 7, question: '大多数人能快速学会', score: 4.1, polarity: 'positive' },
        { id: 8, question: '系统操作繁琐', score: 2.0, polarity: 'negative' },
        { id: 9, question: '我对使用系统感到自信', score: 3.8, polarity: 'positive' },
        { id: 10, question: '需要学习很多内容', score: 2.5, polarity: 'negative' },
      ],
    },
    nasaTlx: {
      dimensions: [
        { id: 'mental', label: '脑力需求', value: 68, description: '思考、决策、计算等脑力劳动', tone: 'negative' },
        { id: 'physical', label: '体力需求', value: 25, description: '体力劳动强度', tone: 'positive' },
        { id: 'temporal', label: '时间压力', value: 55, description: '完成任务的时间紧迫程度', tone: 'neutral' },
        { id: 'performance', label: '绩效水平', value: 72, description: '对自己表现的满意度', tone: 'neutral' },
        { id: 'effort', label: '努力程度', value: 62, description: '为完成任务付出的努力', tone: 'negative' },
        { id: 'frustration', label: '挫折程度', value: 35, description: '感到沮丧、紧张的程度', tone: 'positive' },
      ],
      wwl: 52.8,
      summary: '中等工作负荷水平，系统使用不会给用户带来过大压力。',
      strengths: ['核心工作流任务完成率较高', '基础功能任务可稳定完成', '整体易用性评价处于可接受区间'],
      risks: ['复杂视图类任务完成率偏低', '部分高级功能理解门槛较高', '导航回溯成本偏高'],
    },
    taskDetailDefault: {
      difficulty: '中等',
      estimatedDuration: '8-12分钟',
      testScenario: '你需要在常规业务节奏下完成目标任务，并处理中途出现的提示与校验。',
      operationSteps: ['进入目标模块', '执行主要操作', '根据反馈修正操作', '提交并确认结果'],
      successCriteria: ['任务目标达成', '关键信息不丢失', '异常可恢复且可继续流程'],
      tags: ['核心工作流', '稳定性'],
    },
    performanceDefaults: {
      durationMultiplier: 1,
      durationFloorSeconds: 260,
      errorBaseline: 0.28,
      errorPenaltyFactor: 0.024,
      helpBaseline: 0.15,
      helpPenaltyFactor: 0.017,
    },
  },
  'needs-improvement': {
    kpi: {
      susScore: 66.4,
      averageTaskDuration: '10:26',
      averageErrorRate: 1.12,
    },
    sus: {
      totalScore: 66.4,
      grade: 'C',
      acceptability: '待改进',
      percentileRank: 43,
      rangeReferences: susRanges,
      questionScores: [
        { id: 1, question: '我会频繁使用这个系统', score: 3.4, polarity: 'positive' },
        { id: 2, question: '系统功能过于复杂', score: 3.1, polarity: 'negative' },
        { id: 3, question: '系统易于使用', score: 3.2, polarity: 'positive' },
        { id: 4, question: '需要技术人员支持', score: 3.4, polarity: 'negative' },
        { id: 5, question: '系统功能整合良好', score: 3.1, polarity: 'positive' },
        { id: 6, question: '系统存在太多不一致', score: 3.3, polarity: 'negative' },
        { id: 7, question: '大多数人能快速学会', score: 3.0, polarity: 'positive' },
        { id: 8, question: '系统操作繁琐', score: 3.2, polarity: 'negative' },
        { id: 9, question: '我对使用系统感到自信', score: 2.9, polarity: 'positive' },
        { id: 10, question: '需要学习很多内容', score: 3.6, polarity: 'negative' },
      ],
    },
    nasaTlx: {
      dimensions: [
        { id: 'mental', label: '脑力需求', value: 78, description: '思考、决策、计算等脑力劳动', tone: 'negative' },
        { id: 'physical', label: '体力需求', value: 31, description: '体力劳动强度', tone: 'neutral' },
        { id: 'temporal', label: '时间压力', value: 72, description: '完成任务的时间紧迫程度', tone: 'negative' },
        { id: 'performance', label: '绩效水平', value: 58, description: '对自己表现的满意度', tone: 'negative' },
        { id: 'effort', label: '努力程度', value: 75, description: '为完成任务付出的努力', tone: 'negative' },
        { id: 'frustration', label: '挫折程度', value: 61, description: '感到沮丧、紧张的程度', tone: 'negative' },
      ],
      wwl: 66.1,
      summary: '整体工作负荷偏高，存在明显认知和时间压力。',
      strengths: ['少数基础任务仍具备可完成性', '关键数据完整性尚可'],
      risks: ['跨模块路径复杂且指引不足', '错误反馈恢复链路不完整', '用户在时间压力下容易连续失败'],
    },
    taskDetailDefault: {
      difficulty: '困难',
      estimatedDuration: '10-15分钟',
      testScenario: '你需要在高压场景下完成目标任务，过程中可能出现中断、误导性提示或重复确认。',
      operationSteps: ['定位入口并确认任务目标', '尝试完成主流程', '处理异常与回退', '再次提交并确认结果'],
      successCriteria: ['核心目标达成', '错误可理解并可恢复', '不会造成数据丢失'],
      tags: ['高风险流程', '容错'],
    },
    performanceDefaults: {
      durationMultiplier: 1.12,
      durationFloorSeconds: 300,
      errorBaseline: 0.42,
      errorPenaltyFactor: 0.03,
      helpBaseline: 0.2,
      helpPenaltyFactor: 0.022,
    },
  },
};
