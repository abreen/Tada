import { describe, expect, test, beforeEach, mock } from 'bun:test';
import * as jsdom from 'jsdom';
import { createGlobals } from '../globals.test';

// Mock the lifecycle module so we can track calls
const mockTeardown = mock(() => {});
const mockMount = mock(async () => mockTeardown);
mock.module('./lifecycle', () => ({
  mountPerPageComponents: mockMount,
  teardownPerPageComponents: mockTeardown,
}));

import mount from './index';

// JSDOM's DOMWindow is structurally compatible with Window. We cast once
// in createDOM and use this alias everywhere else so the rest of the file
// is free of explicit casts.
type Win = Window & typeof globalThis;
type VirtualConsoleLike = {
  on: (event: 'jsdomError', handler: (error: Error) => void) => void;
};

const GENERATOR = 'Tada 1.11.1';
const JSDOM_NAVIGATION_WARNING =
  'Not implemented: navigation (except hash changes)';
const { JSDOM } = jsdom;
const VirtualConsoleCtor = (
  jsdom as typeof jsdom & { VirtualConsole: new () => VirtualConsoleLike }
).VirtualConsole;

function mockGlobals(overrides: Partial<import('../globals').Globals> = {}) {
  mock.module('../globals', () => ({ globals: createGlobals(overrides) }));
}

beforeEach(() => {
  mockGlobals();
  mockTeardown.mockClear();
  mockMount.mockClear();
});

function createDOM(
  bodyContent = '',
  options?: {
    url?: string;
    headContent?: string;
    bodyClass?: string;
    searchValue?: string;
  },
): Win {
  const url = options?.url ?? 'http://localhost/';
  const headContent =
    options?.headContent ??
    `<title>Page One</title><meta name="generator" content="${GENERATOR}"><meta name="description" content="desc one">`;
  const bodyClass = options?.bodyClass ?? 'default toc-is-active';
  const searchVal = options?.searchValue ?? '';
  const html = `<html><head>${headContent}</head><body class="${bodyClass}"><header><input class="search quick-search" value="${searchVal}"><details><summary>Menu</summary><nav></nav></details></header><div class="container">${bodyContent}</div></body></html>`;
  const virtualConsole = new VirtualConsoleCtor();
  virtualConsole.on('jsdomError', (error: Error) => {
    if (error.message !== JSDOM_NAVIGATION_WARNING) {
      console.error(error);
    }
  });
  const dom = new JSDOM(html, { url, pretendToBeVisual: true, virtualConsole });
  return dom.window as unknown as Win;
}

function createPageHTML(options?: {
  title?: string;
  bodyClass?: string;
  containerContent?: string;
  description?: string;
  author?: string;
  ogTitle?: string;
  ogAuthor?: string;
  stylesheets?: string[];
  noGenerator?: boolean;
  generator?: string;
}) {
  const o = {
    title: 'Page Two',
    bodyClass: 'post',
    containerContent: '<p>New content</p>',
    ...options,
  };
  const gen = o.noGenerator
    ? ''
    : `<meta name="generator" content="${o.generator ?? GENERATOR}">`;
  const desc =
    o.description !== undefined
      ? `<meta name="description" content="${o.description}">`
      : '';
  const auth =
    o.author !== undefined ? `<meta name="author" content="${o.author}">` : '';
  const ogT =
    o.ogTitle !== undefined
      ? `<meta property="og:title" content="${o.ogTitle}">`
      : '';
  const ogA =
    o.ogAuthor !== undefined
      ? `<meta property="og:author" content="${o.ogAuthor}">`
      : '';
  const links = (o.stylesheets ?? [])
    .map(h => `<link rel="stylesheet" href="${h}">`)
    .join('');
  return `<html><head><title>${o.title}</title>${gen}${desc}${auth}${ogT}${ogA}${links}</head><body class="${o.bodyClass}"><div class="container">${o.containerContent}</div></body></html>`;
}

function htmlResponse(html: string, ok = true): Response {
  return new Response(html, { status: ok ? 200 : 404 });
}

async function flush(): Promise<void> {
  for (let i = 0; i < 10; i++) {
    await new Promise(r => setTimeout(r, 0));
  }
}

function setupGlobals(win: Win) {
  const scrollToMock = mock(() => {});
  Object.defineProperty(win, 'scrollTo', {
    value: scrollToMock,
    configurable: true,
  });
  return scrollToMock;
}

