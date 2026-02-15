import { load } from 'cheerio';
import { Agent } from 'undici';
import type { Dispatcher } from 'undici';
import type { DiagnosisItem } from '../types/domain';

const REQUEST_UA = 'UXAgent/1.0 (local-evaluator)';

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

    let response: Response;
    try {
      response = await fetch(normalizedUrl, init);
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
        response = await fetch(normalizedUrl, insecureInit);
      } finally {
        await insecureAgent.close();
      }
    }

    const html = await response.text();
    const loadTimeMs = Math.max(1, Date.now() - startedAt);
    const $ = load(html);
    const counts = buildCounts(html);

    return {
      normalizedUrl,
      finalUrl: response.url || normalizedUrl,
      statusCode: response.status,
      loadTimeMs,
      title: safeString($('title').first().text(), '未检测到标题'),
      htmlLang: safeString($('html').attr('lang'), 'unknown'),
      hasViewportMeta: $('meta[name="viewport"]').length > 0,
      hasMainLandmark: $('main').length > 0 || $('[role="main"]').length > 0,
      counts,
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
