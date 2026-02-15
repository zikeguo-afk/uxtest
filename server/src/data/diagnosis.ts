import type { DiagnosisItem } from '../types/domain';

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