function mockFetchReturning(
  html: string,
  ok = true,
  overrides: Partial<import('../globals').Globals> = {},
) {
  mockGlobals({
    fetch: mock(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      htmlResponse(html, ok),
    ),
    ...overrides,
  });
}

function clickLink(win: Win, selector = 'a') {
  const link = win.document.querySelector(selector) as HTMLElement;
  const event = new win.MouseEvent('click', {
    bubbles: true,
    cancelable: true,
  });
  link.dispatchEvent(event);
  return event;
}

function dispatchPopState(win: Win, state: Record<string, unknown>) {
  win.dispatchEvent(new win.PopStateEvent('popstate', { state }));
}

describe('navigate', () => {
  test('mount returns a cleanup function', () => {
    const win = createDOM();
    const cleanup = mount(win);
    expect(typeof cleanup).toBe('function');
  });

  test('cleanup removes event listeners without throwing', () => {
    const win = createDOM();
    const cleanup = mount(win);
    cleanup!();
  });

  test('sets scrollRestoration to manual', () => {
    const win = createDOM();
    mount(win);
    expect(win.history.scrollRestoration).toBe('manual');
  });

  test('ignores clicks with ctrlKey', () => {
    const win = createDOM('<a href="http://localhost/other">Link</a>');
    mount(win);
    const link = win.document.querySelector('a')!;
    const event = new win.MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      ctrlKey: true,
    });
    link.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
  });

  test('ignores clicks with metaKey', () => {
    const win = createDOM('<a href="http://localhost/other">Link</a>');
    mount(win);
    const link = win.document.querySelector('a')!;
    const event = new win.MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      metaKey: true,
    });
    link.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
  });

  test('ignores clicks with shiftKey', () => {
    const win = createDOM('<a href="http://localhost/other">Link</a>');
    mount(win);
    const link = win.document.querySelector('a')!;
    const event = new win.MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      shiftKey: true,
    });
    link.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
  });

  test('ignores clicks with altKey', () => {
    const win = createDOM('<a href="http://localhost/other">Link</a>');
    mount(win);
    const link = win.document.querySelector('a')!;
    const event = new win.MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      altKey: true,
    });
    link.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
  });

  test('ignores links with target attribute', () => {
    const win = createDOM(
      '<a href="http://localhost/other" target="_blank">Link</a>',
    );
    mount(win);
    const link = win.document.querySelector('a')!;
    const event = new win.MouseEvent('click', {
      bubbles: true,
      cancelable: true,
    });
    link.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
  });

  test('ignores external links', () => {
    const win = createDOM('<a href="https://example.com/page">Link</a>');
    mount(win);
    const link = win.document.querySelector('a')!;
    const event = new win.MouseEvent('click', {
      bubbles: true,
      cancelable: true,
    });
    link.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
  });

  test('ignores non-HTML resource links', () => {
    const win = createDOM('<a href="http://localhost/file.pdf">PDF</a>');
    mount(win);
    const link = win.document.querySelector('a')!;
    const event = new win.MouseEvent('click', {
      bubbles: true,
      cancelable: true,
    });
    link.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
  });

  test('ignores click on non-anchor element', () => {
    const win = createDOM('<span>Not a link</span>');
    mount(win);
    const span = win.document.querySelector('span')!;
    const event = new win.MouseEvent('click', {
      bubbles: true,
      cancelable: true,
    });
    span.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
  });

  test('finds anchor from nested element click', () => {
    const win = createDOM(
      '<a href="http://localhost/other"><span><em>Deep</em></span></a>',
    );
    setupGlobals(win);
    mockFetchReturning(createPageHTML());
    mount(win);

    const em = win.document.querySelector('em')!;
    const event = new win.MouseEvent('click', {
      bubbles: true,
      cancelable: true,
    });
    em.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });

  test('scroll event fires without error', () => {
    const win = createDOM();
    mount(win);
    win.dispatchEvent(new win.Event('scroll'));
  });
});

