import { createHash } from 'node:crypto';
import { load } from 'cheerio';
import { Agent } from 'undici';
import type { Dispatcher } from 'undici';
import type { CollectedSourceArtifact, CollectedSourceBundle, CollectedSourceFailure } from '../types/domain';

const REQUEST_UA = 'UXAgent/1.0 (source-collector)';
const MAIN_DOC_ARTIFACT_ID = 'artifact-main-document';

interface NodeFetchInit extends RequestInit {
  dispatcher?: Dispatcher;
}

export interface SourceCollectOptions {
  timeoutMs: number;
  allowInsecureTls: boolean;
  sameOriginOnly: boolean;
  maxTotalBytes: number;
}

function getErrorCode(error: unknown): string {
  if (!(error instanceof Error) || typeof error.cause !== 'object' || error.cause === null) {
    return '';
  }
  if (!('code' in error.cause)) {
    return '';
  }
  return String((error.cause as { code?: unknown }).code ?? '').trim();
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    const code = getErrorCode(error);
    return code ? `${error.message} (${code})` : error.message;
  }
  return 'unknown error';
}

function normalizeTargetUrl(raw: string): string {
  const value = raw.trim();
  if (!value) {
    throw new Error('目标 URL 不能为空');
  }

  const prefixed = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  const parsed = new URL(prefixed);
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('仅支持 http/https 协议');
  }
  return parsed.toString();
}

function normalizeText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function hashContent(content: string): string {
  return createHash('sha256').update(content).digest('hex').slice(0, 16);
}

function isTlsCertificateError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  const knownCodes = [
    'UNABLE_TO_GET_ISSUER_CERT_LOCALLY',
    'DEPTH_ZERO_SELF_SIGNED_CERT',
    'SELF_SIGNED_CERT_IN_CHAIN',
    'CERT_HAS_EXPIRED',
  ];
  const causeCode =
    typeof error.cause === 'object' && error.cause !== null && 'code' in error.cause
      ? String((error.cause as { code?: unknown }).code ?? '')
      : '';
  const text = `${error.message} ${causeCode}`.toUpperCase();
  return knownCodes.some((code) => text.includes(code));
}

function isRetriableFetchError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const causeCode = getErrorCode(error).toUpperCase();
  const retriableCodes = new Set([
    'ETIMEDOUT',
    'ESOCKETTIMEDOUT',
    'ECONNRESET',
    'ECONNREFUSED',
    'EAI_AGAIN',
    'ENOTFOUND',
    'UND_ERR_CONNECT_TIMEOUT',
    'UND_ERR_HEADERS_TIMEOUT',
    'UND_ERR_SOCKET',
  ]);
  if (retriableCodes.has(causeCode)) {
    return true;
  }

  const message = error.message.toLowerCase();
  return (
    message.includes('fetch failed') ||
    message.includes('network') ||
    message.includes('socket') ||
    message.includes('timeout') ||
    message.includes('temporarily unavailable')
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, Math.max(0, ms));
  });
}

async function fetchWithTlsFallback(
  url: string,
  init: NodeFetchInit,
  allowInsecureTls: boolean,
): Promise<Response> {
  try {
    return await fetch(url, init);
  } catch (error) {
    if (!allowInsecureTls || !isTlsCertificateError(error)) {
      throw error;
    }

    const insecureAgent = new Agent({
      connect: {
        rejectUnauthorized: false,
      },
    });
    try {
      return await fetch(url, { ...init, dispatcher: insecureAgent });
    } finally {
      await insecureAgent.close();
    }
  }
}

async function fetchWithRetry(
  url: string,
  init: NodeFetchInit,
  allowInsecureTls: boolean,
  options: { maxAttempts?: number; backoffMs?: number } = {},
): Promise<Response> {
  const maxAttempts = Math.max(1, options.maxAttempts ?? 3);
  const backoffMs = Math.max(0, options.backoffMs ?? 300);
  const attemptErrors: string[] = [];

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await fetchWithTlsFallback(url, init, allowInsecureTls);
    } catch (error) {
      attemptErrors.push(`第${attempt}次: ${getErrorMessage(error)}`);
      if (attempt >= maxAttempts || !isRetriableFetchError(error)) {
        break;
      }
      await sleep(backoffMs * attempt);
    }
  }

  if (/^https:\/\//i.test(url)) {
    const httpUrl = `http://${url.slice('https://'.length)}`;
    try {
      return await fetchWithTlsFallback(httpUrl, init, allowInsecureTls);
    } catch (error) {
      attemptErrors.push(`HTTP回退: ${getErrorMessage(error)}`);
    }
  }

  throw new Error(`网络抓取失败：${attemptErrors.join('；') || '未知网络错误'}`);
}

