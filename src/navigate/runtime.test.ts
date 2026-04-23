import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { JSDOM } from 'jsdom';
import { createGlobals } from '../globals.test';

const mockTeardown = mock(() => {});
const mockMount = mock(async () => mockTeardown);
mock.module('./lifecycle', () => ({
  mountPerPageComponents: mockMount,
  teardownPerPageComponents: mockTeardown,
}));

import {
  NAVIGATION_EVENT,
  initNavigation,
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

function createPageHTML() {
  return `<html><head><title>New</title><meta name="generator" content="${GENERATOR}"><meta name="description" content="updated"></head><body class="post"><div class="container"><p>Updated</p></div></body></html>`;
}

function htmlResponse(html: string): Response {
  return new Response(html, { status: 200 });
}

async function flush() {
  for (let i = 0; i < 6; i++) {
    await new Promise(resolve => setTimeout(resolve, 0));
  }
}

beforeEach(() => {
  mockGlobals();
  mockTeardown.mockClear();
  mockMount.mockClear();
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
