/** @vitest-environment node */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { collectSourceBundle } from '../domain/source-collector';

function jsonChatResponse(content: string): Response {
  return new Response(content, {
    status: 200,
    headers: {
      'content-type': 'text/plain',
    },
  });
}

describe('source-collector', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('collects target page + same-origin text code resources and records ignored binary/cross-origin artifacts', async () => {
    const html = `
      <html lang="zh-CN">
        <head>
          <title>Source Collector Demo</title>
          <link rel="stylesheet" href="/assets/app.css" />
          <script src="/assets/app.js"></script>
          <script src="https://cdn.example.net/remote.js"></script>
          <script src="/assets/logo.png"></script>
        </head>
        <body>
          <h1>Demo</h1>
          <script>window.__STATE__={"ok":true}</script>
          <script type="application/json">{"site":"demo"}</script>
        </body>
      </html>
    `;

    const fetchMock = vi.fn(async (input: URL | RequestInfo) => {
      const url = String(input);
      if (url === 'https://example.com/' || url === 'https://example.com') {
        return new Response(html, {
          status: 200,
          headers: { 'content-type': 'text/html; charset=utf-8' },
        });
      }
      if (url === 'https://example.com/assets/app.js') {
        return jsonChatResponse('export function boot(){return "ok"}');
      }
      if (url === 'https://example.com/assets/app.css') {
        return new Response('.root{display:flex}', {
          status: 200,
          headers: { 'content-type': 'text/css' },
        });
      }
      if (url === 'https://example.com/assets/logo.png') {
        return new Response('PNGDATA', {
          status: 200,
          headers: { 'content-type': 'image/png' },
        });
      }
      throw new Error(`unexpected url: ${url}`);
    });

    vi.stubGlobal('fetch', fetchMock);

    const bundle = await collectSourceBundle('https://example.com', {
      timeoutMs: 5_000,
      allowInsecureTls: false,
      sameOriginOnly: true,
      maxTotalBytes: 600_000,
    });

    expect(bundle.finalUrl).toBe('https://example.com/');
    expect(bundle.mainDocument.type).toBe('html');
    expect(bundle.artifacts.some((artifact) => artifact.type === 'javascript')).toBe(true);
    expect(bundle.artifacts.some((artifact) => artifact.type === 'css')).toBe(true);
    expect(bundle.artifacts.some((artifact) => artifact.type === 'inline-script')).toBe(true);
    expect(bundle.artifacts.some((artifact) => artifact.type === 'json')).toBe(true);
    expect(
      bundle.artifacts.some((artifact) => artifact.url.includes('cdn.example.net')),
    ).toBe(false);

    expect(
      bundle.stats.failedArtifacts.some(
        (item) =>
          item.url.includes('cdn.example.net') &&
          item.reason.includes('same-origin only'),
      ),
    ).toBe(true);
    expect(
      bundle.stats.failedArtifacts.some(
        (item) =>
          item.url.includes('/assets/logo.png') &&
          item.reason.includes('非文本代码资源'),
      ),
    ).toBe(true);
  });

  it('truncates oversized resources and records truncation reason', async () => {
    const html = `
      <html>
        <head>
          <title>Large Bundle</title>
          <script src="/assets/large.js"></script>
        </head>
        <body>ok</body>
      </html>
    `;
    const largeScript = 'const big = "x";\n'.repeat(6_000);

    const fetchMock = vi.fn(async (input: URL | RequestInfo) => {
      const url = String(input);
      if (url === 'https://example.com/' || url === 'https://example.com') {
        return new Response(html, {
          status: 200,
          headers: { 'content-type': 'text/html; charset=utf-8' },
        });
      }
      if (url === 'https://example.com/assets/large.js') {
        return jsonChatResponse(largeScript);
      }
      throw new Error(`unexpected url: ${url}`);
    });

    vi.stubGlobal('fetch', fetchMock);

    const bundle = await collectSourceBundle('https://example.com', {
      timeoutMs: 5_000,
      allowInsecureTls: false,
      sameOriginOnly: true,
      maxTotalBytes: 800,
    });

    expect(bundle.artifacts.length).toBeGreaterThan(0);
    expect(
      bundle.stats.failedArtifacts.some(
        (item) =>
          item.url.includes('/assets/large.js') &&
          (item.reason.includes('截断') ||
            item.reason.includes('SOURCE_COLLECT_MAX_TOTAL_BYTES')),
      ),
    ).toBe(true);
    expect(bundle.stats.totalBytes).toBeLessThanOrEqual(50_000);
  });
});
