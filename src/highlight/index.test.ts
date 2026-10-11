import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { JSDOM } from 'jsdom';
import { createGlobals } from '../globals.test';

interface FakeOptions {
  highlightParam: string;
  markOptions: { className: string; exclude: string[] };
  addStyles: boolean;
}

let currentWindow: Window;
let highlightOptions: FakeOptions | null;
let importModule: ReturnType<typeof mock>;
let observerCallback: IntersectionObserverCallback | null;
let observed: Element[];
let disconnects: number;
let now: number;

// Marks each search term in the page's indexed content, like Pagefind's
// highlighter, skipping excluded elements
class FakePagefindHighlight {
  constructor(options: FakeOptions) {
    highlightOptions = options;
    const { document } = currentWindow;
    const terms = new URLSearchParams(currentWindow.location.search).getAll(
      options.highlightParam,
    );
    const excluded = options.markOptions.exclude.join(', ');
    for (const body of document.querySelectorAll('[data-pagefind-body]')) {
      const walker = document.createTreeWalker(body, 4);
      const nodes: Text[] = [];
      while (walker.nextNode()) {
        nodes.push(walker.currentNode as Text);
      }
      for (let node of nodes) {
        if (node.parentElement?.matches(excluded)) {
          continue;
        }
        // Mark every occurrence of every term, earliest first
        for (;;) {
          const found = terms
            .map(term => ({ term, index: node.data.indexOf(term) }))
            .filter(({ index }) => index !== -1)
            .sort((a, b) => a.index - b.index)[0];
          if (!found) {
            break;
          }
          const match = node.splitText(found.index);
          node = match.splitText(found.term.length);
          const mark = document.createElement('mark');
          mark.className = options.markOptions.className;
          match.replaceWith(mark);
          mark.append(match);
        }
      }
    }
  }
}

mock.module('../globals', () => ({
  globals: createGlobals({
    importModule: (...args: unknown[]) => importModule(...args),
    createIntersectionObserver(callback) {
      observerCallback = callback;
      return {
        disconnect() {
          disconnects++;
        },
        observe(target: Element) {
          observed.push(target);
        },
      };
    },
    now: () => now,
  }),
}));

const { default: mount } = await import('./index');
const { TABS_REVEAL_EVENT } = await import('../tabs');
const { setScrollRestored } = await import('../navigate/restored-scroll');

function create(url: string, html: string) {
  const dom = new JSDOM(`<body>${html}</body>`, { url });
  currentWindow = dom.window as unknown as Window;
  const scrolled: Element[] = [];
  const view = dom.window as unknown as typeof globalThis;
  view.HTMLElement.prototype.scrollIntoView = function () {
    scrolled.push(this);
  };
  const revealed: Element[] = [];
  dom.window.document.addEventListener(TABS_REVEAL_EVENT, event => {
    revealed.push(event.target as Element);
  });
  return { win: currentWindow, scrolled, revealed };
}

function intersect(...targets: Element[]) {
  observerCallback!(
    targets.map(
      target => ({ target, isIntersecting: true }) as IntersectionObserverEntry,
    ),
    {} as IntersectionObserver,
  );
}

const PAGE = `
  <main data-pagefind-body>
    <p id="intro">An odd intro.</p>
    <h2 id="section">Section</h2>
    <p>Another odd line.</p>
    <p class="tabs-panel-label" data-pagefind-ignore>odd label</p>
    <p data-pagefind-ignore>odd ignored</p>
  </main>
  <header>odd header</header>
`;

beforeEach(() => {
  highlightOptions = null;
  importModule = mock(async () => ({ default: FakePagefindHighlight }));
  observerCallback = null;
  observed = [];
  disconnects = 0;
  now = 0;
  setScrollRestored(false);
});

