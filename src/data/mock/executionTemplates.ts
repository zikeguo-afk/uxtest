export interface ExecutionTemplate {
  taskId: number;
  baseDuration: number;
  difficulty: number;
  successFeedback: string;
  failureFeedback: string;
  bottlenecks: string[];
}

export const executionTemplates: Record<number, ExecutionTemplate> = {
  1: { taskId: 1, baseDuration: 80, difficulty: 52, successFeedback: '完成注册流程并进入欢迎页。', failureFeedback: '验证码与错误提示反馈不清晰，注册中断。', bottlenecks: ['表单校验反馈弱', '验证码流程复杂'] },
  2: { taskId: 2, baseDuration: 45, difficulty: 40, successFeedback: '成功登录并进入首页。', failureFeedback: '登录按钮反馈滞后，重复点击导致困惑。', bottlenecks: ['登录反馈延迟', '错误提示不聚焦'] },
  3: { taskId: 3, baseDuration: 55, difficulty: 36, successFeedback: '搜索结果返回，能继续浏览。', failureFeedback: '搜索结果相关性不足，需重复尝试关键词。', bottlenecks: ['搜索相关性不足', '筛选入口不明显'] },
  4: { taskId: 4, baseDuration: 60, difficulty: 44, successFeedback: '成功按价格排序并确认变化。', failureFeedback: '排序状态提示弱，用户难以确认是否生效。', bottlenecks: ['排序状态不清晰', '筛选控件密度高'] },
  5: { taskId: 5, baseDuration: 35, difficulty: 28, successFeedback: '顺利进入商品详情页。', failureFeedback: '详情入口点击区域过小，误触频繁。', bottlenecks: ['点击热区偏小', '卡片信息噪声大'] },
  6: { taskId: 6, baseDuration: 38, difficulty: 30, successFeedback: '商品成功加入购物车。', failureFeedback: '加入后反馈显示时间短，状态不确定。', bottlenecks: ['成功反馈停留短', '按钮层级不突出'] },
  7: { taskId: 7, baseDuration: 48, difficulty: 42, successFeedback: '购物车数量更新为目标值。', failureFeedback: '数量控件步进逻辑不直观，修改失败。', bottlenecks: ['步进控件可发现性低', '更新反馈不同步'] },
  8: { taskId: 8, baseDuration: 46, difficulty: 43, successFeedback: '商品成功移除并刷新金额。', failureFeedback: '删除确认流程冗余，金额刷新不及时。', bottlenecks: ['删除确认冗长', '金额刷新延迟'] },
  9: { taskId: 9, baseDuration: 72, difficulty: 58, successFeedback: '优惠券校验完成并给出明确结果。', failureFeedback: '优惠券错误提示位置隐蔽，无法快速理解。', bottlenecks: ['错误提示不明显', '优惠规则解释不足'] },
  10: { taskId: 10, baseDuration: 85, difficulty: 56, successFeedback: '新增地址成功并被默认选中。', failureFeedback: '地址表单字段密集，输入成本高。', bottlenecks: ['表单字段过多', '自动补全提示不足'] },
  11: { taskId: 11, baseDuration: 52, difficulty: 45, successFeedback: '支付方式切换成功并保持状态。', failureFeedback: '支付切换后状态重置，用户需重复操作。', bottlenecks: ['状态持久化不足', '支付入口层级混乱'] },
  12: { taskId: 12, baseDuration: 96, difficulty: 64, successFeedback: '订单提交成功，进入感谢页。', failureFeedback: '结账按钮响应异常，流程中断。', bottlenecks: ['结账按钮可靠性问题', '关键路径容错不足'] },
  13: { taskId: 13, baseDuration: 50, difficulty: 38, successFeedback: '成功查看历史订单列表。', failureFeedback: '个人中心导航语义不清，定位困难。', bottlenecks: ['导航信息架构弱', '入口命名不一致'] },
  14: { taskId: 14, baseDuration: 62, difficulty: 50, successFeedback: '找到客服入口并进入帮助页。', failureFeedback: '客服入口过隐蔽，图标缺少文字支持。', bottlenecks: ['客服入口隐蔽', '辅助文本不足'] },
  15: { taskId: 15, baseDuration: 35, difficulty: 32, successFeedback: '安全退出完成并返回未登录态。', failureFeedback: '退出入口层级深，确认流程困惑。', bottlenecks: ['退出入口过深', '确认文案不明确'] },
};

export const fallbackExecutionTemplate: ExecutionTemplate = {
  taskId: 0,
  baseDuration: 60,
  difficulty: 45,
  successFeedback: '任务执行成功完成。',
  failureFeedback: '任务执行中断，需要重试。',
  bottlenecks: ['交互反馈不足'],
};
