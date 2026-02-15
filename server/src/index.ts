import 'dotenv/config';
import { loadEnv } from './config/env';
import { createOpenAICompatibleAdapter } from './llm/openai-compatible-adapter';
import { mockLLMAdapter } from './llm/mock-llm-adapter';
import { RunStore } from './store/run-store';
import { createApp } from './app';

async function bootstrap(): Promise<void> {
  const env = loadEnv();
  const llmAdapter =
    env.llmProvider === 'openai-compatible'
      ? createOpenAICompatibleAdapter({
          baseUrl: env.llmApiBaseUrl,
          apiKey: env.llmApiKey,
          model: env.llmModel,
          timeoutMs: env.llmTimeoutMs,
          temperature: env.llmTemperature,
        })
      : mockLLMAdapter;

  const runStore = new RunStore({
    ttlMs: env.runTtlMs,
    maxSize: env.runCacheSize,
    cleanupIntervalMs: env.runCleanupIntervalMs,
  });

  const app = await createApp({
    env,
    runStore,
    llmAdapter,
  });

  const close = async () => {
    runStore.close();
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
