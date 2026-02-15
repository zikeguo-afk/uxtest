import type { LLMAdapter } from './adapter';

export const mockLLMAdapter: LLMAdapter = {
  kind: 'mock',
  enhanceInference(input) {
    return {
      answer: input.draftAnswer,
      confidenceDelta: 0,
    };
  },
  getResponsibilities() {
    return [
      '仅润色 QA 引擎给出的推断回答草稿，不改动证据引用。',
      '不新增或伪造案例、任务、步骤证据。',
      '输出应保持中文、简洁、可执行建议导向。',
    ];
  },
  healthCheck() {
    return {
      provider: 'mock',
      model: 'mock-llm-adapter',
      configured: true,
      reachable: true,
      message: '当前使用 mock 适配器，不会请求外部大模型 API。',
      checkedAt: new Date().toISOString(),
    };
  },
};