describe('same-page hash navigation', () => {
  test('prevents default on same-page hash link', () => {
    const win = createDOM('<a href="http://localhost/#section">Link</a>');
    setupGlobals(win);
    mount(win);
    const event = clickLink(win);
    expect(event.defaultPrevented).toBe(true);
  });

  test('sets location.hash', () => {
    const win = createDOM('<a href="http://localhost/page#section">Link</a>', {
      url: 'http://localhost/page',
    });
    setupGlobals(win);
    mount(win);
    clickLink(win);
    expect(win.location.hash).toBe('#section');
  });

  test('uses setLocationHash global for same-page hash links', () => {
    const win = createDOM('<a href="http://localhost/page#section">Link</a>', {
      url: 'http://localhost/page',
    });
    setupGlobals(win);
    const setLocationHash = mock((targetWindow: Window, hash: string) => {
      targetWindow.location.hash = hash;
    });
    mockGlobals({ setLocationHash } as unknown as Partial<
      import('../globals').Globals
    >);

    mount(win);
    clickLink(win);

    expect(setLocationHash).toHaveBeenCalledWith(win, '#section');
  });

  test('clears search input', () => {
    const win = createDOM('<a href="http://localhost/#section">Link</a>', {
      searchValue: 'hello',
    });
    setupGlobals(win);
    mount(win);

    const input = win.document.querySelector(
      'input.search.quick-search',
    ) as HTMLInputElement;
    expect(input.value).toBe('hello');

    clickLink(win);
    expect(input.value).toBe('');
  });

  test('closes open header details', () => {
    const win = createDOM('<a href="http://localhost/#section">Link</a>');
    setupGlobals(win);
    mount(win);

    const details = win.document.querySelector(
      'header details',
    ) as HTMLDetailsElement;
    details.open = true;

    clickLink(win);
    expect(details.open).toBe(false);
  });

  test('same-page link without hash prevents default but does not set hash', () => {
    const win = createDOM('<a href="http://localhost/page">Link</a>', {
      url: 'http://localhost/page',
    });
    setupGlobals(win);
    mount(win);
    const event = clickLink(win);
    expect(event.defaultPrevented).toBe(true);
    expect(win.location.hash).toBe('');
  });
});

