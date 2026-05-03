import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { JSDOM } from 'jsdom';
import { createGlobals } from '../globals.test';
import { deferred } from '../../test-helpers';

const mockTeardown = mock(() => {});
const mockMount = mock(async () => mockTeardown);
mock.module('./lifecycle', () => ({
  mountPerPageComponents: mockMount,
  teardownPerPageComponents: mockTeardown,
}));

import {
  NAVIGATION_EVENT,
  initNavigation,
  navigateToUrl,
  refreshCurrentPage,
} from './runtime';

const GENERATOR = 'Tada 1.11.1';

function mockGlobals(overrides: Partial<import('../globals').Globals> = {}) {
  mock.module('../globals', () => ({ globals: createGlobals(overrides) }));
}

function createDOM(
  bodyContent = '<p>Original</p>',
  options?: { url?: string; searchValue?: string },
) {
  const url = options?.url ?? 'http://localhost/page';
  const searchValue = options?.searchValue ?? '';
  const dom = new JSDOM(
    `<html><head><title>Old</title><meta name="generator" content="${GENERATOR}"></head><body class="default"><header><input class="search quick-search" value="${searchValue}"><details><summary>Menu</summary><nav></nav></details></header><div class="container">${bodyContent}</div></body></html>`,
    { url, pretendToBeVisual: true },
  );
  return dom.window;
}

function createPageHTML(title = 'New', content = 'Updated') {
  return `<html><head><title>${title}</title><meta name="generator" content="${GENERATOR}"><meta name="description" content="updated"></head><body class="post"><div class="container"><p>${content}</p></div></body></html>`;
}

function htmlResponse(html: string): Response {
  return new Response(html, { status: 200 });
}

async function flush() {
  for (let i = 0; i < 6; i++) {
    await new Promise(resolve => setTimeout(resolve, 0));
  }
}

function mockScrollTo(win: Window) {
  Object.defineProperty(win, 'scrollTo', {
    value: mock(() => {}),
    configurable: true,
  });
}

beforeEach(() => {
  mockGlobals();
  mockTeardown.mockClear();
  mockMount.mockClear();
});

describe('navigateToUrl race handling', () => {
  test('does not swap a stale navigation after its response body resolves', async () => {
    const win = createDOM();
    mockScrollTo(win);
    initNavigation(win);

    const firstBody = deferred<string>();
    let callCount = 0;
    mockGlobals({
      fetch: mock(async () => {
        callCount++;
        if (callCount === 1) {
          return {
            ok: true,
            text: mock(() => firstBody.promise),
          } as unknown as Response;
        }

        return htmlResponse(createPageHTML('Fresh', 'Fresh content'));
      }),
    });

    const firstNavigation = navigateToUrl(win, {
      url: 'http://localhost/first',
      scrollTarget: null,
      direction: 'forward',
      pushHistory: true,
      useViewTransition: false,
    });
    await flush();

    await navigateToUrl(win, {
      url: 'http://localhost/second',
      scrollTarget: null,
      direction: 'forward',
      pushHistory: true,
      useViewTransition: false,
    });

    firstBody.resolve(createPageHTML('Stale', 'Stale content'));
    await firstNavigation;

    expect(win.document.title).toBe('Fresh');
    expect(win.document.querySelector('.container')?.innerHTML).toContain(
      'Fresh content',
    );
    expect(win.document.querySelector('.container')?.innerHTML).not.toContain(
      'Stale content',
    );
  });

  test('handles abort errors while reading the response body', async () => {
    const win = createDOM();
    mockScrollTo(win);
    initNavigation(win);

    const setLocationHref = mock(() => {});
    mockGlobals({
      fetch: mock(async () => ({
        ok: true,
        text: mock(async () => {
          const err = new Error('The operation was aborted.');
          err.name = 'AbortError';
          throw err;
        }),
      })) as unknown as typeof fetch,
      ...({ setLocationHref } as unknown as Partial<
        import('../globals').Globals
      >),
    });

    await navigateToUrl(win, {
      url: 'http://localhost/other',
      scrollTarget: null,
      direction: 'forward',
      pushHistory: true,
      useViewTransition: false,
    });

    expect(win.document.querySelector('.container')?.innerHTML).toContain(
      'Original',
    );
    expect(mockTeardown).not.toHaveBeenCalled();
    expect(setLocationHref).not.toHaveBeenCalled();
    expect(
      win.document.querySelector('header')?.classList.contains('loading'),
    ).toBe(false);
  });
});

describe('refreshCurrentPage', () => {
  test('refreshes the current URL in place without pushing history', async () => {
    const win = createDOM();
    const scrollTo = mock(() => {});
    Object.defineProperty(win, 'scrollTo', {
      value: scrollTo,
      configurable: true,
    });
    Object.defineProperty(win, 'scrollY', {
      value: 320,
      writable: true,
      configurable: true,
    });

    initNavigation(win);

    mockGlobals({ fetch: mock(async () => htmlResponse(createPageHTML())) });

    const navigationHandler = mock(() => {});
    win.addEventListener(NAVIGATION_EVENT, navigationHandler);

    await refreshCurrentPage(win);
    await flush();

    expect(win.document.title).toBe('New');
    expect(win.document.querySelector('.container')?.innerHTML).toContain(
      'Updated',
    );
    expect(win.document.body.className).toBe('post');
    expect(scrollTo).toHaveBeenCalledWith({ top: 320 });
    expect(win.history.state).toBeNull();
    expect(mockTeardown).toHaveBeenCalled();
    expect(mockMount).toHaveBeenCalled();
    expect(navigationHandler).toHaveBeenCalled();
  });

  test('clears search and closes header details before refreshing', async () => {
    const win = createDOM('<p>Original</p>', { searchValue: 'query' });
    const details = win.document.querySelector('details') as HTMLDetailsElement;
    details.open = true;

    Object.defineProperty(win, 'scrollTo', {
      value: mock(() => {}),
      configurable: true,
    });

    initNavigation(win);

    mockGlobals({ fetch: mock(async () => htmlResponse(createPageHTML())) });

    await refreshCurrentPage(win);
    await flush();

    const input = win.document.querySelector(
      'input.search.quick-search',
    ) as HTMLInputElement;
    expect(input.value).toBe('');
    expect(details.open).toBe(false);
  });

  test('does not start a view transition while refreshing in place', async () => {
    const win = createDOM();
    const startViewTransition = mock((cb: () => void) => {
      cb();
      return { finished: Promise.resolve() };
    });

    Object.defineProperty(win.document, 'startViewTransition', {
      value: startViewTransition,
      configurable: true,
    });
    Object.defineProperty(win, 'scrollTo', {
      value: mock(() => {}),
      configurable: true,
    });

    initNavigation(win);

    mockGlobals({ fetch: mock(async () => htmlResponse(createPageHTML())) });

    await refreshCurrentPage(win);
    await flush();

    expect(startViewTransition).not.toHaveBeenCalled();
  });
});
