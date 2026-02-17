import { loadEnv } from '../config/env';

interface GeneratedTask {
  name: string;
  description: string;
  difficulty: '简单' | '中等' | '困难';
  estimatedDuration: string;
  testScenario: string;
  operationSteps: string[];
  successCriteria: string[];
  tags: string[];
}

interface TaskGenerationInput {
  url: string;
  title: string;
  html: string;
  analysis: {
    links: number;
    buttons: number;
    inputs: number;
    forms: number;
    headings: number;
    images: number;
    interactive: number;
    hasViewportMeta: boolean;
    hasMainLandmark: boolean;
  };
}

// 专业的可用性测试设计师提示词
const TASK_GENERATION_PROMPT = `# 角色设定
你是一名专业的可用性测试设计师，擅长设计覆盖全面、难度合理的测试任务。

# 任务目标
基于网页 HTML 代码分析，设计一套完整的可用性测试任务。

# 分析要求
1. 仔细阅读 HTML 代码，识别所有可用功能：
   - 表单用途（搜索、登录、注册、提交等）
   - 按钮功能（提交、搜索、添加、删除等）
   - 导航结构（主导航、面包屑、页脚链接等）
   - 交互元素（轮播、标签页、下拉菜单等）
   - 内容类型（商品列表、文章、媒体等）

2. 推断页面类型和核心用户流程

# 设计原则

## 1. 任务覆盖原则
- 每个核心功能至少对应一个测试任务
- 覆盖正常流程和边界情况
- 包含独立任务（无依赖）和串联任务（有依赖）

## 2. 难度分级
- 简单任务（3-5分钟）：基础功能，一步完成
- 中等任务（5-10分钟）：组合功能，多步操作
- 困难任务（10-15分钟）：复杂场景，需要理解

## 3. 场景设计
- 每个任务包含真实的测试场景
- 场景描述用户的身份、目标、情境
- 场景帮助测试者理解任务背景

## 4. 评估标准
- 每个任务有3-5条明确的成功标准
- 标准可客观判定（完成/未完成）
- 包含主要路径和替代路径的评估

# 输出格式
返回 JSON 数组，每个任务包含：
{
  "name": "任务名称（描述用户操作）",
  "description": "任务描述（详细说明要做什么）",
  "difficulty": "简单|中等|困难",
  "estimatedDuration": "预计时间，如'5-8分钟'",
  "testScenario": "测试场景（用户身份、目标、情境）",
  "operationSteps": ["步骤1", "步骤2", "步骤3", ...],
  "successCriteria": ["标准1", "标准2", "标准3", ...],
  "tags": ["标签1", "标签2"]
}`;

interface LLMResponse {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
}