describe('cross-page navigation', () => {
  test('prevents default on eligible link', async () => {
    const win = createDOM('<a href="http://localhost/other">Link</a>');
    setupGlobals(win);
    mockFetchReturning(createPageHTML());
    mount(win);

    const event = clickLink(win);
    expect(event.defaultPrevented).toBe(true);
  });

  test('swaps container content', async () => {
    const win = createDOM(
      '<p>Original</p><a href="http://localhost/other">Link</a>',
    );
    setupGlobals(win);
    mockFetchReturning(
      createPageHTML({ containerContent: '<p>New content</p>' }),
    );
    mount(win);

    clickLink(win);
    await flush();

    const container = win.document.querySelector('.container')!;
    expect(container.innerHTML).toContain('New content');
    expect(container.innerHTML).not.toContain('Original');
  });

  test('updates document title', async () => {
    const win = createDOM('<a href="http://localhost/other">Link</a>');
    setupGlobals(win);
    mockFetchReturning(createPageHTML({ title: 'Page Two' }));
    mount(win);

    clickLink(win);
    await flush();

    expect(win.document.title).toBe('Page Two');
  });

  test('updates body class', async () => {
    const win = createDOM('<a href="http://localhost/other">Link</a>', {
      bodyClass: 'default toc-is-active',
    });
    setupGlobals(win);
    mockFetchReturning(createPageHTML({ bodyClass: 'post' }));
    mount(win);

    clickLink(win);
    await flush();

    expect(win.document.body.className).toBe('post');
  });

  test('calls teardown then mount lifecycle', async () => {
    const win = createDOM('<a href="http://localhost/other">Link</a>');
    setupGlobals(win);
    mockFetchReturning(createPageHTML());
    mount(win);

    clickLink(win);
    await flush();

    expect(mockTeardown).toHaveBeenCalled();
    expect(mockMount).toHaveBeenCalled();
  });

  test('pushes history entry with navIndex', async () => {
    const win = createDOM('<a href="http://localhost/other">Link</a>');
    setupGlobals(win);
    mockFetchReturning(createPageHTML());
    mount(win);

    clickLink(win);
    await flush();

    expect(win.history.state).toHaveProperty('navIndex');
    expect(typeof win.history.state.navIndex).toBe('number');
  });

  test('scrolls to top when no hash', async () => {
    const win = createDOM('<a href="http://localhost/other">Link</a>');
    const scrollTo = setupGlobals(win);
    mockFetchReturning(createPageHTML());
    mount(win);

    clickLink(win);
    await flush();

    expect(scrollTo).toHaveBeenCalledWith({ top: 0 });
  });

  test('uses fragment navigation for hash links', async () => {
    const win = createDOM('<a href="http://localhost/other#heading">Link</a>');
    setupGlobals(win);
    mockFetchReturning(createPageHTML());
    mount(win);

    clickLink(win);
    await flush();

    // replaceState should have set the URL with the hash
    expect(win.location.hash).toBe('#heading');
  });

  test('uses replaceLocation global for hash links', async () => {
    const win = createDOM('<a href="http://localhost/other#heading">Link</a>');
    setupGlobals(win);
    const replaceLocation = mock((targetWindow: Window, url: string) => {
      targetWindow.history.replaceState(targetWindow.history.state, '', url);
    });
    mockFetchReturning(createPageHTML(), true, {
      ...({ replaceLocation } as unknown as Partial<
        import('../globals').Globals
      >),
    });
    mount(win);

    clickLink(win);
    await flush();

    expect(replaceLocation).toHaveBeenCalledWith(win, '/other#heading');
  });

  test('clears search before fetch', async () => {
    const win = createDOM('<a href="http://localhost/other">Link</a>', {
      searchValue: 'query',
    });
    setupGlobals(win);

    let searchValueDuringFetch = '';
    mockGlobals({
      fetch: mock(async () => {
        const input = win.document.querySelector(
          'input.search.quick-search',
        ) as HTMLInputElement;
        searchValueDuringFetch = input.value;
        return htmlResponse(createPageHTML());
      }),
    });
    mount(win);

    clickLink(win);
    await flush();

    expect(searchValueDuringFetch).toBe('');
  });

  test('closes header details before fetch', async () => {
    const win = createDOM('<a href="http://localhost/other">Link</a>');
    setupGlobals(win);

    const details = win.document.querySelector(
      'header details',
    ) as HTMLDetailsElement;
    details.open = true;

    let detailsOpenDuringFetch = true;
    mockGlobals({
      fetch: mock(async () => {
        detailsOpenDuringFetch = details.open;
        return htmlResponse(createPageHTML());
      }),
    });
    mount(win);

    clickLink(win);
    await flush();

    expect(detailsOpenDuringFetch).toBe(false);
  });

  test('header gets loading class during fetch', async () => {
    const win = createDOM('<a href="http://localhost/other">Link</a>');
    setupGlobals(win);

    let headerHadLoading = false;
    mockGlobals({
      fetch: mock(async () => {
        const header = win.document.querySelector('header');
        headerHadLoading = header?.classList.contains('loading') ?? false;
        return htmlResponse(createPageHTML());
      }),
    });
    mount(win);

    clickLink(win);
    await flush();

    expect(headerHadLoading).toBe(true);
    expect(
      win.document.querySelector('header')!.classList.contains('loading'),
    ).toBe(false);
  });
});

