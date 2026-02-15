import type { LLMAdapter, LLMHealthReport } from './adapter';
import type { LLMEnhanceInput, LLMEnhanceOutput } from '../types/domain';

interface OpenAICompatibleAdapterOptions {
  baseUrl: string;
  apiKey: string;
  model: string;
  timeoutMs: number;
  temperature: number;
}

interface ChatCompletionResponse {
  choices?: Array<{
    message?: {
      content?: string | null;
    };
  }>;
}

const RESPONSIBILITIES = [
  '只增强 QA 的推断描述质量，不生成新的事实证据。',
  '严格基于输入 evidence，禁止编造 caseId/taskId/step。',
  '输出必须是中文，且保留“推断”标注语气。',
];

const SYSTEM_PROMPT = [
  '你是 UXAgent 的推断润色器，只做答案增强，不做证据生成。',
  '硬性规则：',
  '1) 只可改写 draftAnswer，不得引入输入 evidence 之外的新事实。',
  '2) 不得虚构案例编号、任务编号、步骤号、指标数据。',
  '3) 保持中文，简洁，结论可执行。',
  '4) 返回 JSON：{"answer":"...","confidenceDelta":number}。',
  '5) confidenceDelta 仅允许 -0.15 到 0.15。',
].join('\n');

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function safeParseJson(text: string): Record<string, unknown> | null {
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    // Attempt extraction from markdown code fence.
    const matched = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    if (!matched) {
      return null;
    }
    try {
      return JSON.parse(matched[1]) as Record<string, unknown>;
    } catch {
      return null;
    }
  }
}

function toEnhanceOutput(input: LLMEnhanceInput, payload: Record<string, unknown> | null): LLMEnhanceOutput {
  const answer =
    typeof payload?.answer === 'string' && payload.answer.trim().length > 0
      ? payload.answer.trim()
      : input.draftAnswer;

  const rawDelta = typeof payload?.confidenceDelta === 'number' ? payload.confidenceDelta : 0;
  const confidenceDelta = clamp(rawDelta, -0.15, 0.15);

  return {
    answer,
    confidenceDelta,
  };
}

function withTimeoutSignal(timeoutMs: number): { signal: AbortSignal; cancel: () => void } {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(2_000, timeoutMs));
  return {
    signal: controller.signal,
    cancel: () => clearTimeout(timer),
  };
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, '');
}

async function callChatCompletion(
  options: OpenAICompatibleAdapterOptions,
  input: LLMEnhanceInput,
): Promise<LLMEnhanceOutput> {
  const body = {
    model: options.model,
    temperature: options.temperature,
    max_tokens: 120,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: JSON.stringify(
          {
            question: input.question,
            scope: input.scope,
            draftAnswer: input.draftAnswer,
            evidence: input.evidence,
          },
          null,
          2,
        ),
      },
    ],
  };

  const timeout = withTimeoutSignal(options.timeoutMs);
  try {
    const response = await fetch(`${normalizeBaseUrl(options.baseUrl)}/chat/completions`, {
      method: 'POST',
      signal: timeout.signal,
      headers: {
        authorization: `Bearer ${options.apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`LLM API 请求失败: ${response.status} ${text.slice(0, 200)}`);
    }

    const payload = (await response.json()) as ChatCompletionResponse;
    const content = payload.choices?.[0]?.message?.content ?? '';
    return toEnhanceOutput(input, safeParseJson(content ?? ''));
  } finally {
    timeout.cancel();
  }
}

async function probeChatCompletion(options: OpenAICompatibleAdapterOptions): Promise<void> {
  const body = {
    model: options.model,
    temperature: 0,
    max_tokens: 5,
    messages: [
      { role: 'system', content: 'Reply with exactly: pong' },
      { role: 'user', content: 'ping' },
    ],
  };

  const timeout = withTimeoutSignal(options.timeoutMs);
  try {
    const response = await fetch(`${normalizeBaseUrl(options.baseUrl)}/chat/completions`, {
      method: 'POST',
      signal: timeout.signal,
      headers: {
        authorization: `Bearer ${options.apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`chat probe failed: HTTP ${response.status} ${text.slice(0, 180)}`);
    }
  } finally {
    timeout.cancel();
  }
}

export function createOpenAICompatibleAdapter(
  options: OpenAICompatibleAdapterOptions,
): LLMAdapter {
  const normalizedOptions: OpenAICompatibleAdapterOptions = {
    baseUrl: normalizeBaseUrl(options.baseUrl),
    apiKey: options.apiKey.trim(),
    model: options.model.trim(),
    timeoutMs: Math.max(2_000, options.timeoutMs),
    temperature: clamp(options.temperature, 0, 1),
  };

  return {
    kind: 'openai-compatible',
    async enhanceInference(input: LLMEnhanceInput): Promise<LLMEnhanceOutput> {
      return callChatCompletion(normalizedOptions, input);
    },
    getResponsibilities() {
      return [...RESPONSIBILITIES];
    },
    async healthCheck(probe = false): Promise<LLMHealthReport> {
      const checkedAt = new Date().toISOString();
      if (!normalizedOptions.apiKey || !normalizedOptions.model || !normalizedOptions.baseUrl) {
        return {
          provider: 'openai-compatible',
          model: normalizedOptions.model || 'unknown',
          configured: false,
          reachable: false,
          message: 'LLM 配置不完整，请检查 LLM_API_KEY / LLM_MODEL / LLM_API_BASE_URL。',
          checkedAt,
        };
      }

      if (!probe) {
        return {
          provider: 'openai-compatible',
          model: normalizedOptions.model,
          configured: true,
          reachable: false,
          message: '配置已加载。可使用 ?probe=1 执行真实连通性探测。',
          checkedAt,
        };
      }

      try {
        await probeChatCompletion(normalizedOptions);

        return {
          provider: 'openai-compatible',
          model: normalizedOptions.model,
          configured: true,
          reachable: true,
          message: '大模型 API 探测成功，可用于推断增强。',
          checkedAt,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'unknown error';
        return {
          provider: 'openai-compatible',
          model: normalizedOptions.model,
          configured: true,
          reachable: false,
          message: `探测异常: ${message}`,
          checkedAt,
        };
      }
    },
  };
}