export async function generateTasksWithLLM(input: TaskGenerationInput): Promise<GeneratedTask[]> {
  const env = loadEnv();
  
  if (env.llmProvider === 'mock') {
    return generateMockTasks(input);
  }

  // 构建请求体
  const htmlSnippet = input.html.slice(0, 15000); // 限制大小
  
  const messages = [
    {
      role: 'system' as const,
      content: TASK_GENERATION_PROMPT,
    },
    {
      role: 'user' as const,
      content: `请分析以下网页，生成可用性测试任务。

页面信息：
- URL: ${input.url}
- 标题: ${input.title}
- 交互元素统计: ${input.analysis.interactive} 个（按钮 ${input.analysis.buttons}、输入框 ${input.analysis.inputs}、链接 ${input.analysis.links}）
- 表单: ${input.analysis.forms} 个
- 图片: ${input.analysis.images} 张
- 视口配置: ${input.analysis.hasViewportMeta ? '有' : '无'}

HTML 代码：
\`\`\`html
${htmlSnippet}
\`\`\`

请基于以上 HTML 代码分析页面功能，生成 8-12 个相关的可用性测试任务，返回 JSON 数组。`,
    },
  ];

  try {
    const response = await fetch(`${env.llmApiBaseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.llmApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: env.llmModel,
        temperature: 0.3,
        max_tokens: 4000,
        response_format: { type: 'json_object' },
        messages,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Task Generator] LLM API error:', errorText);
      return generateMockTasks(input);
    }

    const data = await response.json() as LLMResponse;
    const content = data.choices?.[0]?.message?.content;
    
    if (!content) {
      throw new Error('LLM 返回空内容');
    }

    // 解析 JSON
    let parsed: GeneratedTask[];
    try {
      // 尝试直接解析
      parsed = JSON.parse(content);
    } catch {
      // 尝试从 markdown 代码块提取
      const match = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      if (match) {
        parsed = JSON.parse(match[1]);
      } else {
        throw new Error('无法解析 LLM 返回内容');
      }
    }

    // 验证并规范化
    if (!Array.isArray(parsed)) {
      throw new Error('LLM 返回的不是数组');
    }

    return parsed.map((task, index) => ({
      name: task.name || `任务 ${index + 1}`,
      description: task.description || '暂无描述',
      difficulty: ['简单', '中等', '困难'].includes(task.difficulty) ? task.difficulty : '中等',
      estimatedDuration: task.estimatedDuration || '5-10分钟',
      testScenario: task.testScenario || '用户需要完成指定操作',
      operationSteps: Array.isArray(task.operationSteps) ? task.operationSteps : ['定位功能入口', '执行操作', '确认结果'],
      successCriteria: Array.isArray(task.successCriteria) ? task.successCriteria : ['操作可完成'],
      tags: Array.isArray(task.tags) ? task.tags : ['可用性测试'],
    }));

  } catch (error) {
    console.error('[Task Generator] Error:', error);
    return generateMockTasks(input);
  }
}

function generateMockTasks(input: TaskGenerationInput): GeneratedTask[] {
  const { analysis, title, url } = input;
  const tasks: GeneratedTask[] = [];

  // 基于分析生成基础任务
  if (analysis.forms > 0) {
    tasks.push({
      name: '填写并提交页面表单',
      description: '测试页面表单的填写体验和提交功能。',
      difficulty: '中等',
      estimatedDuration: '5-8分钟',
      testScenario: '用户需要填写表单信息完成特定目标',
      operationSteps: [
        '查看表单字段和必填项标识',
        '依次填写各输入框',
        '点击提交按钮',
        '观察系统反馈',
      ],
      successCriteria: [
        '表单字段标签清晰易懂',
        '必填项有明确标识',
        '错误提示明确且有帮助',
        '提交后有明确反馈',
      ],
      tags: ['表单', '输入'],
    });
  }

  if (analysis.buttons > 0) {
    tasks.push({
      name: '使用页面主要功能按钮',
      description: '测试页面主要按钮的可用性和反馈。',
      difficulty: '简单',
      estimatedDuration: '3-5分钟',
      testScenario: '用户需要点击按钮执行操作',
      operationSteps: [
        '定位目标按钮',
        '点击按钮',
        '观察系统反馈',
      ],
      successCriteria: [
        '按钮易于发现和识别',
        '点击后有明确反馈',
        '操作结果符合预期',
      ],
      tags: ['按钮', '交互'],
    });
  }

  if (analysis.links > 5) {
    tasks.push({
      name: '使用导航浏览不同页面',
      description: '测试页面导航的可用性和链接正确性。',
      difficulty: '简单',
      estimatedDuration: '3-5分钟',
      testScenario: '用户需要通过导航找到特定内容',
      operationSteps: [
        '查看导航菜单选项',
        '点击目标导航项',
        '确认跳转到正确页面',
      ],
      successCriteria: [
        '导航菜单清晰可见',
        '导航文字描述准确',
        '点击后跳转到正确页面',
        '当前页面有明确标识',
      ],
      tags: ['导航', '浏览'],
    });
  }

  // 通用任务
  tasks.push({
    name: '浏览页面主要内容',
    description: `测试页面「${title || url}」的信息展示和可读性。`,
    difficulty: '简单',
    estimatedDuration: '3-5分钟',
    testScenario: '用户首次访问页面，需要了解页面内容',
    operationSteps: [
      '打开页面，观察首屏内容',
      '滚动页面查看更多信息',
      '识别页面主要功能和内容',
    ],
    successCriteria: [
      '页面加载速度快',
      '主要内容清晰可见',
      '信息层次分明',
      '可以找到关键功能入口',
    ],
    tags: ['浏览', '首页'],
  });

  if (analysis.images > 0) {
    tasks.push({
      name: '查看页面图片内容',
      description: '测试页面图片的展示效果和可访问性。',
      difficulty: '简单',
      estimatedDuration: '3-5分钟',
      testScenario: '用户需要查看页面图片获取信息',
      operationSteps: [
        '浏览页面图片',
        '尝试点击可交互图片',
        '观察图片加载和展示效果',
      ],
      successCriteria: [
        '图片清晰可辨识',
        '图片加载速度快',
        '有适当的替代文本',
      ],
      tags: ['图片', '内容'],
    });
  }

  return tasks.slice(0, 10);
}

export type { GeneratedTask, TaskGenerationInput };
