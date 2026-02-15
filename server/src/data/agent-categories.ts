import type { AgentCategoryTemplate } from '../types/domain';

export const defaultAgentCategories: AgentCategoryTemplate[] = [
  {
    id: 'cat-speed',
    name: '极速党',
    avatar: '👩‍💻',
    persona: '数字原住民，操作极快，缺乏耐心，遇到阻塞容易快速放弃。',
    emotionalBase: ['初始耐心值：低', '倾向：3次连续失败后放弃'],
    goal: '效率优先',
    baseTraits: { patience: 22, techSavvy: 92, attention: 62 },
  },
  {
    id: 'cat-senior',
    name: '银发族',
    avatar: '👴',
    persona: '视力与操作速度受限，依赖明确文字标签和步骤引导。',
    emotionalBase: ['初始焦虑值：中', '倾向：遇到未知反馈时焦虑上升'],
    goal: '准确性优先',
    baseTraits: { patience: 78, techSavvy: 35, attention: 88 },
  },
  {
    id: 'cat-budget',
    name: '价格敏感型',
    avatar: '🤖',
    persona: '对价格与优惠极其敏感，会反复核对金额和规则。',
    emotionalBase: ['初始怀疑值：高', '倾向：价格不透明时信任下降'],
    goal: '成本优先',
    baseTraits: { patience: 72, techSavvy: 84, attention: 94 },
  },
  {
    id: 'cat-visual',
    name: '视觉控',
    avatar: '👩‍🎨',
    persona: '关注界面视觉层级与观感，易受视觉噪声影响。',
    emotionalBase: ['初始审美期待：高', '倾向：视觉层级混乱时产生抵触'],
    goal: '体验优先',
    baseTraits: { patience: 52, techSavvy: 80, attention: 72 },
  },
  {
    id: 'cat-business',
    name: '商务快决策型',
    avatar: '👨‍💼',
    persona: '时间敏感，只关注主路径，不能容忍冗余步骤。',
    emotionalBase: ['初始时间压力：高', '倾向：路径过长会快速跳过信息'],
    goal: '效率优先',
    baseTraits: { patience: 34, techSavvy: 76, attention: 82 },
  },
];
