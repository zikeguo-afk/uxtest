import type {
  DiagnosisItem,
  QuantitativeMetric,
  QualitativeInsight,
  TaskExecution,
} from '@/types';

export const mockDiagnosis: DiagnosisItem[] = [
  {
    dimension: 'DOM 结构',
    status: 'warning',
    description:
      '首页 DOM 深度超过 30 层，存在 Token 上下文溢出风险。已执行分块处理，将页面划分为 Header, ProductGrid, Footer 三个语义块。',
  },
  {
    dimension: '交互元素',
    status: 'success',
    description: '识别到 45 个可交互节点（按钮、输入框）。已映射至抽象交互图。',
  },
  {
    dimension: '无障碍性 (a11y)',
    status: 'error',
    description: '发现 5 个核心图片缺少 alt 属性；"结算"按钮缺少 ARIA 标签，可能导致智能体识别困难。',
  },
  {
    dimension: '死循环风险',
    status: 'warning',
    description: '发现"重置密码"流程存在状态回环风险，已在状态转移图中标记。',
  },
];

export const mockExecutions: TaskExecution[] = [
  {
    taskId: 9,
    taskName: '应用优惠券',
    agentId: 'agent-01',
    agentName: 'Sarah',
    status: 'failed',
    duration: 45,
    result: 'Checkout 按钮无响应，用户失去耐心',
    steps: [
      { step: 1, role: 'observer', content: '扫描页面。识别到 input[id="coupon"] 和 button[text="Apply"]。' },
      { step: 2, role: 'decider', content: '检索工作记忆 -> 目标是"测试无效优惠券"。决定输入 "SAVE100" 并点击。' },
      { step: 3, role: 'executor', content: '调用浏览器 API: await page.fill(\'#coupon\', \'SAVE100\'); await page.click(\'#btn-apply\');' },
      {
        step: 4,
        role: 'feedback',
        content: '弹出 Toast 提示 "Invalid Code"（延迟 2秒）。延迟导致 Sarah 愤怒值 +15% (当前: 40%)。',
        emotion: 'frustrated',
        emotionValue: 40,
      },
      { step: 5, role: 'decider', content: '放弃优惠券，直接点击"提交订单"。' },
      { step: 6, role: 'executor', content: '点击 Checkout 按钮。' },
      {
        step: 7,
        role: 'feedback',
        content: '页面无反应（死点击）。愤怒值达到 100%。触发"狂暴点击"模式（Rage Click），在 1 秒内点击了 5 次。',
        emotion: 'angry',
        emotionValue: 100,
      },
    ],
  },
  {
    taskId: 14,
    taskName: '联系客服',
    agentId: 'agent-02',
    agentName: 'Arthur',
    status: 'success',
    duration: 45,
    result: '在页脚极小的字里找到了"Contact Us"',
    steps: [
      { step: 1, role: 'observer', content: '页面充满促销 Banner，字号较小。' },
      { step: 2, role: 'decider', content: '目标"找客服"。在抽象交互图中搜索"Help"或"Contact"。' },
      { step: 3, role: 'decider', content: "'我看不到明显的 '客服' 按钮，只有很多图标。那个耳机形状的图标是客服吗？我不确定。'" },
      { step: 4, role: 'executor', content: '鼠标悬停在耳机图标上，等待 Tooltip。' },
      { step: 5, role: 'feedback', content: '无 Tooltip 显示。', emotion: 'anxious', emotionValue: 30 },
      { step: 6, role: 'feedback', content: '焦虑值 +20%。记录："界面缺乏文字辅助，导致迷失"', emotion: 'anxious', emotionValue: 50 },
      { step: 7, role: 'decider', content: '尝试滚动到底部寻找 Footer 链接。' },
    ],
  },
  {
    taskId: 12,
    taskName: '完成结账',
    agentId: 'agent-03',
    agentName: 'Budget-Bot',
    status: 'success',
    duration: 120,
    result: '成功完成订单，但对运费显示时机有疑虑',
    steps: [
      { step: 1, role: 'observer', content: '扫描结算页面，识别订单金额：$89.99' },
      { step: 2, role: 'decider', content: '核对购物车金额与实际支付金额是否一致。' },
      { step: 3, role: 'feedback', content: '发现运费在最后一步才显示：+$15.00', emotion: 'frustrated', emotionValue: 35 },
      { step: 4, role: 'decider', content: '怀疑值上升。决定重新检查购物车页面。' },
      { step: 5, role: 'executor', content: '返回购物车页面验证价格。' },
      { step: 6, role: 'feedback', content: '购物车未显示运费估算。记录："成本透明度不足"。', emotion: 'frustrated', emotionValue: 50 },
      { step: 7, role: 'decider', content: '尽管不满，但决定继续完成订单以完成任务。' },
    ],
  },
  {
    taskId: 3,
    taskName: '全局搜索',
    agentId: 'agent-04',
    agentName: 'Emma',
    status: 'success',
    duration: 70,
    result: '搜索可完成，但筛选栏视觉优先级偏弱',
    steps: [
      { step: 1, role: 'observer', content: '进入首页后先定位主视觉区域，搜索框与促销 Banner 竞争注意力。' },
      { step: 2, role: 'decider', content: '目标是搜索“无线耳机”，优先寻找顶部输入框。' },
      { step: 3, role: 'executor', content: '在搜索框输入“无线耳机”并提交。' },
      { step: 4, role: 'feedback', content: '结果页加载完成，卡片排版整齐但筛选入口对比度偏低。', emotion: 'frustrated', emotionValue: 30 },
      { step: 5, role: 'decider', content: '记录视觉层级问题，但继续完成任务。' },
    ],
  },
  {
    taskId: 6,
    taskName: '加入购物车',
    agentId: 'agent-05',
    agentName: 'Tom',
    status: 'success',
    duration: 38,
    result: '快速完成加入购物车，但确认反馈可更清晰',
    steps: [
      { step: 1, role: 'observer', content: '在商品详情页聚焦“加入购物车”主按钮。' },
      { step: 2, role: 'decider', content: '目标仅为完成加购，忽略次要推荐区域。' },
      { step: 3, role: 'executor', content: '点击“加入购物车”。' },
      { step: 4, role: 'feedback', content: '右上角徽标数量变化，Toast 出现后快速消失。', emotion: 'neutral', emotionValue: 15 },
      { step: 5, role: 'decider', content: '任务完成，建议强化成功反馈可见性。' },
    ],
  },
];

