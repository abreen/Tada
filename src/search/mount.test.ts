import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { JSDOM } from 'jsdom';
import { createGlobals } from '../globals.test';
import mountSearch, { resetPagefindForTest } from './index';
import { deferred, flushMicrotasks } from '../../test-helpers';

type MockPagefindResult = {
  meta?: {
    title?: string;
    title_html?: string;
    page?: string;
    template?: string;
  };
  url: string;
  excerpt?: string;
  score: number;
  sub_results?: Array<{ title?: string; url: string; excerpt?: string }>;
};

type MockSearchResponse = {
  results: Array<{ data(): Promise<MockPagefindResult> }>;
};

const pagefind: {
  init(): Promise<void>;
  search(query: string): Promise<MockSearchResponse>;
} = { init: async () => {}, search: async () => ({ results: [] }) };

function resetPagefind() {
  pagefind.init = mock(async () => {});
  pagefind.search = mock(async () => ({ results: [] }));
}

function mockGlobals(overrides: Partial<import('../globals').Globals> = {}) {
  mock.module('../globals', () => ({
    globals: createGlobals({
      fetch: mock(async () => ({ ok: false }) as Response),
      importModule: async () => pagefind,
      ...overrides,
    }),
  }));
}

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

async function flush() {
  await flushMicrotasks(20);
}

function searchResult(title: string, url: string) {
  return {
    async data(): Promise<MockPagefindResult> {
      return { meta: { title }, url, excerpt: '', score: 1, sub_results: [] };
    },
  };
}