describe('updateHead', () => {
  test('updates meta description', async () => {
    const win = createDOM('<a href="http://localhost/other">Link</a>');
    setupGlobals(win);
    mockFetchReturning(createPageHTML({ description: 'new desc' }));
    mount(win);

    clickLink(win);
    await flush();

    const meta = win.document.querySelector('meta[name="description"]');
    expect(meta?.getAttribute('content')).toBe('new desc');
  });

  test('adds meta tag when old page lacks it', async () => {
    const win = createDOM('<a href="http://localhost/other">Link</a>', {
      headContent: `<title>Page One</title><meta name="generator" content="${GENERATOR}">`,
    });
    setupGlobals(win);
    mockFetchReturning(createPageHTML({ author: 'Alice' }));
    mount(win);

    clickLink(win);
    await flush();

    const meta = win.document.querySelector('meta[name="author"]');
    expect(meta?.getAttribute('content')).toBe('Alice');
  });

  test('removes meta tag when new page lacks it', async () => {
    const win = createDOM('<a href="http://localhost/other">Link</a>');
    setupGlobals(win);
    mockFetchReturning(createPageHTML());
    mount(win);

    expect(
      win.document.querySelector('meta[name="description"]'),
    ).not.toBeNull();

    clickLink(win);
    await flush();

    expect(win.document.querySelector('meta[name="description"]')).toBeNull();
  });

  test('updates og:title', async () => {
    const win = createDOM('<a href="http://localhost/other">Link</a>', {
      headContent: `<title>Page One</title><meta name="generator" content="${GENERATOR}"><meta property="og:title" content="Old">`,
    });
    setupGlobals(win);
    mockFetchReturning(createPageHTML({ ogTitle: 'New OG Title' }));
    mount(win);

    clickLink(win);
    await flush();

    const meta = win.document.querySelector('meta[property="og:title"]');
    expect(meta?.getAttribute('content')).toBe('New OG Title');
  });

  test('adds og meta tag when old page lacks it', async () => {
    const win = createDOM('<a href="http://localhost/other">Link</a>', {
      headContent: `<title>Page One</title><meta name="generator" content="${GENERATOR}">`,
    });
    setupGlobals(win);
    mockFetchReturning(createPageHTML({ ogAuthor: 'Bob' }));
    mount(win);

    clickLink(win);
    await flush();

    const meta = win.document.querySelector('meta[property="og:author"]');
    expect(meta?.getAttribute('content')).toBe('Bob');
  });

  test('adopts new stylesheets without duplicating existing', async () => {
    const win = createDOM('<a href="http://localhost/other">Link</a>', {
      headContent: `<title>Page One</title><meta name="generator" content="${GENERATOR}"><link rel="stylesheet" href="/style.css">`,
    });
    setupGlobals(win);
    mockFetchReturning(
      createPageHTML({ stylesheets: ['/style.css', '/new.css'] }),
    );
    mount(win);

    clickLink(win);
    await flush();

    const sheets = win.document.querySelectorAll('link[rel="stylesheet"]');
    const hrefs = Array.from(sheets).map(el => el.getAttribute('href'));
    expect(hrefs).toContain('/new.css');
    expect(hrefs.filter(h => h === '/style.css').length).toBe(1);
  });
});

describe('fetch error paths', () => {
  test('network error does not swap content', async () => {
    const win = createDOM(
      '<p>Original</p><a href="http://localhost/other">Link</a>',
    );
    setupGlobals(win);
    mockGlobals({
      fetch: mock(async () => {
        throw new TypeError('Network error');
      }),
    });
    mount(win);

    clickLink(win);
    await flush();

    expect(win.document.querySelector('.container')!.innerHTML).toContain(
      'Original',
    );
    expect(mockTeardown).not.toHaveBeenCalled();
  });

  test('network error uses setLocationHref global for fallback navigation', async () => {
    const win = createDOM(
      '<p>Original</p><a href="http://localhost/other">Link</a>',
    );
    setupGlobals(win);
    const setLocationHref = mock(() => {});
    mockGlobals({
      fetch: mock(async () => {
        throw new TypeError('Network error');
      }),
      ...({ setLocationHref } as unknown as Partial<
        import('../globals').Globals
      >),
    });
    mount(win);

    clickLink(win);
    await flush();

    expect(setLocationHref).toHaveBeenCalledWith(win, 'http://localhost/other');
  });

  test('abort error returns silently', async () => {
    const win = createDOM(
      '<p>Original</p><a href="http://localhost/other">Link</a>',
    );
    setupGlobals(win);
    mockGlobals({
      fetch: mock(async () => {
        const err = new Error('The operation was aborted.');
        err.name = 'AbortError';
        throw err;
      }),
    });
    mount(win);

    clickLink(win);
    await flush();

    expect(win.document.querySelector('.container')!.innerHTML).toContain(
      'Original',
    );
    expect(mockTeardown).not.toHaveBeenCalled();
  });

  test('non-ok response does not swap content', async () => {
    const win = createDOM(
      '<p>Original</p><a href="http://localhost/other">Link</a>',
    );
    setupGlobals(win);
    mockFetchReturning('Not Found', false);
    mount(win);

    clickLink(win);
    await flush();

    expect(win.document.querySelector('.container')!.innerHTML).toContain(
      'Original',
    );
    expect(mockTeardown).not.toHaveBeenCalled();
  });

  test('response without Tada generator meta does not swap', async () => {
    const win = createDOM(
      '<p>Original</p><a href="http://localhost/other">Link</a>',
    );
    setupGlobals(win);
    mockFetchReturning(createPageHTML({ noGenerator: true }));
    mount(win);

    clickLink(win);
    await flush();

    expect(win.document.querySelector('.container')!.innerHTML).toContain(
      'Original',
    );
    expect(mockTeardown).not.toHaveBeenCalled();
  });

  test('response from a different Tada version does not swap', async () => {
    const win = createDOM(
      '<p>Original</p><a href="http://localhost/other">Link</a>',
    );
    setupGlobals(win);
    mockFetchReturning(createPageHTML({ generator: 'Tada 9.9.9' }));
    mount(win);

    clickLink(win);
    await flush();

    expect(win.document.querySelector('.container')!.innerHTML).toContain(
      'Original',
    );
    expect(mockTeardown).not.toHaveBeenCalled();
  });

  test('rapid navigation aborts previous fetch', async () => {
    const win = createDOM(
      '<a id="link1" href="http://localhost/page1">One</a><a id="link2" href="http://localhost/page2">Two</a>',
    );
    setupGlobals(win);

    let firstSignal: AbortSignal | null = null;
    let callCount = 0;
    mockGlobals({
      fetch: mock(async (_input: RequestInfo | URL, init?: RequestInit) => {
        callCount++;
        if (callCount === 1) {
          firstSignal = init?.signal ?? null;
          // Simulate slow fetch that rejects on abort
          await new Promise((_resolve, reject) => {
            if (init?.signal?.aborted) {
              const err = new Error('Aborted');
              err.name = 'AbortError';
              reject(err);
              return;
            }
            init?.signal?.addEventListener('abort', () => {
              const err = new Error('Aborted');
              err.name = 'AbortError';
              reject(err);
            });
          });
        }
        return htmlResponse(createPageHTML({ title: 'Page Two' }));
      }),
    });
    mount(win);

    clickLink(win, '#link1');
    await new Promise(r => setTimeout(r, 0));

    clickLink(win, '#link2');
    await flush();

    expect((firstSignal as AbortSignal | null)?.aborted).toBe(true);
  });
});

