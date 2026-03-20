export interface EnvConfig {
  apiPort: number;
  runTtlMs: number;
  runCacheSize: number;
  runCleanupIntervalMs: number;
  executionJobTtlMs: number;
  executionJobCacheSize: number;
  executionJobCleanupIntervalMs: number;
  corsOrigin: string;
  evaluationMode: 'mock' | 'real' | 'auto';
  evaluatorTimeoutMs: number;
  evaluatorAllowInsecureTls: boolean;
  liveRunnerEnabled: boolean;
  playwrightHeadless: boolean;
  playwrightConcurrency: number;
  caseMaxSteps: number;
  caseTimeoutMs: number;
  stepTimeoutMs: number;
  liveRunnerScreenshotEnabled: boolean;
  liveRunnerArtifactDir: string;
  llmProvider: 'mock' | 'openai-compatible';
  llmApiBaseUrl: string;
  llmApiKey: string;
  llmModel: string;
  llmTimeoutMs: number;
  llmTemperature: number;
  llmExecutionProvider?: 'inherit' | 'mock' | 'openai-compatible';
  llmExecutionApiBaseUrl?: string;
  llmExecutionApiKey?: string;
  llmExecutionModel?: string;
  llmExecutionTimeoutMs?: number;
  llmExecutionTemperature?: number;
  llmExecutionStageRetryCount?: number;
  llmExecutionJsonRepairCount?: number;
  llmStageRetryCount: number;
  llmJsonRepairCount: number;
  llmChunkTokenBudget: number;
  diagnosisPipelineMode: 'legacy' | 'llm-4stage';
  sourceCollectSameOriginOnly: boolean;
  sourceCollectMaxTotalBytes: number;
  diagnosisStrictTasks: boolean;
  diagnosisTaskBlacklist: string[];
}

function readNumber(name: string, fallback: number, min: number, max: number): number {
  const raw = process.env[name];
  if (!raw) {
    return fallback;
  }

  const value = Number(raw);
  if (!Number.isFinite(value)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, Math.floor(value)));
}

function readString(name: string, fallback: string): string {
  const raw = process.env[name];
  if (!raw) {
    return fallback;
  }
  return raw;
}

function readBoolean(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (!raw) {
    return fallback;
  }

  return ['1', 'true', 'yes', 'on'].includes(raw.trim().toLowerCase());
}

function readFloat(name: string, fallback: number, min: number, max: number): number {
  const raw = process.env[name];
  if (!raw) {
    return fallback;
  }

  const value = Number(raw);
  if (!Number.isFinite(value)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, value));
}

function readStringList(name: string, fallback: string[]): string[] {
  const raw = process.env[name];
  if (!raw) {
    return fallback;
  }

  const parsed = raw
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);

  return parsed.length > 0 ? parsed : fallback;
}

