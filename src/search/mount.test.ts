import { describe, expect, test, beforeAll } from 'bun:test';
import { JSDOM } from 'jsdom';
import mountSearch from './index';

beforeAll(() => {
  (globalThis as Record<string, unknown>).__SITE_BASE_PATH__ = '/';
  (globalThis as Record<string, unknown>).__SITE_TITLE_POSTFIX__ = '';
});

const SEARCH_HTML = `
<header>
  <input class="quick-search" name="search" type="text" />
  <div class="results-container" aria-hidden="true" inert>
    <div class="results" style="display: none"></div>
  </div>
</header>
`;

function create(html = SEARCH_HTML) {
  const dom = new JSDOM(`<body>${html}</body>`, { url: 'http://localhost/' });
  return dom.window;
}

// jsdom's DOMWindow doesn't expose FocusEvent on its typed interface,
// but it exists at runtime. Use document.defaultView to access it.
function focusEvent(
  doc: Document,
  type: string,
  init?: FocusEventInit,
): FocusEvent {
  const FE = (doc.defaultView as unknown as Record<string, unknown>)[
    'FocusEvent'
  ] as typeof FocusEvent;
  return new FE(type, init);
}

describe('search mount', () => {
  test('returns early when no quick-search input exists', () => {
    const win = create('<div>no search</div>');
    const cleanup = mountSearch(win);
    expect(cleanup).toBeUndefined();
  });

  test('returns a cleanup function when input exists', () => {
    const win = create();
    const cleanup = mountSearch(win);
    expect(typeof cleanup).toBe('function');
    cleanup!();
  });

  test('unhides results div on mount', () => {
    const win = create();
    mountSearch(win);

    const resultsDiv = win.document.querySelector('.results') as HTMLElement;
    expect(resultsDiv.style.display).toBe('');
  });

  test('pressing / focuses the search input', () => {
    const win = create();
    const cleanup = mountSearch(win);

    const input = win.document.querySelector(
      'input.quick-search',
    ) as HTMLInputElement;
    let focused = false;
    input.focus = () => {
      focused = true;
    };

    const event = new win.KeyboardEvent('keydown', { key: '/', bubbles: true });
    win.dispatchEvent(event);

    expect(focused).toBe(true);
    cleanup!();
  });

  test('/ key does not focus input when target is an INPUT', () => {
    const win = create();
    const cleanup = mountSearch(win);

    const input = win.document.querySelector(
      'input.quick-search',
    ) as HTMLInputElement;
    let focused = false;
    input.focus = () => {
      focused = true;
    };

    const event = new win.KeyboardEvent('keydown', { key: '/', bubbles: true });
    Object.defineProperty(event, 'target', { value: input });
    win.dispatchEvent(event);

    expect(focused).toBe(false);
    cleanup!();
  });

  test('window keydown adds is-typing class', () => {
    const win = create();
    const cleanup = mountSearch(win);

    const container = win.document.querySelector(
      '.results-container',
    ) as HTMLElement;

    win.dispatchEvent(
      new win.KeyboardEvent('keydown', { key: 'a', bubbles: true }),
    );
    expect(container.classList.contains('is-typing')).toBe(true);

    cleanup!();
  });

  test('window pointermove removes is-typing class', () => {
    const win = create();
    const cleanup = mountSearch(win);

    const container = win.document.querySelector(
      '.results-container',
    ) as HTMLElement;

    container.classList.add('is-typing');
    win.dispatchEvent(new win.Event('pointermove', { bubbles: true }));
    expect(container.classList.contains('is-typing')).toBe(false);

    cleanup!();
  });

  test('focus on input shows results', () => {
    const win = create();
    const cleanup = mountSearch(win);

    const input = win.document.querySelector(
      'input.quick-search',
    ) as HTMLInputElement;
    const container = win.document.querySelector(
      '.results-container',
    ) as HTMLElement;

    input.dispatchEvent(focusEvent(win.document, 'focus', { bubbles: true }));

    expect(container.classList.contains('is-showing')).toBe(true);

    cleanup!();
  });

  test('escape hides results when showing', () => {
    const win = create();
    const cleanup = mountSearch(win);

    const input = win.document.querySelector(
      'input.quick-search',
    ) as HTMLInputElement;
    const container = win.document.querySelector(
      '.results-container',
    ) as HTMLElement;

    input.dispatchEvent(focusEvent(win.document, 'focus', { bubbles: true }));
    expect(container.classList.contains('is-showing')).toBe(true);

    input.dispatchEvent(
      new win.KeyboardEvent('keydown', {
        key: 'Escape',
        bubbles: true,
        cancelable: true,
      }),
    );
    expect(container.classList.contains('is-showing')).toBe(false);

    cleanup!();
  });

  test('blur hides results when relatedTarget is outside', () => {
    const win = create();
    const cleanup = mountSearch(win);

    const input = win.document.querySelector(
      'input.quick-search',
    ) as HTMLInputElement;
    const container = win.document.querySelector(
      '.results-container',
    ) as HTMLElement;

    input.dispatchEvent(focusEvent(win.document, 'focus', { bubbles: true }));
    expect(container.classList.contains('is-showing')).toBe(true);

    const outside = win.document.createElement('div');
    win.document.body.appendChild(outside);
    input.dispatchEvent(
      focusEvent(win.document, 'blur', {
        relatedTarget: outside,
        bubbles: true,
      }),
    );

    expect(container.classList.contains('is-showing')).toBe(false);

    cleanup!();
  });

  test('blur does not hide when relatedTarget is inside results', () => {
    const win = create();
    const cleanup = mountSearch(win);

    const input = win.document.querySelector(
      'input.quick-search',
    ) as HTMLInputElement;
    const container = win.document.querySelector(
      '.results-container',
    ) as HTMLElement;

    input.dispatchEvent(focusEvent(win.document, 'focus', { bubbles: true }));

    const insideEl = win.document.createElement('a');
    container.appendChild(insideEl);

    input.dispatchEvent(
      focusEvent(win.document, 'blur', {
        relatedTarget: insideEl,
        bubbles: true,
      }),
    );

    expect(container.classList.contains('is-showing')).toBe(true);

    cleanup!();
  });

  test('pointerdown outside search hides results', () => {
    const win = create();
    const cleanup = mountSearch(win);

    const input = win.document.querySelector(
      'input.quick-search',
    ) as HTMLInputElement;
    const container = win.document.querySelector(
      '.results-container',
    ) as HTMLElement;

    input.dispatchEvent(focusEvent(win.document, 'focus', { bubbles: true }));
    expect(container.classList.contains('is-showing')).toBe(true);

    const pointerDown = new win.Event('pointerdown', { bubbles: true });
    Object.defineProperty(pointerDown, 'target', { value: win.document.body });
    win.dispatchEvent(pointerDown);

    expect(container.classList.contains('is-showing')).toBe(false);
    cleanup!();
  });

  test('input event with empty value hides results', () => {
    const win = create();
    const cleanup = mountSearch(win);

    const input = win.document.querySelector(
      'input.quick-search',
    ) as HTMLInputElement;
    const container = win.document.querySelector(
      '.results-container',
    ) as HTMLElement;

    input.dispatchEvent(focusEvent(win.document, 'focus', { bubbles: true }));
    input.value = 'test';
    input.dispatchEvent(new win.Event('input', { bubbles: true }));

    input.value = '';
    input.dispatchEvent(new win.Event('input', { bubbles: true }));

    expect(container.classList.contains('is-showing')).toBe(false);
    cleanup!();
  });

  test('click inside results hides and resets pointer state', () => {
    const win = create();
    const cleanup = mountSearch(win);

    const input = win.document.querySelector(
      'input.quick-search',
    ) as HTMLInputElement;
    const container = win.document.querySelector(
      '.results-container',
    ) as HTMLElement;

    input.dispatchEvent(focusEvent(win.document, 'focus', { bubbles: true }));
    expect(container.classList.contains('is-showing')).toBe(true);

    container.dispatchEvent(new win.Event('click', { bubbles: true }));

    expect(container.classList.contains('is-showing')).toBe(false);
    cleanup!();
  });

  test('renders loading state on focus', () => {
    const win = create();
    const cleanup = mountSearch(win);

    const input = win.document.querySelector(
      'input.quick-search',
    ) as HTMLInputElement;

    input.dispatchEvent(focusEvent(win.document, 'focus', { bubbles: true }));

    const countSpan = win.document.querySelector('.results-count');
    expect(countSpan).not.toBeNull();
    expect(countSpan!.textContent).toBe('Loading\u2026');

    cleanup!();
  });

  test('cleanup removes window-level listeners', () => {
    const win = create();
    const cleanup = mountSearch(win);

    const container = win.document.querySelector(
      '.results-container',
    ) as HTMLElement;

    cleanup!();

    container.classList.remove('is-typing');
    win.dispatchEvent(
      new win.KeyboardEvent('keydown', { key: 'a', bubbles: true }),
    );
    expect(container.classList.contains('is-typing')).toBe(false);
  });
});
