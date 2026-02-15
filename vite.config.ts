/// <reference types="vitest/config" />
import path from 'path';
import react from '@vitejs/plugin-react';
import { inspectAttr } from 'kimi-plugin-inspect-react';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, path.resolve(__dirname), '');
  const enableKimiInspect = (env.VITE_ENABLE_KIMI_INSPECT ?? 'true').toLowerCase() !== 'false';

  return {
    base: './',
    plugins: [...(enableKimiInspect ? [inspectAttr()] : []), react()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    test: {
      environment: 'jsdom',
      css: true,
      globals: false,
      setupFiles: ['./src/test/setup.ts'],
      exclude: ['**/node_modules/**', '**/dist/**', '**/server/dist/**'],
    },
  };
});
