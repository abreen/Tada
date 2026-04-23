import { beforeAll, beforeEach, describe, expect, mock, test } from 'bun:test';
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

function create(html = '', url = 'http://localhost/') {
  const dom = new JSDOM(`<body>${html}</body>`, { url });
  return dom.window;
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

  test('shows link when scrolled past threshold', async () => {
    const win = create();
    mount(win);

    const link = win.document.querySelector('a.button') as HTMLElement;
    expect(link.classList.contains('is-visible')).toBe(false);

    Object.defineProperty(win, 'scrollY', { value: 300, writable: true });
    win.dispatchEvent(new win.Event('scroll'));

    // debounce is 50ms
    await new Promise(r => setTimeout(r, 80));

    expect(link.classList.contains('is-visible')).toBe(true);
    expect(link.getAttribute('tabindex')).toBe('0');
  });

  test('hides link when scrolled back to top', async () => {
    const win = create();
    mount(win);

    const link = win.document.querySelector('a.button') as HTMLElement;

    Object.defineProperty(win, 'scrollY', { value: 300, writable: true });
    win.dispatchEvent(new win.Event('scroll'));
    await new Promise(r => setTimeout(r, 80));
    expect(link.classList.contains('is-visible')).toBe(true);

    Object.defineProperty(win, 'scrollY', { value: 0, writable: true });
    win.dispatchEvent(new win.Event('scroll'));
    await new Promise(r => setTimeout(r, 80));
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

    const replaced: string[] = [];
    win.history.replaceState = (
      _data: unknown,
      _title: string,
      url?: string,
    ) => {
      replaced.push(url!);
    };

    const event = new win.MouseEvent('click', {
      bubbles: true,
      cancelable: true,
    });
    link.dispatchEvent(event);

    // location.hash assignment clears the fragment so :target updates,
    // then replaceState strips any trailing '#' from the URL.
    expect(win.location.hash).toBe('');
    expect(replaced).toEqual(['/page']);
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

    const replaced: string[] = [];
    win.history.replaceState = (
      _data: unknown,
      _title: string,
      url?: string,
    ) => {
      replaced.push(url!);
    };

    const event = new win.MouseEvent('click', {
      bubbles: true,
      cancelable: true,
    });
    link.dispatchEvent(event);

    expect(replaced).toEqual(['/page']);
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
