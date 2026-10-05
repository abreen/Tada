import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  jest,
  mock,
  test,
} from 'bun:test';
import { JSDOM } from 'jsdom';
import { createGlobals } from '../globals.test';

function mockGlobals(overrides: Record<string, unknown> = {}) {
  mock.module('../globals', () => ({
    globals: createGlobals(overrides as never),
  }));
}

let mount: typeof import('./index').default;

beforeAll(async () => {
  ({ default: mount } = await import('./index'));
});

beforeEach(() => {
  mockGlobals();
});

afterEach(() => {
  jest.useRealTimers();
});

function create(html = '', url = 'http://localhost/') {
  const dom = new JSDOM(`<body>${html}</body>`, { url });
  return dom.window;
}

type TestWindow = ReturnType<typeof create>;

const VIEWPORT_HEIGHT = 800;

function setPageSize(
  win: TestWindow,
  pageHeight: number,
  viewportHeight = VIEWPORT_HEIGHT,
) {
  Object.defineProperty(win, 'innerHeight', {
    value: viewportHeight,
    configurable: true,
  });
  Object.defineProperty(win.document.documentElement, 'scrollHeight', {
    value: pageHeight,
    configurable: true,
  });
}

function scrollTo(win: TestWindow, y: number) {
  Object.defineProperty(win, 'scrollY', { value: y, configurable: true });
  win.dispatchEvent(new win.Event('scroll'));
  // debounce is 50ms
  jest.advanceTimersByTime(50);
}

function isVisible(win: TestWindow) {
  return win.document
    .querySelector('a.button')!
    .classList.contains('is-visible');
}