beforeEach(() => {
  resetPagefindForTest();
  resetPagefind();
  mockGlobals();
});

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

  test('ignores stale results when older searches resolve last', async () => {
    const firstSearch = deferred<MockSearchResponse>();
    const secondSearch = deferred<MockSearchResponse>();
    pagefind.search = mock((query: string) => {
      if (query === 'a') {
        return firstSearch.promise;
      }
      if (query === 'ab') {
        return secondSearch.promise;
      }
      return Promise.resolve({ results: [] });
    });

    const win = create();
    const cleanup = mountSearch(win);
    await flush();

    const input = win.document.querySelector(
      'input.quick-search',
    ) as HTMLInputElement;

    input.value = 'a';
    input.dispatchEvent(new win.Event('input', { bubbles: true }));
    input.value = 'ab';
    input.dispatchEvent(new win.Event('input', { bubbles: true }));

    secondSearch.resolve({
      results: [searchResult('Newer result', '/newer/')],
    });
    await flush();

    const resultTitle = () =>
      win.document.querySelector('a.result .title')?.textContent;
    expect(resultTitle()).toBe('Newer result');

    firstSearch.resolve({ results: [searchResult('Older result', '/older/')] });
    await flush();

    expect(resultTitle()).toBe('Newer result');
    expect(win.document.querySelector('a.result')?.getAttribute('href')).toBe(
      '/newer/',
    );

    cleanup!();
  });

  test('preserves visible results while pagefind reload is in progress', async () => {
    const initialEntryLoaded = deferred<void>();
    const reloadImport = deferred<typeof pagefind>();
    const reloadStarted = deferred<void>();
    let importCount = 0;
    pagefind.search = mock(async (query: string) => {
      if (query === 'a') {
        return { results: [searchResult('Existing result', '/existing/')] };
      }
      if (query === 'ab') {
        return { results: [searchResult('Updated result', '/updated/')] };
      }
      return { results: [] };
    });

    mockGlobals({
      fetch: mock(async (input, init) => {
        const url = String(input);
        if (url.endsWith('/pagefind/pagefind-entry.json')) {
          if (init?.method === 'HEAD') {
            return {
              ok: true,
              headers: {
                get(name: string) {
                  return name.toLowerCase() === 'etag' ? '"v2"' : null;
                },
              },
            } as Response;
          }
          if (importCount === 1) {
            initialEntryLoaded.resolve();
          }
          return {
            ok: true,
            headers: {
              get(name: string) {
                return name.toLowerCase() === 'etag'
                  ? importCount >= 2
                    ? '"v2"'
                    : '"v1"'
                  : null;
              },
            },
          } as Response;
        }
        return { ok: false } as Response;
      }),
      now: () => 4000,
      importModule: async () => {
        importCount += 1;
        if (importCount === 1) {
          return pagefind;
        }
        reloadStarted.resolve();
        return reloadImport.promise;
      },
    });

    const win = create();
    const cleanup = mountSearch(win);
    await initialEntryLoaded.promise;
    await flush();

    const input = win.document.querySelector(
      'input.quick-search',
    ) as HTMLInputElement;

    input.value = 'a';
    input.dispatchEvent(new win.Event('input', { bubbles: true }));
    await flush();

    const resultTitle = () =>
      win.document.querySelector('a.result .title')?.textContent;
    const resultsCount = () =>
      win.document.querySelector('.results-count')?.textContent;

    expect(resultTitle()).toBe('Existing result');
    expect(resultsCount()).toBe('One result');

    input.dispatchEvent(focusEvent(win.document, 'focus', { bubbles: true }));
    await reloadStarted.promise;
    await flush();

    input.value = 'ab';
    input.dispatchEvent(new win.Event('input', { bubbles: true }));
    await flush();

    expect(resultTitle()).toBe('Existing result');
    expect(resultsCount()).toBe('One result');

    reloadImport.resolve(pagefind);
    await flush();

    expect(resultTitle()).toBe('Updated result');
    expect(win.document.querySelector('a.result')?.getAttribute('href')).toBe(
      '/updated/',
    );
    expect(resultsCount()).toBe('One result');

    cleanup!();
  });

  test('ignores old-index search results after a newer index is detected', async () => {
    const initialEntryLoaded = deferred<void>();
    const headResponse = deferred<Response>();
    const oldSearch = deferred<MockSearchResponse>();
    const reloadImport = deferred<typeof pagefind>();
    const reloadStarted = deferred<void>();
    let importCount = 0;

    pagefind.search = mock(async (query: string) => {
      if (query === 'a') {
        return { results: [searchResult('Existing result', '/existing/')] };
      }
      if (query === 'ab') {
        return oldSearch.promise;
      }
      return { results: [] };
    });

    const reloadedPagefind = {
      init: mock(async () => {}),
      search: mock(async (query: string) => {
        if (query === 'ab') {
          return { results: [searchResult('Updated result', '/updated/')] };
        }
        return { results: [] };
      }),
    };

    mockGlobals({
      fetch: mock(async (input, init) => {
        const url = String(input);
        if (url.endsWith('/pagefind/pagefind-entry.json')) {
          if (init?.method === 'HEAD') {
            return headResponse.promise;
          }
          if (importCount === 1) {
            initialEntryLoaded.resolve();
          }
          return {
            ok: true,
            headers: {
              get(name: string) {
                return name.toLowerCase() === 'etag'
                  ? importCount >= 2
                    ? '"v2"'
                    : '"v1"'
                  : null;
              },
            },
          } as Response;
        }
        return { ok: false } as Response;
      }),
      now: () => 4000,
      importModule: async () => {
        importCount += 1;
        if (importCount === 1) {
          return pagefind;
        }
        reloadStarted.resolve();
        return reloadImport.promise;
      },
    });

    const win = create();
    const cleanup = mountSearch(win);
    await initialEntryLoaded.promise;
    await flush();

    const input = win.document.querySelector(
      'input.quick-search',
    ) as HTMLInputElement;

    const resultTitle = () =>
      win.document.querySelector('a.result .title')?.textContent;
    const resultHref = () =>
      win.document.querySelector('a.result')?.getAttribute('href');
    const resultsCount = () =>
      win.document.querySelector('.results-count')?.textContent;

    input.value = 'a';
    input.dispatchEvent(new win.Event('input', { bubbles: true }));
    await flush();

    expect(resultTitle()).toBe('Existing result');
    expect(resultHref()).toBe('/existing/');
    expect(resultsCount()).toBe('One result');

    input.dispatchEvent(focusEvent(win.document, 'focus', { bubbles: true }));

    input.value = 'ab';
    input.dispatchEvent(new win.Event('input', { bubbles: true }));
    await flush();

    expect(resultTitle()).toBe('Existing result');
    expect(resultHref()).toBe('/existing/');
    expect(resultsCount()).toBe('Loading\u2026');

    headResponse.resolve({
      ok: true,
      headers: {
        get(name: string) {
          return name.toLowerCase() === 'etag' ? '"v2"' : null;
        },
      },
    } as Response);
    await reloadStarted.promise;
    await flush();

    oldSearch.resolve({ results: [searchResult('Stale result', '/stale/')] });
    await flush();

    expect(resultTitle()).toBe('Existing result');
    expect(resultHref()).toBe('/existing/');
    expect(resultsCount()).toBe('Loading\u2026');

    reloadImport.resolve(reloadedPagefind);
    await flush();

    expect(resultTitle()).toBe('Updated result');
    expect(resultHref()).toBe('/updated/');
    expect(resultsCount()).toBe('One result');

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
