import fs from 'fs';

const cache = new Map<string, string>();

export function loadPromptFromEnv(envVar: string, fallback: string): string {
  const key = envVar;
  if (cache.has(key)) {
    return cache.get(key) as string;
  }
  const p = process.env[envVar];
  if (p && typeof p === 'string' && p.trim().length > 0) {
    try {
      const txt = fs.readFileSync(p, 'utf8');
      const content = txt.replace(/^\uFEFF/, '');
      cache.set(key, content);
      return content;
    } catch {
      cache.set(key, fallback);
      return fallback;
    }
  }
  cache.set(key, fallback);
  return fallback;
}