describe('search highlighting', () => {
  test('does nothing without search terms in the URL', async () => {
    const { win } = create('http://localhost/page.html', PAGE);
    expect(await mount(win)).toBeUndefined();
    expect(importModule).not.toHaveBeenCalled();
    expect(win.document.querySelector('mark')).toBeNull();
  });

  test("marks terms with Pagefind's highlighter in indexed content", async () => {
    const { win } = create(
      'http://localhost/page.html?pagefind-highlight=odd',
      PAGE,
    );
    await mount(win);

    expect(importModule).toHaveBeenCalledWith(
      '/pagefind/pagefind-highlight.js',
    );
    expect(highlightOptions?.highlightParam).toBe('pagefind-highlight');
    expect(highlightOptions?.addStyles).toBe(false);
    const marks = win.document.querySelectorAll('mark.search-highlight');
    expect(Array.from(marks, mark => mark.parentElement?.id || '')).toEqual([
      'intro',
      '',
    ]);
  });

  test('reveals and scrolls to the first highlight without a target', async () => {
    const { win, scrolled, revealed } = create(
      'http://localhost/page.html?pagefind-highlight=odd',
      PAGE,
    );
    await mount(win);

    const first = win.document.querySelector('mark.search-highlight');
    expect(revealed).toEqual([first!]);
    expect(scrolled).toEqual([first!]);
  });

  test('reveals the first highlight after the target without scrolling', async () => {
    const { win, scrolled, revealed } = create(
      'http://localhost/page.html?pagefind-highlight=odd#section',
      PAGE,
    );
    await mount(win);

    const marks = win.document.querySelectorAll('mark.search-highlight');
    expect(revealed).toEqual([marks[1]]);
    expect(scrolled).toEqual([]);
  });

  test('sweeps highlights in reading order as they come into view', async () => {
    const { win } = create(
      'http://localhost/page.html?pagefind-highlight=odd',
      PAGE,
    );
    const cleanup = await mount(win);
    const [first, second] = Array.from(
      win.document.querySelectorAll<HTMLElement>('mark.search-highlight'),
    );
    expect(observed).toEqual([first, second]);
    expect(first.getAttribute('data-sweep')).toBe('pending');

    // Reported out of order in one batch
    now = 1000;
    intersect(second, first);
    expect(first.getAttribute('data-sweep')).toBe('run');
    expect(first.style.getPropertyValue('--search-highlight-delay')).toBe(
      '0ms',
    );
    expect(first.style.getPropertyValue('--search-highlight-duration')).toBe(
      '150ms',
    );
    expect(second.style.getPropertyValue('--search-highlight-delay')).toBe(
      '210ms',
    );
    expect(disconnects).toBe(1);

    cleanup?.();
    expect(disconnects).toBe(2);
  });

  test('starts a later highlight after the current stroke finishes', async () => {
    const { win } = create(
      'http://localhost/page.html?pagefind-highlight=odd',
      PAGE,
    );
    await mount(win);
    const [first, second] = Array.from(
      win.document.querySelectorAll<HTMLElement>('mark.search-highlight'),
    );

    now = 1000;
    intersect(first);
    expect(second.getAttribute('data-sweep')).toBe('pending');
    now = 1100;
    intersect(second);
    expect(second.style.getPropertyValue('--search-highlight-delay')).toBe(
      '110ms',
    );

    // A highlight sweeps once, even if it scrolls out and back into view
    first.setAttribute('data-sweep', 'done');
    now = 5000;
    intersect(first);
    expect(first.getAttribute('data-sweep')).toBe('done');
  });

  test('fits highlights that appear together into one short pass', async () => {
    const { win } = create(
      'http://localhost/page.html?pagefind-highlight=odd',
      `<main data-pagefind-body>${'<p>odd</p>'.repeat(10)}</main>`,
    );
    await mount(win);
    const marks = Array.from(
      win.document.querySelectorAll<HTMLElement>('mark.search-highlight'),
    );
    expect(marks).toHaveLength(10);

    intersect(...marks);
    const ms = (mark: HTMLElement, name: string) =>
      Number.parseFloat(mark.style.getPropertyValue(name));
    const timings = marks.map(mark => ({
      delay: ms(mark, '--search-highlight-delay'),
      duration: ms(mark, '--search-highlight-duration'),
    }));
    const last = timings[timings.length - 1];
    expect(last.delay + last.duration).toBeLessThanOrEqual(1000);
    // Still one stroke after another, in reading order
    for (let i = 1; i < timings.length; i++) {
      expect(timings[i].delay).toBeGreaterThanOrEqual(
        timings[i - 1].delay + timings[i - 1].duration,
      );
    }
  });

  test('finishes every highlight within a second of it coming into view', async () => {
    const { win } = create(
      'http://localhost/page.html?pagefind-highlight=odd',
      `<main data-pagefind-body>${'<p>odd</p>'.repeat(20)}</main>`,
    );
    await mount(win);
    const marks = Array.from(
      win.document.querySelectorAll<HTMLElement>('mark.search-highlight'),
    );
    const end = (mark: HTMLElement) =>
      Number.parseFloat(
        mark.style.getPropertyValue('--search-highlight-delay'),
      ) +
      Number.parseFloat(
        mark.style.getPropertyValue('--search-highlight-duration'),
      );

    now = 0;
    intersect(...marks.slice(0, 10));
    // More come into view while the first pass is still running
    now = 100;
    intersect(...marks.slice(10));
    for (const mark of marks.slice(10)) {
      expect(end(mark)).toBeLessThanOrEqual(1000);
    }
    expect(
      Number.parseFloat(
        marks[10].style.getPropertyValue('--search-highlight-delay'),
      ),
    ).toBeLessThanOrEqual(300);
  });

  test('joins words separated only by spaces into one stroke', async () => {
    const { win } = create(
      'http://localhost/page.html?pagefind-highlight=odd&pagefind-highlight=number',
      `<main data-pagefind-body>
        <p id="joined">An odd number here.</p>
        <p id="apart">An odd <em>number</em> there.</p>
      </main>`,
    );
    await mount(win);

    expect(
      Array.from(
        win.document.querySelectorAll('#joined mark.search-highlight'),
        mark => mark.textContent,
      ),
    ).toEqual(['odd number']);
    expect(win.document.querySelector('#joined')?.textContent).toBe(
      'An odd number here.',
    );
    // Words in different elements stay separate strokes
    expect(
      win.document.querySelectorAll('#apart mark.search-highlight'),
    ).toHaveLength(2);
  });

  test('tolerates a highlight that is the last node in its element', async () => {
    // Pagefind leaves an empty text node after each mark; without one, the
    // mark has no next sibling
    importModule = mock(async () => ({
      default: class extends FakePagefindHighlight {
        constructor(options: FakeOptions) {
          super(options);
          currentWindow.document.body.normalize();
        }
      },
    }));
    const { win, scrolled, revealed } = create(
      'http://localhost/page.html?pagefind-highlight=odd',
      `<main data-pagefind-body><p>A number is <em>odd</em></p></main>`,
    );
    await mount(win);

    const mark = win.document.querySelector('em > mark.search-highlight');
    expect(mark?.nextSibling).toBeNull();
    expect(revealed).toEqual([mark!]);
    expect(scrolled).toEqual([mark!]);
  });

  test('leaves a restored scroll position alone', async () => {
    const { win, scrolled, revealed } = create(
      'http://localhost/page.html?pagefind-highlight=odd',
      PAGE,
    );
    // Back, Forward, and dev refreshes restore the page's scroll position
    setScrollRestored(true);
    await mount(win);
    expect(revealed).toHaveLength(1);
    expect(scrolled).toEqual([]);
  });

  test('scrolls to the first highlight again after a reload', async () => {
    const { win, scrolled } = create(
      'http://localhost/page.html?pagefind-highlight=odd',
      PAGE,
    );
    await mount(win);
    // A reload keeps the entry's history state, but no scroll position
    win.document.body.innerHTML = PAGE;
    await mount(win);
    expect(scrolled).toHaveLength(2);
  });

  test('skips highlights in a tab that would hide the target', async () => {
    const { win, revealed } = create(
      'http://localhost/page.html?pagefind-highlight=odd#target',
      `<main data-pagefind-body>
        <div class="tabs"><div class="tabs-panels">
          <div class="tabs-panel"><h3 id="target">Target</h3></div>
          <div class="tabs-panel"><p id="sibling">odd sibling</p></div>
        </div></div>
        <p id="after">odd after</p>
      </main>`,
    );
    await mount(win);

    expect(revealed.map(mark => mark.parentElement?.id)).toEqual(['after']);
  });

  test('does not highlight the MathML copy of math', async () => {
    const { win, scrolled } = create(
      'http://localhost/page.html?pagefind-highlight=odd',
      `<main data-pagefind-body>
        <span class="katex"><span class="katex-mathml"><span>odd math</span></span><span class="katex-html">odd html</span></span>
      </main>`,
    );
    await mount(win);

    // MathML duplicates the visible math for assistive technology only
    expect(win.document.querySelector('.katex-mathml mark')).toBeNull();
    expect(scrolled.map(mark => mark.parentElement?.className)).toEqual([
      'katex-html',
    ]);
  });

  test('skips highlights inside closed details', async () => {
    const { win, scrolled, revealed } = create(
      'http://localhost/page.html?pagefind-highlight=odd',
      `<main data-pagefind-body>
        <details><summary>More</summary><p>odd details</p></details>
        <details open><summary>Open</summary><p id="open">odd open</p></details>
      </main>`,
    );
    await mount(win);

    expect(scrolled.map(mark => mark.parentElement?.id)).toEqual(['open']);
    expect(revealed).toEqual(scrolled);
  });

  test('still highlights after a same-page fragment change', async () => {
    const { win } = create(
      'http://localhost/page.html?pagefind-highlight=odd',
      PAGE,
    );
    importModule = mock(async () => {
      win.location.hash = '#section';
      return { default: FakePagefindHighlight };
    });
    await mount(win);
    expect(win.document.querySelector('mark.search-highlight')).not.toBeNull();
  });

  test('does not highlight a page the visitor already left', async () => {
    const { win } = create(
      'http://localhost/page.html?pagefind-highlight=odd',
      PAGE,
    );
    importModule = mock(async () => {
      win.history.pushState(null, '', '/other.html');
      return { default: FakePagefindHighlight };
    });
    await mount(win);
    expect(highlightOptions).toBeNull();
    expect(win.document.querySelector('mark')).toBeNull();
  });
});