describe('top', () => {
  test('creates a back-to-top link in the body', () => {
    const win = create();
    mount(win);

    const link = win.document.querySelector('a.button');
    expect(link).not.toBeNull();
    expect(link!.getAttribute('href')).toBe('#');
  });

  test('mounts link inside #to-top-container when present', () => {
    const win = create('<div id="to-top-container"></div>');
    mount(win);

    const container = win.document.getElementById('to-top-container')!;
    const link = container.querySelector('a.button');
    expect(link).not.toBeNull();
  });

  test('link starts hidden (no is-visible class)', () => {
    const win = create();
    mount(win);

    const link = win.document.querySelector('a.button')!;
    expect(link.classList.contains('is-visible')).toBe(false);
    expect(link.getAttribute('tabindex')).toBe('-1');
  });

  test('cleanup removes scroll listener', () => {
    const win = create();
    const cleanup = mount(win);

    expect(typeof cleanup).toBe('function');
    cleanup!();
  });

  test('shows link when scrolled past 1.5 viewports on a long page', () => {
    jest.useFakeTimers();
    const win = create();
    setPageSize(win, 3 * VIEWPORT_HEIGHT);
    mount(win);

    const link = win.document.querySelector('a.button') as HTMLElement;
    scrollTo(win, 1.5 * VIEWPORT_HEIGHT);
    expect(isVisible(win)).toBe(false);

    scrollTo(win, 1.5 * VIEWPORT_HEIGHT + 1);
    expect(link.classList.contains('is-visible')).toBe(true);
    expect(link.getAttribute('tabindex')).toBe('0');
  });

  test('uses 25% of the scrollable distance on very long pages', () => {
    jest.useFakeTimers();
    const win = create();
    // Scrollable distance is 20 viewports; 25% of it is 5 viewports
    setPageSize(win, 21 * VIEWPORT_HEIGHT);
    mount(win);

    scrollTo(win, 5 * VIEWPORT_HEIGHT);
    expect(isVisible(win)).toBe(false);

    scrollTo(win, 5 * VIEWPORT_HEIGHT + 1);
    expect(isVisible(win)).toBe(true);
  });

  test('never shows link on pages shorter than 3 viewports', () => {
    jest.useFakeTimers();
    const win = create();
    setPageSize(win, 3 * VIEWPORT_HEIGHT - 1);
    mount(win);

    scrollTo(win, 2 * VIEWPORT_HEIGHT - 1);
    expect(isVisible(win)).toBe(false);
  });

  test('recalculates visibility on resize', () => {
    jest.useFakeTimers();
    const win = create();
    setPageSize(win, 3 * VIEWPORT_HEIGHT);
    mount(win);

    scrollTo(win, 2 * VIEWPORT_HEIGHT);
    expect(isVisible(win)).toBe(true);

    // A taller viewport makes the same page too short
    setPageSize(win, 3 * VIEWPORT_HEIGHT, 2 * VIEWPORT_HEIGHT);
    win.dispatchEvent(new win.Event('resize'));
    jest.advanceTimersByTime(50);
    expect(isVisible(win)).toBe(false);
  });

  test('hides link when scrolled back to top', () => {
    jest.useFakeTimers();
    const win = create();
    setPageSize(win, 3 * VIEWPORT_HEIGHT);
    mount(win);

    const link = win.document.querySelector('a.button') as HTMLElement;

    scrollTo(win, 2 * VIEWPORT_HEIGHT);
    expect(link.classList.contains('is-visible')).toBe(true);

    scrollTo(win, 0);
    expect(link.classList.contains('is-visible')).toBe(false);
    expect(link.getAttribute('tabindex')).toBe('-1');
  });

  test('onclick scrolls to top', () => {
    const win = create('', 'http://localhost/page');
    mount(win);

    const link = win.document.querySelector('a.button') as HTMLAnchorElement;

    let called = false;
    win.scrollTo = ((opts: { top: number }) => {
      expect(opts.top).toBe(0);
      called = true;
    }) as typeof win.scrollTo;

    const event = new win.MouseEvent('click', {
      bubbles: true,
      cancelable: true,
    });
    link.dispatchEvent(event);

    expect(called).toBe(true);
  });

  test('onclick clears hash via fragment navigation when hash is present', () => {
    const win = create('', 'http://localhost/page#section');
    mount(win);

    const link = win.document.querySelector('a.button') as HTMLAnchorElement;
    win.scrollTo = (() => {}) as typeof win.scrollTo;

    const state = { navIndex: 2 };
    win.history.replaceState(state, '', win.location.href);
    const replaced: Array<{ data: unknown; url: string }> = [];
    win.history.replaceState = (
      data: unknown,
      _title: string,
      url?: string,
    ) => {
      replaced.push({ data, url: url! });
    };

    const event = new win.MouseEvent('click', {
      bubbles: true,
      cancelable: true,
    });
    link.dispatchEvent(event);

    // location.hash assignment clears the fragment so :target updates,
    // then replaceState strips any trailing '#' from the URL.
    expect(win.location.hash).toBe('');
    expect(replaced).toEqual([{ data: state, url: '/page' }]);
  });

  test('onclick clears hash through setLocationHash global when hash is present', () => {
    const win = create('', 'http://localhost/page#section');
    const setLocationHash = mock((targetWindow: Window, hash: string) => {
      targetWindow.location.hash = hash;
    });
    mockGlobals({ setLocationHash });
    mount(win);

    const link = win.document.querySelector('a.button') as HTMLAnchorElement;
    win.scrollTo = (() => {}) as typeof win.scrollTo;

    const event = new win.MouseEvent('click', {
      bubbles: true,
      cancelable: true,
    });
    link.dispatchEvent(event);

    expect(setLocationHash).toHaveBeenCalledWith(win, '');
  });

  test('onclick uses replaceState when no hash', () => {
    const win = create('', 'http://localhost/page');
    mount(win);

    const link = win.document.querySelector('a.button') as HTMLAnchorElement;
    win.scrollTo = (() => {}) as typeof win.scrollTo;

    const state = { navIndex: 2 };
    win.history.replaceState(state, '', win.location.href);
    const replaced: Array<{ data: unknown; url: string }> = [];
    win.history.replaceState = (
      data: unknown,
      _title: string,
      url?: string,
    ) => {
      replaced.push({ data, url: url! });
    };

    const event = new win.MouseEvent('click', {
      bubbles: true,
      cancelable: true,
    });
    link.dispatchEvent(event);

    expect(replaced).toEqual([{ data: state, url: '/page' }]);
  });

  test('onclick resets toc scroll position when toc exists', () => {
    const dom = new JSDOM(
      `<body><nav class="toc" style="overflow:auto"></nav></body>`,
      { url: 'http://localhost/' },
    );
    const win = dom.window;
    mount(win);

    win.scrollTo = (() => {}) as typeof win.scrollTo;

    const toc = win.document.querySelector('nav.toc') as HTMLElement;
    Object.defineProperty(toc, 'scrollTop', { value: 100, writable: true });

    const link = win.document.querySelector('a.button') as HTMLAnchorElement;

    const event = new win.MouseEvent('click', {
      bubbles: true,
      cancelable: true,
    });
    link.dispatchEvent(event);

    expect(toc.scrollTop).toBe(0);
  });
});
