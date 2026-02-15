import type { Task } from '../types/domain';

export const defaultTasks: Task[] = [
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
