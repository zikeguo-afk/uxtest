import 'dotenv/config';
import { loadEnv } from './config/env';
import { createOpenAICompatibleAdapter } from './llm/openai-compatible-adapter';
import type { LLMAdapter } from './llm/adapter';
import { mockLLMAdapter } from './llm/mock-llm-adapter';
import { LiveExecutionJobRunner } from './live-runner/job-runner';
import { ExecutionJobStore } from './store/execution-job-store';
import { RunStore } from './store/run-store';
import { createApp } from './app';

function buildAdapter(input: {
  provider: 'mock' | 'openai-compatible';
  baseUrl: string;
  apiKey: string;
  model: string;
  timeoutMs: number;
  temperature: number;
  stageRetryCount: number;
  jsonRepairCount: number;
}): LLMAdapter {
  if (input.provider === 'openai-compatible') {
    return createOpenAICompatibleAdapter({
      baseUrl: input.baseUrl,
      apiKey: input.apiKey,
      model: input.model,
      timeoutMs: input.timeoutMs,
      temperature: input.temperature,
      stageRetryCount: input.stageRetryCount,
      jsonRepairCount: input.jsonRepairCount,
    });
  }

  return mockLLMAdapter;
}

async function bootstrap(): Promise<void> {
  const env = loadEnv();
  const llmAdapter = buildAdapter({
    provider: env.llmProvider,
    baseUrl: env.llmApiBaseUrl,
    apiKey: env.llmApiKey,
    model: env.llmModel,
    timeoutMs: env.llmTimeoutMs,
    temperature: env.llmTemperature,
    stageRetryCount: env.llmStageRetryCount,
    jsonRepairCount: env.llmJsonRepairCount,
  });
  const executionLlmAdapter =
    env.llmExecutionProvider === 'inherit' || !env.llmExecutionProvider
      ? llmAdapter
      : buildAdapter({
          provider: env.llmExecutionProvider,
          baseUrl: env.llmExecutionApiBaseUrl?.trim() || env.llmApiBaseUrl,
          apiKey: env.llmExecutionApiKey?.trim() || env.llmApiKey,
          model: env.llmExecutionModel?.trim() || env.llmModel,
          timeoutMs: env.llmExecutionTimeoutMs ?? env.llmTimeoutMs,
          temperature: env.llmExecutionTemperature ?? env.llmTemperature,
          stageRetryCount: env.llmExecutionStageRetryCount ?? env.llmStageRetryCount,
          jsonRepairCount: env.llmExecutionJsonRepairCount ?? env.llmJsonRepairCount,
        });

  const runStore = new RunStore({
    ttlMs: env.runTtlMs,
    maxSize: env.runCacheSize,
    cleanupIntervalMs: env.runCleanupIntervalMs,
  });
  const executionJobStore = new ExecutionJobStore({
    ttlMs: env.executionJobTtlMs,
    maxSize: env.executionJobCacheSize,
    cleanupIntervalMs: env.executionJobCleanupIntervalMs,
  });
  const liveExecutionJobRunner = new LiveExecutionJobRunner(
    runStore,
    executionJobStore,
    executionLlmAdapter,
    {
      enabled: env.liveRunnerEnabled,
      headless: env.playwrightHeadless,
      concurrency: env.playwrightConcurrency,
      maxSteps: env.caseMaxSteps,
      caseTimeoutMs: env.caseTimeoutMs,
      stepTimeoutMs: env.stepTimeoutMs,
      screenshotEnabled: env.liveRunnerScreenshotEnabled,
      artifactRootDir: env.liveRunnerArtifactDir,
    },
  );

  const app = await createApp({
    env,
    runStore,
    executionJobStore,
    liveExecutionJobRunner,
    llmAdapter,
    executionLlmAdapter,
  });

  const close = async () => {
    runStore.close();
    executionJobStore.close();
    await app.close();
  };

  process.on('SIGINT', () => {
    void close().then(() => process.exit(0));
  });
  process.on('SIGTERM', () => {
    void close().then(() => process.exit(0));
  });

  await app.listen({
    port: env.apiPort,
    host: '0.0.0.0',
  });

  console.info(`[api] UXAgent backend is listening on http://localhost:${env.apiPort}`);
}

void bootstrap();
