export interface EnvConfig {
  apiPort: number;
  runTtlMs: number;
  runCacheSize: number;
  runCleanupIntervalMs: number;
  corsOrigin: string;
  evaluationMode: 'mock' | 'real' | 'auto';
  evaluatorTimeoutMs: number;
  evaluatorAllowInsecureTls: boolean;
  llmProvider: 'mock' | 'openai-compatible';
  llmApiBaseUrl: string;
  llmApiKey: string;
  llmModel: string;
  llmTimeoutMs: number;
  llmTemperature: number;
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

export function loadEnv(): EnvConfig {
  const evaluationModeRaw = readString('EVALUATION_MODE', 'auto');
  const evaluationMode =
    evaluationModeRaw === 'mock' || evaluationModeRaw === 'real' || evaluationModeRaw === 'auto'
      ? evaluationModeRaw
      : 'auto';

  const llmProviderRaw = readString('LLM_PROVIDER', 'mock');
  const llmProvider = llmProviderRaw === 'openai-compatible' ? 'openai-compatible' : 'mock';

  return {
    apiPort: readNumber('API_PORT', 8787, 1, 65535),
    runTtlMs: readNumber('RUN_TTL_MS', 2 * 60 * 60 * 1000, 30_000, 24 * 60 * 60 * 1000),
    runCacheSize: readNumber('RUN_CACHE_SIZE', 200, 1, 10_000),
    runCleanupIntervalMs: readNumber('RUN_CLEANUP_INTERVAL_MS', 10 * 60 * 1000, 10_000, 60 * 60 * 1000),
    corsOrigin: readString('CORS_ORIGIN', '*'),
    evaluationMode,
    evaluatorTimeoutMs: readNumber('EVALUATOR_TIMEOUT_MS', 30_000, 2_000, 120_000),
    evaluatorAllowInsecureTls: readBoolean('EVALUATOR_ALLOW_INSECURE_TLS', true),
    llmProvider,
    llmApiBaseUrl: readString('LLM_API_BASE_URL', 'https://api.openai.com/v1'),
    llmApiKey: readString('LLM_API_KEY', ''),
    llmModel: readString('LLM_MODEL', 'gpt-4o-mini'),
    llmTimeoutMs: readNumber('LLM_TIMEOUT_MS', 20_000, 2_000, 120_000),
    llmTemperature: readFloat('LLM_TEMPERATURE', 0.2, 0, 1),
  };
}