describe('popstate handling', () => {
  test('same-page popstate with hash scrolls to element', () => {
    const win = createDOM('<div id="section">Content</div>', {
      url: 'http://localhost/page',
    });
    setupGlobals(win);
    mount(win);

    const section = win.document.getElementById('section')!;
    const scrollIntoViewMock = mock(() => {});
    Object.defineProperty(section, 'scrollIntoView', {
      value: scrollIntoViewMock,
      configurable: true,
    });

    win.history.pushState({ navIndex: 999 }, '', '/page#section');
    dispatchPopState(win, { navIndex: 999 });

    expect(scrollIntoViewMock).toHaveBeenCalled();
  });

  test('same-page popstate with saved hash scroll restores that position', () => {
    const win = createDOM('<div id="section">Content</div>', {
      url: 'http://localhost/page#section',
    });
    const scrollTo = setupGlobals(win);
    Object.defineProperty(win, 'scrollY', {
      value: 240,
      writable: true,
      configurable: true,
    });
    mount(win);

    win.dispatchEvent(new win.Event('scroll'));
    dispatchPopState(win, { navIndex: 0 });

    expect(scrollTo).toHaveBeenCalledWith({ top: 240 });
  });

  test('same-page popstate without hash restores saved scroll', () => {
    const win = createDOM('', { url: 'http://localhost/page' });
    const scrollTo = setupGlobals(win);
    Object.defineProperty(win, 'scrollY', {
      value: 420,
      writable: true,
      configurable: true,
    });
    mount(win);

    win.dispatchEvent(new win.Event('scroll'));
    win.history.pushState({ navIndex: 999 }, '', '/page');
    dispatchPopState(win, { navIndex: 999 });

    expect(scrollTo).toHaveBeenCalledWith({ top: 420 });
  });

  test('same-page popstate without saved scroll falls back to top', () => {
    const win = createDOM('', { url: 'http://localhost/page' });
    const scrollTo = setupGlobals(win);
    mount(win);

    win.history.pushState({ navIndex: 999 }, '', '/page');
    dispatchPopState(win, { navIndex: 999 });

    expect(scrollTo).toHaveBeenCalledWith({ top: 0 });
  });

  test('cross-page popstate fetches and swaps content', async () => {
    const win = createDOM('<p>Original</p>', { url: 'http://localhost/page' });
    setupGlobals(win);
    mockFetchReturning(createPageHTML({ containerContent: '<p>Restored</p>' }));
    mount(win);

    win.history.pushState({ navIndex: 999 }, '', '/other');
    dispatchPopState(win, { navIndex: 999 });
    await flush();

    const container = win.document.querySelector('.container')!;
    expect(container.innerHTML).toContain('Restored');
  });

  test('forward popstate during pending back navigation restores scroll', async () => {
    const win = createDOM(
      '<a href="http://localhost/markdown.html">Markdown</a>',
      { url: 'http://localhost/index.html' },
    );
    const scrollTo = setupGlobals(win);
    Object.defineProperty(win, 'scrollY', {
      value: 0,
      writable: true,
      configurable: true,
    });

    let backFetchAborted = false;
    let callCount = 0;
    mockGlobals({
      fetch: mock(async (_input: RequestInfo | URL, init?: RequestInit) => {
        callCount++;
        if (callCount === 1) {
          return htmlResponse(
            createPageHTML({
              title: 'Markdown Examples',
              containerContent: '<p>Markdown</p>',
            }),
          );
        }

        if (callCount === 2) {
          await new Promise((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () => {
              backFetchAborted = true;
              const err = new Error('Aborted');
              err.name = 'AbortError';
              reject(err);
            });
          });
        }

        return htmlResponse(
          createPageHTML({
            title: 'Markdown Examples',
            containerContent: '<p>Markdown restored</p>',
          }),
        );
      }),
    });

    mount(win);
    clickLink(win);
    await flush();

    win.scrollY = 500;
    win.dispatchEvent(new win.Event('scroll'));

    win.history.replaceState(null, '', '/index.html');
    win.dispatchEvent(new win.PopStateEvent('popstate', { state: null }));
    await new Promise(r => setTimeout(r, 0));

    win.history.replaceState({ navIndex: 1 }, '', '/markdown.html');
    win.dispatchEvent(
      new win.PopStateEvent('popstate', { state: { navIndex: 1 } }),
    );
    await flush();

    expect(backFetchAborted).toBe(true);
    expect(callCount).toBe(3);
    expect(scrollTo).toHaveBeenCalledWith({ top: 500 });
    expect(win.document.title).toBe('Markdown Examples');
  });
});

