import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import { JSDOM } from 'jsdom';
import { createGlobals } from '../globals.test';
import mount, {
  nextHeaderTitleState,
  swapHeaderTitle,
  type HeadingGeometry,
} from './index';

function create(open = false) {
  const dom = new JSDOM(
    `<body><header><details${open ? ' open' : ''}><summary>Menu</summary><nav>Links</nav></details></header></body>`,
  );
  return dom.window as unknown as Window & typeof globalThis;
}

describe('header', () => {
  test('closes open details on outside click', () => {
    const win = create(true);
    mount(win);

    const details = win.document.querySelector('details') as HTMLDetailsElement;
    expect(details.open).toBe(true);

    win.document.body.dispatchEvent(
      new win.MouseEvent('click', { bubbles: true }),
    );
    expect(details.open).toBe(false);
  });

  test('does not close details when clicking inside', () => {
    const win = create(true);
    mount(win);

    const details = win.document.querySelector('details') as HTMLDetailsElement;
    details.dispatchEvent(new win.MouseEvent('click', { bubbles: false }));
    expect(details.open).toBe(true);
  });

  test('closes on Escape key when details is open', () => {
    const win = create(true);
    mount(win);

    const details = win.document.querySelector('details') as HTMLDetailsElement;
    const summary = win.document.querySelector('summary')!;

    // Focus the summary so activeElement is inside details
    summary.focus();

    win.dispatchEvent(
      new win.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
    );
    expect(details.open).toBe(false);
  });

  test('ignores Escape when details is closed', () => {
    const win = create(false);
    mount(win);

    const details = win.document.querySelector('details') as HTMLDetailsElement;
    win.dispatchEvent(
      new win.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
    );
    expect(details.open).toBe(false);
  });

  test('ignores other keys', () => {
    const win = create(true);
    mount(win);

    const details = win.document.querySelector('details') as HTMLDetailsElement;
    const summary = win.document.querySelector('summary')!;
    summary.focus();

    win.dispatchEvent(
      new win.KeyboardEvent('keydown', { key: 'Tab', bubbles: true }),
    );
    expect(details.open).toBe(true);
  });

  test('keeps details open when focusout has no related target', () => {
    const win = create(true);
    mount(win);

    const details = win.document.querySelector('details') as HTMLDetailsElement;
    const summary = win.document.querySelector('summary')!;
    summary.dispatchEvent(
      new win.FocusEvent('focusout', { bubbles: true, relatedTarget: null }),
    );

    expect(details.open).toBe(true);
  });

  test('closes details when focus moves outside', () => {
    const win = create(true);
    mount(win);

    const details = win.document.querySelector('details') as HTMLDetailsElement;
    const summary = win.document.querySelector('summary')!;
    summary.dispatchEvent(
      new win.FocusEvent('focusout', {
        bubbles: true,
        relatedTarget: win.document.body,
      }),
    );

    expect(details.open).toBe(false);
  });

  test('cleanup removes event listeners', () => {
    const win = create(true);
    const cleanup = mount(win);

    cleanup!();

    win.document.body.dispatchEvent(
      new win.MouseEvent('click', { bubbles: true }),
    );

    const details = win.document.querySelector('details') as HTMLDetailsElement;
    expect(details.open).toBe(true);
  });
});

describe('nextHeaderTitleState', () => {
  const headerBottom = 45;
  const geometry = (
    blockBottom: number,
    titleTop: number,
  ): HeadingGeometry => ({ blockBottom, titleTop, headerBottom });

  test.each(['site', 'page'] as const)(
    'shows the site title without a heading (from %p)',
    current => {
      expect(nextHeaderTitleState(current, null)).toBe('site');
    },
  );

  test.each(['site', 'page'] as const)(
    'shows the page title once the heading block is under the header (from %p)',
    current => {
      expect(nextHeaderTitleState(current, geometry(45, -60))).toBe('page');
      expect(nextHeaderTitleState(current, geometry(10, -95))).toBe('page');
    },
  );

  test.each(['site', 'page'] as const)(
    'shows the site title once the h1 is entirely below the header (from %p)',
    current => {
      expect(nextHeaderTitleState(current, geometry(200, 45))).toBe('site');
      expect(nextHeaderTitleState(current, geometry(300, 120))).toBe('site');
    },
  );

  test.each(['site', 'page'] as const)(
    'keeps the %p title while the h1 is partly hidden above the info',
    current => {
      expect(nextHeaderTitleState(current, geometry(46, 44))).toBe(current);
      expect(nextHeaderTitleState(current, geometry(90, -20))).toBe(current);
    },
  );
});