export const mockQuantitativeMetrics: QuantitativeMetric[] = [
  { taskId: 9, taskName: '应用优惠券', successRate: 90, bottleneck: '报错提示不明显', emotionPeak: '低' },
  { taskId: 12, taskName: '完成结账', successRate: 20, bottleneck: '按钮无响应/JavaScript错误', emotionPeak: '极高 (愤怒)' },
  { taskId: 14, taskName: '联系客服', successRate: 50, bottleneck: '入口隐蔽，图标无标签', emotionPeak: '中 (焦虑)' },
  { taskId: 3, taskName: '全局搜索', successRate: 78, bottleneck: '筛选入口视觉弱化', emotionPeak: '中 (沮丧)' },
  { taskId: 6, taskName: '加入购物车', successRate: 88, bottleneck: '成功反馈展示时间短', emotionPeak: '低' },
];

export const mockQualitativeInsights: QualitativeInsight[] = [
  {
    firstOrder: '"我点了结账按钮五次它都不动。" (Sarah)',
    secondOrder: '交互阻断: 关键路径（结账）存在技术性阻塞。',
    aggregate: '功能性崩溃 (Functional Breakdown): 结算流程需立即修复代码错误。',
  },
  {
    firstOrder: '"那个图标太小了，我看不清是电话还是耳机。" (Arthur)',
    secondOrder: '信息架构缺陷: 辅助功能入口缺乏文本标签，不符合无障碍标准。',
    aggregate: '包容性设计缺失 (Lack of Inclusive Design): 需增加 ARIA 标签和 Tooltip。',
  },
  {
    firstOrder: '"为什么运费在最后一步才显示？" (Budget-Bot)',
    secondOrder: '成本透明度: 隐藏成本导致价格敏感型用户信任度下降。',
    aggregate: '信任侵蚀 (Trust Erosion): 价格信息应在更早阶段透明展示。',
  },
];

export const mockRecommendations: string[] = [
  '高优先级: 修复 Checkout 按钮的 JavaScript 事件绑定丢失问题（导致 Sarah 愤怒退出的直接原因）。',
  '中优先级: 为 Header 区域的所有图标添加 title 属性或下方文字说明，以降低 Arthur (老年用户) 的焦虑值。',
  '体验优化: 将运费估算前置到购物车页面，避免 Budget-Bot 在最后一步因价格变动而产生负面情感波动。',
];
