import { load } from 'cheerio';
import { Agent } from 'undici';
import type { Dispatcher } from 'undici';
import type { DiagnosisItem, EvidenceRefItem } from '../types/domain';

const REQUEST_UA = 'UXAgent/1.0 (local-evaluator)';
const MAX_SCRIPT_SOURCES = 6;
const MAX_SCRIPT_CHARS = 120_000;

const CODE_CAPABILITY_PATTERNS: Array<{ label: string; patterns: RegExp[] }> = [
  { label: '账号登录与认证', patterns: [/login|sign[\s-]?in|signup|register|auth|oauth|password/i, /登录|注册|认证|密码|验证码/] },
  { label: '搜索与筛选', patterns: [/search|filter|sort|query/i, /搜索|筛选|排序|检索/] },
  { label: '导航与路由跳转', patterns: [/router|navigate|route|breadcrumb/i, /导航|路由|跳转|面包屑/] },
  { label: '表单提交与校验', patterns: [/submit|validate|form/i, /表单|提交|校验|必填/] },
  { label: '上传下载能力', patterns: [/upload|download|file|blob/i, /上传|下载|文件/] },
  { label: '支付与订单', patterns: [/checkout|payment|pay|order|invoice/i, /支付|订单|结算|发票/] },
  { label: '购物车与商品流程', patterns: [/cart|product|sku|inventory/i, /购物车|商品|库存/] },
  { label: '内容发布与编辑', patterns: [/editor|publish|article|post|markdown/i, /发布|编辑|内容|文章/] },
  { label: '报表与数据分析', patterns: [/dashboard|analytics|report|metric|chart/i, /报表|分析|指标|图表/] },
  { label: '通知与消息', patterns: [/notification|message|mail|alert/i, /通知|消息|邮件|提醒/] },
  { label: '多语言与本地化', patterns: [/locale|i18n|language|translate/i, /语言|本地化|翻译/] },
  { label: '客服与会话', patterns: [/chat|assistant|conversation|support/i, /客服|会话|对话|助手/] },
];

interface NodeFetchInit extends RequestInit {
  dispatcher?: Dispatcher;
}

export interface LiveUrlAnalysis {
  normalizedUrl: string;
  finalUrl: string;
  statusCode: number;
  loadTimeMs: number;
  title: string;
  htmlLang: string;
  hasViewportMeta: boolean;
  hasMainLandmark: boolean;
  counts: {
    links: number;
    buttons: number;
    inputs: number;
    forms: number;
    headings: number;
    images: number;
    imagesWithoutAlt: number;
    interactive: number;
  };
  featureHints: {
    headingsText: string[];
    primaryLinks: string[];
    primaryButtons: string[];
    primaryInputs: string[];
    bodyPreview: string;
    codeCapabilities: string[];
  };
  evidenceIndex: {
    dom: EvidenceRefItem[];
    interactions: EvidenceRefItem[];
    routesAndScripts: EvidenceRefItem[];
    text: EvidenceRefItem[];
  };
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

function safeString(value: string | undefined | null, fallback: string): string {
  const next = value?.trim();
  return next ? next : fallback;
}

function buildCounts(html: string): LiveUrlAnalysis['counts'] {
  const $ = load(html);

  const links = $('a[href]').length;
  const buttons = $('button, [role="button"]').length;
  const inputs = $('input, select, textarea').length;
  const forms = $('form').length;
  const headings = $('h1, h2, h3, h4, h5, h6').length;
  const images = $('img').length;
  const imagesWithoutAlt = $('img')
    .toArray()
    .filter((node) => !safeString($(node).attr('alt'), '')).length;

  return {
    links,
    buttons,
    inputs,
    forms,
    headings,
    images,
    imagesWithoutAlt,
    interactive: links + buttons + inputs,
  };
}

function normalizeText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function uniqueText(items: string[], limit: number): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const raw of items) {
    const value = normalizeText(raw);
    if (!value || seen.has(value)) {
      continue;
    }
    seen.add(value);
    result.push(value);
    if (result.length >= limit) {
      break;
    }
  }

  return result;
}

function createEvidenceRef(
  source: EvidenceRefItem['source'],
  typeKey: string,
  index: number,
  label: string,
  excerpt?: string,
): EvidenceRefItem {
  const normalizedLabel = normalizeText(label);
  const normalizedExcerpt = normalizeText(excerpt ?? label);
  return {
    // Keep refId short and stable so LLM output is less likely to truncate it.
    refId: `${source}:${typeKey}-${index + 1}`,
    source,
    label: normalizedLabel || `${typeKey}-${index + 1}`,
    excerpt: normalizedExcerpt || normalizedLabel || `${typeKey}-${index + 1}`,
  };
}