describe('view transitions', () => {
  function addViewTransition(doc: Document, fn: (cb: () => void) => unknown) {
    Object.defineProperty(doc, 'startViewTransition', {
      value: fn,
      configurable: true,
    });
  }

  test('calls startViewTransition when available', async () => {
    const win = createDOM('<a href="http://localhost/other">Link</a>');
    setupGlobals(win);
    mockFetchReturning(createPageHTML());

    const startViewTransition = mock((cb: () => void) => {
      cb();
      return { finished: Promise.resolve() };
    });
    addViewTransition(win.document, startViewTransition);

    mount(win);
    clickLink(win);
    await flush();

    expect(startViewTransition).toHaveBeenCalled();
    expect(win.document.title).toBe('Page Two');
  });

  test('adds and removes direction class', async () => {
    const win = createDOM('<a href="http://localhost/other">Link</a>');
    setupGlobals(win);
    mockFetchReturning(createPageHTML());

    let hadNavForward = false;
    const startViewTransition = mock((cb: () => void) => {
      hadNavForward =
        win.document.documentElement.classList.contains('nav-forward');
      cb();
      return { finished: Promise.resolve() };
    });
    addViewTransition(win.document, startViewTransition);

    mount(win);
    clickLink(win);
    await flush();

    expect(hadNavForward).toBe(true);
    expect(win.document.documentElement.classList.contains('nav-forward')).toBe(
      false,
    );
    expect(win.document.documentElement.classList.contains('nav-back')).toBe(
      false,
    );
  });

  test('runs title transition when title-and-info is visible', async () => {
    const win = createDOM(
      '<div class="title-and-info"><h1>Title</h1><div class="info">Info</div><a class="breadcrumb" href="/">Home</a></div><a id="nav" href="http://localhost/other">Link</a>',
    );
    setupGlobals(win);
    mockFetchReturning(
      createPageHTML({
        containerContent:
          '<div class="title-and-info"><h1>Title 2</h1><div class="info">Info 2</div><a class="breadcrumb" href="/">Home</a></div><p>New</p>',
      }),
    );

    const startViewTransition = mock((cb: () => void) => {
      cb();
      return { finished: Promise.resolve() };
    });
    addViewTransition(win.document, startViewTransition);

    mount(win);
    clickLink(win, '#nav');
    await flush();

    expect(startViewTransition).toHaveBeenCalled();
    expect(win.document.querySelector('.container')!.innerHTML).toContain(
      'Title 2',
    );
  });
});