export function loadEnv(): EnvConfig {
  const evaluationModeRaw = readString('EVALUATION_MODE', 'auto');
  const evaluationMode =
    evaluationModeRaw === 'mock' || evaluationModeRaw === 'real' || evaluationModeRaw === 'auto'
      ? evaluationModeRaw
      : 'auto';

  const llmProviderRaw = readString('LLM_PROVIDER', 'mock');
  const llmProvider = llmProviderRaw === 'openai-compatible' ? 'openai-compatible' : 'mock';
  const llmExecutionProviderRaw = readString('LLM_EXEC_PROVIDER', 'inherit');
  const llmExecutionProvider =
    llmExecutionProviderRaw === 'openai-compatible' ||
    llmExecutionProviderRaw === 'mock' ||
    llmExecutionProviderRaw === 'inherit'
      ? llmExecutionProviderRaw
      : 'inherit';
  const diagnosisPipelineModeRaw = readString('DIAGNOSIS_PIPELINE_MODE', 'llm-4stage');
  const diagnosisPipelineMode =
    diagnosisPipelineModeRaw === 'legacy' || diagnosisPipelineModeRaw === 'llm-4stage'
      ? diagnosisPipelineModeRaw
      : 'llm-4stage';

  return {
    apiPort: readNumber('API_PORT', 8787, 1, 65535),
    runTtlMs: readNumber('RUN_TTL_MS', 2 * 60 * 60 * 1000, 30_000, 24 * 60 * 60 * 1000),
    runCacheSize: readNumber('RUN_CACHE_SIZE', 200, 1, 10_000),
    runCleanupIntervalMs: readNumber('RUN_CLEANUP_INTERVAL_MS', 10 * 60 * 1000, 10_000, 60 * 60 * 1000),
    executionJobTtlMs: readNumber(
      'EXECUTION_JOB_TTL_MS',
      2 * 60 * 60 * 1000,
      30_000,
      24 * 60 * 60 * 1000,
    ),
    executionJobCacheSize: readNumber('EXECUTION_JOB_CACHE_SIZE', 200, 10, 5_000),
    executionJobCleanupIntervalMs: readNumber(
      'EXECUTION_JOB_CLEANUP_INTERVAL_MS',
      10 * 60 * 1000,
      10_000,
      60 * 60 * 1000,
    ),
    corsOrigin: readString('CORS_ORIGIN', '*'),
    evaluationMode,
    evaluatorTimeoutMs: readNumber('EVALUATOR_TIMEOUT_MS', 30_000, 2_000, 120_000),
    evaluatorAllowInsecureTls: readBoolean('EVALUATOR_ALLOW_INSECURE_TLS', true),
    liveRunnerEnabled: readBoolean('LIVE_RUNNER_ENABLED', true),
    playwrightHeadless: readBoolean('PLAYWRIGHT_HEADLESS', true),
    playwrightConcurrency: readNumber('PLAYWRIGHT_CONCURRENCY', 2, 1, 6),
    caseMaxSteps: readNumber('CASE_MAX_STEPS', 12, 3, 30),
    caseTimeoutMs: readNumber('CASE_TIMEOUT_MS', 90_000, 10_000, 600_000),
    stepTimeoutMs: readNumber('STEP_TIMEOUT_MS', 10_000, 1_000, 120_000),
    liveRunnerScreenshotEnabled: readBoolean('LIVE_RUNNER_SCREENSHOT_ENABLED', true),
    liveRunnerArtifactDir: readString('LIVE_RUNNER_ARTIFACT_DIR', 'server/.artifacts/live-runs'),
    llmProvider,
    llmApiBaseUrl: readString('LLM_API_BASE_URL', 'https://api.openai.com/v1'),
    llmApiKey: readString('LLM_API_KEY', ''),
    llmModel: readString('LLM_MODEL', 'gpt-4o-mini'),
    llmTimeoutMs: readNumber('LLM_TIMEOUT_MS', 20_000, 2_000, 600_000),
    llmTemperature: readFloat('LLM_TEMPERATURE', 0.2, 0, 1),
    llmExecutionProvider,
    llmExecutionApiBaseUrl: readString('LLM_EXEC_API_BASE_URL', ''),
    llmExecutionApiKey: readString('LLM_EXEC_API_KEY', ''),
    llmExecutionModel: readString('LLM_EXEC_MODEL', ''),
    llmExecutionTimeoutMs: readNumber('LLM_EXEC_TIMEOUT_MS', 20_000, 2_000, 600_000),
    llmExecutionTemperature: readFloat('LLM_EXEC_TEMPERATURE', 0.2, 0, 1),
    llmExecutionStageRetryCount: readNumber('LLM_EXEC_STAGE_RETRY_COUNT', 2, 0, 5),
    llmExecutionJsonRepairCount: readNumber('LLM_EXEC_JSON_REPAIR_COUNT', 1, 0, 3),
    llmStageRetryCount: readNumber('LLM_STAGE_RETRY_COUNT', 2, 0, 5),
    llmJsonRepairCount: readNumber('LLM_JSON_REPAIR_COUNT', 1, 0, 3),
    llmChunkTokenBudget: readNumber('LLM_CHUNK_TOKEN_BUDGET', 1_600, 400, 8_000),
    diagnosisPipelineMode,
    sourceCollectSameOriginOnly: readBoolean('SOURCE_COLLECT_SAME_ORIGIN_ONLY', true),
    sourceCollectMaxTotalBytes: readNumber('SOURCE_COLLECT_MAX_TOTAL_BYTES', 2_500_000, 200_000, 20_000_000),
    diagnosisStrictTasks: readBoolean('DIAGNOSIS_STRICT_TASKS', true),
    diagnosisTaskBlacklist: readStringList('DIAGNOSIS_TASK_BLACKLIST', [
      '购物车',
      '结账',
      '优惠券',
      '下单',
      '收货地址',
      'SKU',
      '订单',
      '支付',
    ]),
  };
}
