import type { Page } from 'playwright';

export interface PageElementHint {
  selector: string;
  label: string;
  role: string;
}

export interface PageObservation {
  url: string;
  title: string;
  textSnippet: string;
  domExcerpt: string;
  elementHints: PageElementHint[];
}

export async function observePage(page: Page): Promise<PageObservation> {
  // Use string-based evaluation to avoid transpiled helper injection in browser context.
  const scriptText = `(() => {
    const globalObject = globalThis || {};
    const doc = globalObject.document || null;
    const cssEscape = (globalObject.CSS && typeof globalObject.CSS.escape === 'function')
      ? globalObject.CSS.escape.bind(globalObject.CSS)
      : (value) => String(value);

    const buildSelectorHint = (element) => {
      if (!element || typeof element.getAttribute !== 'function') {
        return null;
      }

      const tagName = String(element.tagName || '').toLowerCase() || 'div';
      const id = element.getAttribute('id');
      if (id) {
        return '#' + cssEscape(id);
      }

      const testId = element.getAttribute('data-testid');
      if (testId) {
        return '[data-testid="' + testId + '"]';
      }

      const name = element.getAttribute('name');
      if (name) {
        return tagName + '[name="' + name + '"]';
      }

      const ariaLabel = element.getAttribute('aria-label');
      if (ariaLabel) {
        return tagName + '[aria-label="' + ariaLabel + '"]';
      }

      const text = String(element.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 48);
      if (text) {
        return 'text=' + text;
      }

      return null;
    };

    const root = (doc && (doc.body || doc.documentElement)) || null;
    const rootText = String((root && root.innerText) || '').replace(/\\s+/g, ' ').trim();
    const textSnippet = rootText.slice(0, 500);
    const domExcerpt = String((root && root.outerHTML) || '').replace(/\\s+/g, ' ').slice(0, 1200);

    const rawNodes = doc && typeof doc.querySelectorAll === 'function'
      ? Array.from(doc.querySelectorAll('button,a,input,select,textarea,[role="button"],[tabindex],summary'))
      : [];
    const nodes = rawNodes.slice(0, 40);

    const elementHints = nodes
      .map((element) => {
        if (!element || typeof element.getAttribute !== 'function') {
          return null;
        }

        const role = element.getAttribute('role') ||
          (String(element.tagName || '').toLowerCase() === 'input'
            ? 'input'
            : String(element.tagName || '').toLowerCase());
        const label = String(
          element.getAttribute('aria-label') ||
          element.placeholder ||
          element.textContent ||
          element.value ||
          '',
        ).replace(/\\s+/g, ' ').trim().slice(0, 80);
        const selector = buildSelectorHint(element);
        if (!selector) {
          return null;
        }
        return {
          selector,
          label: label || selector,
          role,
        };
      })
      .filter((item) => item !== null);

    return {
      url: String((globalObject.location && globalObject.location.href) || '') || 'about:blank',
      title: String((doc && doc.title) || '') || 'Untitled',
      textSnippet,
      domExcerpt,
      elementHints,
    };
  })()`;

  return page.evaluate(scriptText);
}