function looksTextualContentType(contentType: string): boolean {
  const lowered = contentType.toLowerCase();
  return (
    lowered.includes('javascript') ||
    lowered.includes('json') ||
    lowered.includes('css') ||
    lowered.includes('html') ||
    lowered.includes('xml') ||
    lowered.includes('text/plain')
  );
}

function inferArtifactType(url: string, contentType: string): CollectedSourceArtifact['type'] {
  const loweredType = contentType.toLowerCase();
  const loweredUrl = url.toLowerCase();
  if (loweredType.includes('css') || loweredUrl.endsWith('.css')) {
    return 'css';
  }
  if (loweredType.includes('json') || loweredUrl.endsWith('.json')) {
    return 'json';
  }
  if (
    loweredType.includes('javascript') ||
    loweredUrl.endsWith('.js') ||
    loweredUrl.includes('.js?')
  ) {
    return 'javascript';
  }
  return 'text';
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function normalizeResourceUrl(raw: string, baseUrl: string): string | null {
  const value = raw.trim();
  if (!value || value.startsWith('data:') || value.startsWith('blob:') || value.startsWith('javascript:')) {
    return null;
  }
  try {
    const resolved = new URL(value, baseUrl);
    if (resolved.protocol !== 'http:' && resolved.protocol !== 'https:') {
      return null;
    }
    return resolved.toString();
  } catch {
    return null;
  }
}

function collectExternalResourceUrls(html: string, finalUrl: string): string[] {
  const $ = load(html);
  const scriptUrls = $('script[src]')
    .toArray()
    .map((node) => $(node).attr('src') ?? '')
    .map((src) => normalizeResourceUrl(src, finalUrl))
    .filter((url): url is string => Boolean(url));

  const stylesheetUrls = $('link[rel="stylesheet"][href],link[rel="preload"][as="style"][href],link[rel="preload"][as="script"][href]')
    .toArray()
    .map((node) => $(node).attr('href') ?? '')
    .map((href) => normalizeResourceUrl(href, finalUrl))
    .filter((url): url is string => Boolean(url));

  return unique([...scriptUrls, ...stylesheetUrls]);
}

function collectInlineArtifacts(html: string): Array<{ type: CollectedSourceArtifact['type']; content: string }> {
  const $ = load(html);
  const scripts = $('script:not([src])')
    .toArray()
    .map((node) => normalizeText($(node).html() ?? ''))
    .filter((content) => content.length > 0);

  const jsonScripts = $('script[type="application/json"],script[type="application/ld+json"]')
    .toArray()
    .map((node) => normalizeText($(node).html() ?? ''))
    .filter((content) => content.length > 0);

  return [
    ...scripts.map((content) => ({ type: 'inline-script' as const, content })),
    ...jsonScripts.map((content) => ({ type: 'json' as const, content })),
  ];
}

function buildFailedArtifact(url: string, reason: string): CollectedSourceFailure {
  return {
    url,
    reason: normalizeText(reason) || 'unknown error',
  };
}

export async function collectSourceBundle(
  targetUrl: string,
  options: SourceCollectOptions,
): Promise<CollectedSourceBundle> {
  const startedAt = Date.now();
  const normalizedUrl = normalizeTargetUrl(targetUrl);
  const failures: CollectedSourceFailure[] = [];

  const mainController = new AbortController();
  const mainTimer = setTimeout(
    () => mainController.abort(),
    Math.max(2_000, options.timeoutMs),
  );

  let mainResponse: Response;
  try {
    mainResponse = await fetchWithRetry(
      normalizedUrl,
      {
        method: 'GET',
        redirect: 'follow',
        signal: mainController.signal,
        headers: {
          'user-agent': REQUEST_UA,
          accept: 'text/html,application/xhtml+xml,text/plain,*/*',
          'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8',
        },
      },
      options.allowInsecureTls,
      {
        maxAttempts: 3,
        backoffMs: 350,
      },
    );
  } finally {
    clearTimeout(mainTimer);
  }

  const mainHtml = await mainResponse.text();
  const finalUrl = mainResponse.url || normalizedUrl;
  const finalHost = new URL(finalUrl).host;
  const mainBytes = Buffer.byteLength(mainHtml, 'utf8');
  const maxTotalBytes = Math.max(50_000, options.maxTotalBytes);
  let remainingBytes = Math.max(0, maxTotalBytes - mainBytes);

  const artifacts: CollectedSourceArtifact[] = [];
  const externalUrls = collectExternalResourceUrls(mainHtml, finalUrl);
  const inlineArtifacts = collectInlineArtifacts(mainHtml);

  let artifactIndex = 0;

  for (const item of inlineArtifacts) {
    artifactIndex += 1;
    const content = item.content.slice(0, Math.max(0, remainingBytes));
    const bytes = Buffer.byteLength(content, 'utf8');
    remainingBytes = Math.max(0, remainingBytes - bytes);
    artifacts.push({
      artifactId: `artifact-inline-${artifactIndex}`,
      url: `inline://${item.type}/${artifactIndex}`,
      type: item.type,
      content,
      hash: hashContent(content),
      bytes,
      status: 'fetched',
    });
    if (remainingBytes <= 0) {
      failures.push(buildFailedArtifact('inline://remaining', '超出 SOURCE_COLLECT_MAX_TOTAL_BYTES，后续资源已跳过'));
      break;
    }
  }

  for (const resourceUrl of externalUrls) {
    if (remainingBytes <= 0) {
      break;
    }
    try {
      const resourceHost = new URL(resourceUrl).host;
      if (options.sameOriginOnly && resourceHost !== finalHost) {
        failures.push(buildFailedArtifact(resourceUrl, '跨域资源已跳过（same-origin only）'));
        continue;
      }

      const controller = new AbortController();
      const timer = setTimeout(
        () => controller.abort(),
        Math.max(1_500, Math.min(options.timeoutMs, 10_000)),
      );
      let response: Response;
      try {
        response = await fetchWithRetry(
          resourceUrl,
          {
            method: 'GET',
            redirect: 'follow',
            signal: controller.signal,
            headers: {
              'user-agent': REQUEST_UA,
              accept: 'application/javascript,text/css,application/json,text/plain,*/*',
              'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8',
            },
          },
          options.allowInsecureTls,
          {
            maxAttempts: 2,
            backoffMs: 200,
          },
        );
      } finally {
        clearTimeout(timer);
      }

      if (!response.ok) {
        failures.push(buildFailedArtifact(resourceUrl, `HTTP ${response.status}`));
        continue;
      }

      const contentType = response.headers.get('content-type') ?? '';
      if (contentType && !looksTextualContentType(contentType)) {
        failures.push(buildFailedArtifact(resourceUrl, `非文本代码资源，content-type=${contentType}`));
        continue;
      }

      let content = await response.text();
      if (content.length === 0) {
        failures.push(buildFailedArtifact(resourceUrl, '资源为空'));
        continue;
      }

      const contentBytes = Buffer.byteLength(content, 'utf8');
      if (contentBytes > remainingBytes) {
        const ratio = remainingBytes <= 0 ? 0 : remainingBytes / contentBytes;
        const safeLength = Math.max(0, Math.floor(content.length * ratio));
        content = content.slice(0, safeLength);
        failures.push(buildFailedArtifact(resourceUrl, '资源被截断（超出总字节上限）'));
      }

      const bytes = Buffer.byteLength(content, 'utf8');
      if (bytes === 0) {
        continue;
      }
      remainingBytes = Math.max(0, remainingBytes - bytes);
      artifactIndex += 1;
      artifacts.push({
        artifactId: `artifact-${artifactIndex}`,
        url: resourceUrl,
        type: inferArtifactType(resourceUrl, contentType),
        content,
        hash: hashContent(content),
        bytes,
        status: 'fetched',
      });
    } catch (error) {
      const message = getErrorMessage(error);
      failures.push(buildFailedArtifact(resourceUrl, message));
    }
  }

  const totalBytes = mainBytes + artifacts.reduce((sum, artifact) => sum + artifact.bytes, 0);
  const durationMs = Math.max(1, Date.now() - startedAt);

  return {
    targetUrl: normalizedUrl,
    finalUrl,
    mainDocument: {
      artifactId: MAIN_DOC_ARTIFACT_ID,
      url: finalUrl,
      type: 'html',
      content: mainHtml,
      hash: hashContent(mainHtml),
      bytes: mainBytes,
      status: 'fetched',
    },
    artifacts,
    stats: {
      artifactCount: artifacts.length + 1,
      totalBytes,
      durationMs,
      failedArtifacts: failures,
    },
  };
}
