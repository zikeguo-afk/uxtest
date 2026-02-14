import { useState, useCallback } from 'react';
import type { 
  Step, 
  Task, 
  DiagnosisItem, 
  AgentPersona, 
  TaskExecution,
  QuantitativeMetric,
  QualitativeInsight
} from '@/types';

// 预定义的15个可用性任务
const defaultTasks: Task[] = [
  { id: 1, name: '新用户注册', description: '完成账号注册流程', selected: false },
  { id: 2, name: '登录账号', description: '使用已有凭证登录', selected: false },
  { id: 3, name: '全局搜索', description: '使用搜索栏查找"无线耳机"', selected: false },
  { id: 4, name: '筛选商品', description: '在搜索结果中按"价格从低到高"排序', selected: false },
  { id: 5, name: '查看详情', description: '点击任意商品进入详情页', selected: false },
  { id: 6, name: '加入购物车', description: '将一件商品加入购物车', selected: false },
  { id: 7, name: '修改数量', description: '在购物车中将商品数量改为 2', selected: false },
  { id: 8, name: '删除商品', description: '从购物车移除一件商品', selected: false },
  { id: 9, name: '应用优惠券', description: '在结算页输入无效优惠券代码并处理报错', selected: false },
  { id: 10, name: '填写地址', description: '新增一个收货地址', selected: false },
  { id: 11, name: '选择支付', description: '切换支付方式（如从信用卡切换到 PayPal）', selected: false },
  { id: 12, name: '完成结账', description: '提交订单并到达"感谢购买"页面', selected: false },
  { id: 13, name: '查看订单', description: '进入个人中心查看历史订单', selected: false },
  { id: 14, name: '联系客服', description: '找到客服入口或 FAQ 页面', selected: false },
  { id: 15, name: '退出登录', description: '安全退出当前账号', selected: false },
];

// 预定义的AI被测试人员画像
const defaultAgents: AgentPersona[] = [
  {
    id: 'agent-01',
    name: 'Sarah',
    avatar: '👩‍💻',
    persona: '极速党 - 25岁，数字原住民。操作极快，缺乏耐心。遇到加载慢或流程繁琐时，愤怒值飙升极快。',
    emotionalBase: '初始耐心值：低<br>阈值：3次错误操作即放弃',
    goal: '效率优先',
    traits: { patience: 20, techSavvy: 95, attention: 60 }
  },
  {
    id: 'agent-02',
    name: 'Arthur',
    avatar: '👴',
    persona: '银发族 - 72岁，视力欠佳，不熟悉图标含义。依赖清晰的文字标签，操作缓慢。',
    emotionalBase: '初始焦虑值：中<br>倾向：遇到未知弹窗容易产生挫败感',
    goal: '准确性优先',
    traits: { patience: 80, techSavvy: 30, attention: 90 }
  },
  {
    id: 'agent-03',
    name: 'Budget-Bot',
    avatar: '🤖',
    persona: '比价王 - 逻辑严密，对价格敏感。会反复检查购物车金额和优惠券。',
    emotionalBase: '初始怀疑值：高<br>倾向：对价格变动非常敏感',
    goal: '成本优先',
    traits: { patience: 70, techSavvy: 85, attention: 95 }
  },
  {
    id: 'agent-04',
    name: 'Emma',
    avatar: '👩‍🎨',
    persona: '视觉控 - 28岁，设计师。对界面美观度要求极高，容易被视觉干扰。',
    emotionalBase: '初始审美期待：高<br>倾向：遇到丑陋界面时产生抵触',
    goal: '体验优先',
    traits: { patience: 50, techSavvy: 80, attention: 70 }
  },
  {
    id: 'agent-05',
    name: 'Tom',
    avatar: '👨‍💼',
    persona: '商务人士 - 35岁，时间宝贵。只关注核心功能，希望快速完成任务。',
    emotionalBase: '初始时间压力：高<br>倾向：对冗余步骤零容忍',
    goal: '效率优先',
    traits: { patience: 30, techSavvy: 75, attention: 80 }
  },
];

