import { chromium } from 'playwright';
import type { Browser, BrowserContext, Page } from 'playwright';

export interface BrowserSessionOptions {
  headless: boolean;
  timeoutMs: number;
}

export interface BrowserSession {
  browser: Browser;
  context: BrowserContext;
  page: Page;
  close: () => Promise<void>;
}

export async function createBrowserSession(
  url: string,
  options: BrowserSessionOptions,
): Promise<BrowserSession> {
  const browser = await chromium.launch({
    headless: options.headless,
  });

  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    locale: 'zh-CN',
    timezoneId: 'Asia/Shanghai',
  });

  const page = await context.newPage();
  page.setDefaultTimeout(options.timeoutMs);
  page.setDefaultNavigationTimeout(options.timeoutMs);
  await page.goto(url, { waitUntil: 'domcontentloaded' });

  return {
    browser,
    context,
    page,
    async close() {
      await context.close();
      await browser.close();
    },
  };
}
