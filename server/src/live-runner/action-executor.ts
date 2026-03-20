import type { Page } from 'playwright';
import type { LiveExecutionAction } from '../types/domain';

export interface ActionExecutionResult {
  ok: boolean;
  message: string;
  urlAfter: string;
}

async function resolveLocator(page: Page, selector: string) {
  if (selector.startsWith('text=')) {
    const text = selector.slice('text='.length);
    return page.getByText(text, { exact: false }).first();
  }
  return page.locator(selector).first();
}

export async function executeAction(
  page: Page,
  action: LiveExecutionAction,
  timeoutMs: number,
): Promise<ActionExecutionResult> {
  const defaultTimeout = Math.max(500, timeoutMs);

  try {
    switch (action.type) {
      case 'click': {
        if (!action.selector) {
          throw new Error('click 缺少 selector');
        }
        const locator = await resolveLocator(page, action.selector);
        await locator.click({ timeout: defaultTimeout });
        return { ok: true, message: `已点击 ${action.selector}`, urlAfter: page.url() };
      }
      case 'type': {
        if (!action.selector) {
          throw new Error('type 缺少 selector');
        }
        const locator = await resolveLocator(page, action.selector);
        await locator.fill(action.text ?? '', { timeout: defaultTimeout });
        return { ok: true, message: `已输入到 ${action.selector}`, urlAfter: page.url() };
      }
      case 'select': {
        if (!action.selector) {
          throw new Error('select 缺少 selector');
        }
        const locator = await resolveLocator(page, action.selector);
        await locator.selectOption(action.optionValue ?? action.text ?? '', { timeout: defaultTimeout });
        return { ok: true, message: `已选择 ${action.optionValue ?? action.text ?? ''}`, urlAfter: page.url() };
      }
      case 'wait': {
        await page.waitForTimeout(Math.max(100, Math.min(action.waitMs ?? 1000, 20_000)));
        return { ok: true, message: '等待完成', urlAfter: page.url() };
      }
      case 'scroll': {
        const delta = action.direction === 'up' ? -540 : 540;
        await page.evaluate(`(() => { window.scrollBy({ top: ${delta}, behavior: 'smooth' }); })()`);
        await page.waitForTimeout(350);
        return { ok: true, message: `已滚动${action.direction === 'up' ? '向上' : '向下'}`, urlAfter: page.url() };
      }
      case 'assert': {
        const expected = (action.expected ?? '').trim();
        if (!expected) {
          throw new Error('assert 缺少 expected');
        }
        const content = await page.content();
        const ok = content.includes(expected);
        return {
          ok,
          message: ok ? `断言成功：找到 ${expected}` : `断言失败：未找到 ${expected}`,
          urlAfter: page.url(),
        };
      }
      case 'finish': {
        return { ok: true, message: action.reason ?? '任务完成', urlAfter: page.url() };
      }
      case 'fail': {
        return { ok: false, message: action.reason ?? '任务失败', urlAfter: page.url() };
      }
      default: {
        return { ok: false, message: '未知动作类型', urlAfter: page.url() };
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : '执行动作失败';
    return {
      ok: false,
      message,
      urlAfter: page.url(),
    };
  }
}