function splitTextEvidence(text: string, limit = 8): string[] {
  return uniqueText(
    text
      .split(/(?<=[。！？.!?])\s+|\n+/)
      .map((part) => part.trim())
      .filter((part) => part.length >= 12),
    limit,
  );
}

function normalizeScriptSrc(raw: string, baseUrl: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed || trimmed.startsWith('data:') || trimmed.startsWith('blob:') || trimmed.startsWith('javascript:')) {
    return null;
  }
  try {
    const resolved = new URL(trimmed, baseUrl);
    if (resolved.protocol !== 'http:' && resolved.protocol !== 'https:') {
      return null;
    }
    return resolved.toString();
  } catch {
    return null;
  }
}

function extractScriptUrls(html: string, baseUrl: string): string[] {
  const $ = load(html);
  const baseHost = new URL(baseUrl).host;
  const urls: string[] = [];

  $('script[src]')
    .toArray()
    .forEach((node) => {
      const src = $(node).attr('src');
      if (!src) {
        return;
      }
      const normalized = normalizeScriptSrc(src, baseUrl);
      if (!normalized) {
        return;
      }
      try {
        if (new URL(normalized).host !== baseHost) {
          return;
        }
      } catch {
        return;
      }
      urls.push(normalized);
    });

  return uniqueText(urls, MAX_SCRIPT_SOURCES);
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
      const insecureInit: NodeFetchInit = {
        ...init,
        dispatcher: insecureAgent,
      };
      return await fetch(url, insecureInit);
    } finally {
      await insecureAgent.close();
    }
  }
}

function hasUsefulCodeContentType(contentType: string): boolean {
  const lowered = contentType.toLowerCase();
  return (
    lowered.includes('javascript') ||
    lowered.includes('json') ||
    lowered.includes('text/plain') ||
    lowered.includes('application/octet-stream')
  );
}

async function fetchScriptSnippets(
  scriptUrls: string[],
  timeoutMs: number,
  allowInsecureTls: boolean,
): Promise<string[]> {
  const externalScripts: string[] = [];

  for (const scriptUrl of scriptUrls) {
    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(),
      Math.max(1_500, Math.min(6_000, Math.floor(timeoutMs / 2))),
    );

    try {
      const response = await fetchWithTlsFallback(
        scriptUrl,
        {
          method: 'GET',
          redirect: 'follow',
          signal: controller.signal,
          headers: {
            'user-agent': REQUEST_UA,
            accept: 'application/javascript,text/javascript,text/plain,*/*',
          },
        },
        allowInsecureTls,
      );

      if (!response.ok) {
        continue;
      }

      const contentType = response.headers.get('content-type') ?? '';
      if (contentType && !hasUsefulCodeContentType(contentType)) {
        continue;
      }

      const text = await response.text();
      const snippet = text.slice(0, MAX_SCRIPT_CHARS);
      if (snippet.trim().length > 0) {
        externalScripts.push(snippet);
      }
    } catch {
      // Ignore individual script fetch failures and continue.
    } finally {
      clearTimeout(timer);
    }
  }

  return externalScripts;
}

function countRegexMatches(source: string, pattern: RegExp): number {
  const flags = pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`;
  const matcher = new RegExp(pattern.source, flags);
  const matches = source.match(matcher);
  return matches?.length ?? 0;
}

function extractRouteCapabilities(scriptSource: string): string[] {
  const ignoredRoots = new Set([
    'api',
    'v1',
    'v2',
    'assets',
    'static',
    'js',
    'css',
    'img',
    'images',
    'fonts',
    'public',
    'cdn',
  ]);

  const frequency = new Map<string, number>();
  const routeMatcher = /['"`](\/[a-z0-9][a-z0-9/_-]{2,40})['"`]/gi;

  for (const match of scriptSource.matchAll(routeMatcher)) {
    const rawRoute = match[1] ?? '';
    const firstSegment = rawRoute
      .split('?')[0]
      .split('#')[0]
      .split('/')
      .filter(Boolean)[0];

    if (!firstSegment) {
      continue;
    }

    const normalized = firstSegment.toLowerCase();
    if (ignoredRoots.has(normalized) || /^\d+$/.test(normalized) || normalized.length <= 1) {
      continue;
    }

    frequency.set(normalized, (frequency.get(normalized) ?? 0) + 1);
  }

  return [...frequency.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, 6)
    .map(([segment]) => `路由能力:${segment}`);
}