describe('header title', () => {
  let observed: Element[];
  let disconnects: number;

  beforeEach(() => {
    observed = [];
    disconnects = 0;
    mock.module('../globals', () => ({
      globals: createGlobals({
        createIntersectionObserver() {
          return {
            disconnect() {
              observed = [];
              disconnects++;
            },
            observe(target: Element) {
              observed.push(target);
            },
          };
        },
      }),
    }));
  });

  let cleanup: (() => void) | undefined;

  afterEach(() => {
    cleanup?.();
    cleanup = undefined;
  });

  function headerHtml(pageTitle: string) {
    return `<header><details><summary>
      <span class="header-title" aria-hidden="true">
        <span class="header-title-reel">
          <span class="site-title">Site</span>
          <span class="header-page-title">${pageTitle}</span>
        </span>
      </span>
    </summary><nav>Links</nav></details></header>`;
  }

  function createPage(pageTitle: string, heading: string) {
    const dom = new JSDOM(
      `<body>${headerHtml(pageTitle)}<div class="container">${heading}</div></body>`,
    );
    return dom.window as unknown as Window & typeof globalThis;
  }

  function parse(html: string) {
    return new JSDOM(html).window.document;
  }

  const markdownHeading =
    '<div class="title-and-info"><h1>First</h1><div class="info"></div></div>';

  test('starts on the site title and observes the heading block and h1', () => {
    const win = createPage('First', markdownHeading);
    cleanup = mount(win);

    const container = win.document.querySelector('.header-title')!;
    expect(container.classList.contains('is-page-title')).toBe(false);
    expect(observed).toEqual([
      win.document.querySelector('.title-and-info')!,
      win.document.querySelector('.title-and-info h1')!,
    ]);
  });

  test('observes the file header on code pages', () => {
    const win = createPage(
      'Main.java',
      '<div class="file-header"><h1 class="file-title">Main.java</h1></div>',
    );
    cleanup = mount(win);

    expect(observed).toEqual([
      win.document.querySelector('.file-header')!,
      win.document.querySelector('.file-title')!,
    ]);
  });

  test('adopts the new page title and observes the new heading on swap', () => {
    const win = createPage('First', markdownHeading);
    cleanup = mount(win);

    const newDoc = parse(
      `<body>${headerHtml('<code>Second.java</code>')}<div class="container"><div class="file-header"><h1 class="file-title"><code>Second.java</code></h1></div></div></body>`,
    );
    win.document
      .querySelector('.container')!
      .replaceChildren(
        ...win.document.importNode(newDoc.querySelector('.container')!, true)
          .childNodes,
      );
    swapHeaderTitle(newDoc);

    expect(win.document.querySelector('.header-page-title')!.innerHTML).toBe(
      '<code>Second.java</code>',
    );
    expect(observed).toEqual([
      win.document.querySelector('.file-header')!,
      win.document.querySelector('.file-title')!,
    ]);
  });

  test('stops observing after cleanup and ignores later swaps', () => {
    const win = createPage('First', markdownHeading);
    mount(win)();

    expect(disconnects).toBeGreaterThan(0);
    expect(observed).toEqual([]);

    swapHeaderTitle(parse(`<body>${headerHtml('Second')}</body>`));
    expect(win.document.querySelector('.header-page-title')!.textContent).toBe(
      'First',
    );
  });

  test('does nothing without the title markup', () => {
    const win = create();
    cleanup = mount(win);

    expect(observed).toEqual([]);
    expect(() => swapHeaderTitle(parse('<body></body>'))).not.toThrow();
  });
});