export function useUXAgent() {
  const [currentStep, setCurrentStep] = useState<Step>('init');
  const [targetUrl, setTargetUrl] = useState('');
  const [diagnosis, setDiagnosis] = useState<DiagnosisItem[]>([]);
  const [tasks, setTasks] = useState<Task[]>(defaultTasks);
  const [selectedTasks, setSelectedTasks] = useState<number[]>([]);
  const [agents] = useState<AgentPersona[]>(defaultAgents);
  const [selectedAgents, setSelectedAgents] = useState<string[]>([]);
  const [executions, setExecutions] = useState<TaskExecution[]>([]);
  const [quantitativeMetrics, setQuantitativeMetrics] = useState<QuantitativeMetric[]>([]);
  const [qualitativeInsights, setQualitativeInsights] = useState<QualitativeInsight[]>([]);
  const [recommendations, setRecommendations] = useState<string[]>([]);

  const goToStep = useCallback((step: Step) => {
    setCurrentStep(step);
  }, []);

  const updateUrl = useCallback((url: string) => {
    setTargetUrl(url);
  }, []);

  const generateDiagnosis = useCallback(() => {
    // 模拟AI诊断结果
    const mockDiagnosis: DiagnosisItem[] = [
      {
        dimension: 'DOM 结构',
        status: 'warning',
        description: '首页 DOM 深度超过 30 层，存在 Token 上下文溢出风险。已执行分块处理，将页面划分为 Header, ProductGrid, Footer 三个语义块。'
      },
      {
        dimension: '交互元素',
        status: 'success',
        description: '识别到 45 个可交互节点（按钮、输入框）。已映射至抽象交互图。'
      },
      {
        dimension: '无障碍性 (a11y)',
        status: 'error',
        description: '发现 5 个核心图片缺少 alt 属性；"结算"按钮缺少 ARIA 标签，可能导致智能体识别困难。'
      },
      {
        dimension: '死循环风险',
        status: 'warning',
        description: '发现"重置密码"流程存在状态回环风险，已在状态转移图中标记。'
      }
    ];
    setDiagnosis(mockDiagnosis);
  }, []);

  const toggleTask = useCallback((taskId: number) => {
    setTasks(prev => prev.map(task => 
      task.id === taskId ? { ...task, selected: !task.selected } : task
    ));
    setSelectedTasks(prev => {
      if (prev.includes(taskId)) {
        return prev.filter(id => id !== taskId);
      }
      if (prev.length >= 10) return prev;
      return [...prev, taskId];
    });
  }, []);

  const toggleAgent = useCallback((agentId: string) => {
    setSelectedAgents(prev => {
      if (prev.includes(agentId)) {
        return prev.filter(id => id !== agentId);
      }
      return [...prev, agentId];
    });
  }, []);

  const generateExecutions = useCallback(() => {
    // 模拟任务执行结果
    const mockExecutions: TaskExecution[] = [
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
          { step: 4, role: 'feedback', content: '弹出 Toast 提示 "Invalid Code"（延迟 2秒）。延迟导致 Sarah 愤怒值 +15% (当前: 40%)。', emotion: 'frustrated', emotionValue: 40 },
          { step: 5, role: 'decider', content: '放弃优惠券，直接点击"提交订单"。' },
          { step: 6, role: 'executor', content: '点击 Checkout 按钮。' },
          { step: 7, role: 'feedback', content: '页面无反应（死点击）。愤怒值达到 100%。触发"狂暴点击"模式（Rage Click），在 1 秒内点击了 5 次。', emotion: 'angry', emotionValue: 100 },
        ]
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
          { step: 3, role: 'decider', content: '\'我看不到明显的 \'客服\' 按钮，只有很多图标。那个耳机形状的图标是客服吗？我不确定。\'' },
          { step: 4, role: 'executor', content: '鼠标悬停在耳机图标上，等待 Tooltip。' },
          { step: 5, role: 'feedback', content: '无 Tooltip 显示。', emotion: 'anxious', emotionValue: 30 },
          { step: 6, role: 'feedback', content: '焦虑值 +20%。记录："界面缺乏文字辅助，导致迷失"', emotion: 'anxious', emotionValue: 50 },
          { step: 7, role: 'decider', content: '尝试滚动到底部寻找 Footer 链接。' },
        ]
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
        ]
      }
    ];
    setExecutions(mockExecutions);
  }, []);

  const generateReport = useCallback(() => {
    // 量化指标
    const mockMetrics: QuantitativeMetric[] = [
      { taskId: 9, taskName: '应用优惠券', successRate: 90, bottleneck: '报错提示不明显', emotionPeak: '低' },
      { taskId: 12, taskName: '完成结账', successRate: 20, bottleneck: '按钮无响应/JavaScript错误', emotionPeak: '极高 (愤怒)' },
      { taskId: 14, taskName: '联系客服', successRate: 50, bottleneck: '入口隐蔽，图标无标签', emotionPeak: '中 (焦虑)' },
    ];
    setQuantitativeMetrics(mockMetrics);

    // 定性洞察
    const mockInsights: QualitativeInsight[] = [
      {
        firstOrder: '"我点了结账按钮五次它都不动。" (Sarah)',
        secondOrder: '交互阻断: 关键路径（结账）存在技术性阻塞。',
        aggregate: '功能性崩溃 (Functional Breakdown): 结算流程需立即修复代码错误。'
      },
      {
        firstOrder: '"那个图标太小了，我看不清是电话还是耳机。" (Arthur)',
        secondOrder: '信息架构缺陷: 辅助功能入口缺乏文本标签，不符合无障碍标准。',
        aggregate: '包容性设计缺失 (Lack of Inclusive Design): 需增加 ARIA 标签和 Tooltip。'
      },
      {
        firstOrder: '"为什么运费在最后一步才显示？" (Budget-Bot)',
        secondOrder: '成本透明度: 隐藏成本导致价格敏感型用户信任度下降。',
        aggregate: '信任侵蚀 (Trust Erosion): 价格信息应在更早阶段透明展示。'
      }
    ];
    setQualitativeInsights(mockInsights);

    // 改进建议
    const mockRecommendations = [
      '高优先级: 修复 Checkout 按钮的 JavaScript 事件绑定丢失问题（导致 Sarah 愤怒退出的直接原因）。',
      '中优先级: 为 Header 区域的所有图标添加 title 属性或下方文字说明，以降低 Arthur (老年用户) 的焦虑值。',
      '体验优化: 将运费估算前置到购物车页面，避免 Budget-Bot 在最后一步因价格变动而产生负面情感波动。'
    ];
    setRecommendations(mockRecommendations);
  }, []);

  return {
    currentStep,
    targetUrl,
    diagnosis,
    tasks,
    selectedTasks,
    agents,
    selectedAgents,
    executions,
    quantitativeMetrics,
    qualitativeInsights,
    recommendations,
    goToStep,
    updateUrl,
    generateDiagnosis,
    toggleTask,
    toggleAgent,
    generateExecutions,
    generateReport,
  };
}