function extractCodeCapabilities(
  html: string,
  scriptUrls: string[],
  scriptSnippets: string[],
): string[] {
  const visibleSource = html.toLowerCase();
  const urlSource = scriptUrls.join('\n').toLowerCase();
  const scriptSource = scriptSnippets.join('\n').toLowerCase();

  if (!visibleSource.trim() && !urlSource.trim() && !scriptSource.trim()) {
    return [];
  }

  const routeCapabilities = extractRouteCapabilities(scriptSource);
  const scored: Array<{ label: string; score: number }> = [];
  for (const matcher of CODE_CAPABILITY_PATTERNS) {
    let visibleHits = 0;
    let urlHits = 0;
    let scriptHits = 0;

    for (const pattern of matcher.patterns) {
      visibleHits += countRegexMatches(visibleSource, pattern);
      urlHits += countRegexMatches(urlSource, pattern);
      scriptHits += countRegexMatches(scriptSource, pattern);
    }

    const score = visibleHits * 4 + urlHits * 2 + scriptHits;
    if (visibleHits > 0 || urlHits > 0 || scriptHits >= 8) {
      scored.push({ label: matcher.label, score });
    }
  }

  scored.sort((left, right) => right.score - left.score);
  return uniqueText(
    [
      ...routeCapabilities,
      ...scored.map((item) => item.label),
    ],
    12,
  );
}

function buildFeatureHints(
  html: string,
  codeCapabilities: string[],
): LiveUrlAnalysis['featureHints'] {
  const $ = load(html);
  const headingsText = uniqueText(
    $('h1, h2, h3')
      .toArray()
      .map((node) => $(node).text()),
    12,
  );
  const primaryLinks = uniqueText(
    $('a[href]')
      .toArray()
      .map((node) => $(node).text()),
    16,
  );
  const primaryButtons = uniqueText(
    $('button, [role="button"], input[type="button"], input[type="submit"]')
      .toArray()
      .map((node) => $(node).text() || $(node).attr('value') || $(node).attr('aria-label') || ''),
    16,
  );
  const primaryInputs = uniqueText(
    $('input, textarea, select')
      .toArray()
      .map((node) =>
        $(node).attr('placeholder') ||
        $(node).attr('name') ||
        $(node).attr('aria-label') ||
        $(node).attr('id') ||
        '',
      ),
    16,
  );
  const bodyPreview = normalizeText($('body').text()).slice(0, 1200);

  return {
    headingsText,
    primaryLinks,
    primaryButtons,
    primaryInputs,
    bodyPreview,
    codeCapabilities,
  };
}

function buildEvidenceIndex(
  title: string,
  hints: LiveUrlAnalysis['featureHints'],
  scriptUrls: string[],
): LiveUrlAnalysis['evidenceIndex'] {
  const dom: EvidenceRefItem[] = [
    createEvidenceRef('dom', 'title', 0, '页面标题', title),
    ...hints.headingsText.map((heading, index) =>
      createEvidenceRef('dom', 'heading', index, `标题:${heading}`, heading),
    ),
  ];

  const interactions: EvidenceRefItem[] = [
    ...hints.primaryButtons.map((button, index) =>
      createEvidenceRef('interaction', 'button', index, `按钮:${button}`, button),
    ),
    ...hints.primaryInputs.map((input, index) =>
      createEvidenceRef('interaction', 'input', index, `输入:${input}`, input),
    ),
    ...hints.primaryLinks.map((link, index) =>
      createEvidenceRef('interaction', 'link', index, `链接:${link}`, link),
    ),
  ];

  const routesAndScripts: EvidenceRefItem[] = [
    ...hints.codeCapabilities.map((capability, index) =>
      createEvidenceRef('route-script', 'capability', index, capability, capability),
    ),
    ...scriptUrls.map((url, index) =>
      createEvidenceRef('route-script', 'script', index, `脚本:${url}`, url),
    ),
  ];

  const text: EvidenceRefItem[] = splitTextEvidence(hints.bodyPreview).map((snippet, index) =>
    createEvidenceRef('text', 'body', index, `正文片段${index + 1}`, snippet),
  );

  return {
    dom: dom.slice(0, 12),
    interactions: interactions.slice(0, 24),
    routesAndScripts: routesAndScripts.slice(0, 24),
    text: text.slice(0, 12),
  };
}

export async function inspectLiveUrl(
  targetUrl: string,
  timeoutMs: number,
  allowInsecureTls = true,
): Promise<LiveUrlAnalysis> {
  const normalizedUrl = normalizeTargetUrl(targetUrl);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Math.max(2_000, timeoutMs));
  const startedAt = Date.now();

  try {
    const init: NodeFetchInit = {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'user-agent': REQUEST_UA,
        accept: 'text/html,application/xhtml+xml',
      },
    };

    const response = await fetchWithTlsFallback(normalizedUrl, init, allowInsecureTls);

    const html = await response.text();
    const loadTimeMs = Math.max(1, Date.now() - startedAt);
    const $ = load(html);
    const counts = buildCounts(html);
    const inlineScripts = uniqueText(
      $('script:not([src])')
        .toArray()
        .map((node) => ($(node).html() ?? '').slice(0, MAX_SCRIPT_CHARS)),
      MAX_SCRIPT_SOURCES,
    );
    const scriptUrls = extractScriptUrls(html, response.url || normalizedUrl);
    const externalScriptSnippets = await fetchScriptSnippets(
      scriptUrls,
      timeoutMs,
      allowInsecureTls,
    );
    const codeCapabilities = extractCodeCapabilities(
      html,
      scriptUrls,
      [...inlineScripts, ...externalScriptSnippets],
    );
    const featureHints = buildFeatureHints(html, codeCapabilities);
    const pageTitle = safeString($('title').first().text(), '未检测到标题');
    const evidenceIndex = buildEvidenceIndex(pageTitle, featureHints, scriptUrls);

    return {
      normalizedUrl,
      finalUrl: response.url || normalizedUrl,
      statusCode: response.status,
      loadTimeMs,
      title: pageTitle,
      htmlLang: safeString($('html').attr('lang'), 'unknown'),
      hasViewportMeta: $('meta[name="viewport"]').length > 0,
      hasMainLandmark: $('main').length > 0 || $('[role="main"]').length > 0,
      counts,
      featureHints,
      evidenceIndex,
    };
  } finally {
    clearTimeout(timeout);
  }
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

function buildInteractiveStatus(analysis: LiveUrlAnalysis): DiagnosisItem {
  const { interactive, buttons, inputs } = analysis.counts;
  const status = interactive >= 8 ? 'success' : interactive >= 3 ? 'warning' : 'error';

  return {
    dimension: '交互元素覆盖',
    status,
    description: `检测到 ${interactive} 个交互元素（按钮 ${buttons}、输入 ${inputs}）。`,
  };
}

function buildA11yStatus(analysis: LiveUrlAnalysis): DiagnosisItem {
  const { images, imagesWithoutAlt } = analysis.counts;
  if (images === 0) {
    return {
      dimension: '无障碍性 (a11y)',
      status: 'success',
      description: '未检测到图片资源，暂未发现 alt 缺失风险。',
    };
  }

  const ratio = imagesWithoutAlt / images;
  if (ratio > 0.4) {
    return {
      dimension: '无障碍性 (a11y)',
      status: 'error',
      description: `图片共 ${images} 张，缺少 alt 的图片 ${imagesWithoutAlt} 张，建议补全无障碍说明。`,
    };
  }

  if (ratio > 0.1) {
    return {
      dimension: '无障碍性 (a11y)',
      status: 'warning',
      description: `图片共 ${images} 张，其中 ${imagesWithoutAlt} 张缺少 alt，建议优先补全关键图。`,
    };
  }

  return {
    dimension: '无障碍性 (a11y)',
    status: 'success',
    description: `图片共 ${images} 张，alt 覆盖率良好。`,
  };
}

function buildStructureStatus(analysis: LiveUrlAnalysis): DiagnosisItem {
  const { headings, forms } = analysis.counts;
  const hasStrongStructure = analysis.hasMainLandmark && headings >= 3;

  return {
    dimension: '信息结构',
    status: hasStrongStructure ? 'success' : headings > 0 ? 'warning' : 'error',
    description: hasStrongStructure
      ? `检测到主语义区与 ${headings} 个标题节点，结构层级清晰。`
      : `主语义区${analysis.hasMainLandmark ? '已' : '未'}检测到，标题节点 ${headings}，表单 ${forms}。`,
  };
}

function buildPerformanceStatus(analysis: LiveUrlAnalysis): DiagnosisItem {
  const status =
    analysis.loadTimeMs <= 2000 ? 'success' : analysis.loadTimeMs <= 4500 ? 'warning' : 'error';

  return {
    dimension: '加载性能初检',
    status,
    description: `服务端抓取耗时约 ${analysis.loadTimeMs}ms（状态码 ${analysis.statusCode}）。`,
  };
}

function buildCompatibilityStatus(analysis: LiveUrlAnalysis): DiagnosisItem {
  const status = analysis.hasViewportMeta ? 'success' : 'warning';

  return {
    dimension: '基础兼容性',
    status,
    description: analysis.hasViewportMeta
      ? `检测到 viewport 配置，标题为「${analysis.title}」。`
      : `未检测到 viewport，移动端适配可能受限。页面标题为「${analysis.title}」。`,
  };
}

export function buildLiveDiagnosis(analysis: LiveUrlAnalysis): DiagnosisItem[] {
  return [
    {
      dimension: '页面可访问性',
      status: analysis.statusCode < 400 ? 'success' : 'error',
      description: `目标页面可访问，最终地址 ${analysis.finalUrl}，语言标记 ${analysis.htmlLang}。`,
    },
    buildPerformanceStatus(analysis),
    buildStructureStatus(analysis),
    buildInteractiveStatus(analysis),
    buildA11yStatus(analysis),
    buildCompatibilityStatus(analysis),
  ];
}
