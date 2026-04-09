import { describe, expect, test } from 'bun:test';
import { JSDOM } from 'jsdom';
import mount, {
  getHighlightIndexes,
  headingToTableItem,
  alertToTableItem,
  switchCurrent,
  type Heading,
  type Alert,
  type Dinkus,
} from './index';

function dom(html: string) {
  return new JSDOM(`<body>${html}</body>`);
}

describe('getHighlightIndexes', () => {
  test('maps headings to their own index', () => {
    const items: Heading[] = [
      { level: '1', id: 'a', innerHtml: 'A' },
      { level: '2', id: 'b', innerHtml: 'B' },
    ];
    expect(getHighlightIndexes(items)).toEqual([0, 1]);
  });

  test('maps alerts to the preceding heading index', () => {
    const items: (Heading | Alert)[] = [
      { level: '1', id: 'a', innerHtml: 'A' },
      { type: 'warning', title: 'Watch out' },
      { level: '2', id: 'b', innerHtml: 'B' },
    ];
    expect(getHighlightIndexes(items)).toEqual([0, 0, 2]);
  });

  test('alert before any heading gets its own index', () => {
    const items: (Heading | Alert)[] = [
      { type: 'note', title: 'FYI' },
      { level: '1', id: 'a', innerHtml: 'A' },
    ];
    expect(getHighlightIndexes(items)).toEqual([0, 1]);
  });

  test('skips dinkus items entirely', () => {
    const items: (Heading | Dinkus)[] = [
      { level: '1', id: 'a', innerHtml: 'A' },
      { type: 'dinkus' },
      { level: '2', id: 'b', innerHtml: 'B' },
    ];
    expect(getHighlightIndexes(items)).toEqual([0, 1]);
  });

  test('returns empty array for empty input', () => {
    expect(getHighlightIndexes([])).toEqual([]);
  });
});

describe('headingToTableItem', () => {
  test('extracts level and innerHTML from a heading', () => {
    const { document } = dom('<h2 id="intro">Introduction</h2>').window;
    const el = document.querySelector('h2') as HTMLHeadingElement;
    const result = headingToTableItem(el);
    expect(result).toEqual({
      level: '2',
      id: 'intro',
      innerHtml: 'Introduction',
    });
  });

  test('separates subtitle from main text', () => {
    const { document } = dom(
      '<h3 id="s"><span class="heading-subtitle">v2</span>Setup</h3>',
    ).window;
    const el = document.querySelector('h3') as HTMLHeadingElement;
    const result = headingToTableItem(el);
    expect(result.level).toBe('3');
    expect(result.id).toBe('s');
    expect(result.innerHtml).toContain('Setup');
    expect(result.innerHtml).toContain('heading-subtitle');
  });

  test('uses innerHTML when no subtitle', () => {
    const { document } = dom('<h1 id="top"><em>Bold</em> title</h1>').window;
    const el = document.querySelector('h1') as HTMLHeadingElement;
    const result = headingToTableItem(el);
    expect(result.innerHtml).toBe('<em>Bold</em> title');
  });
});

describe('alertToTableItem', () => {
  test('returns warning alert with custom title', () => {
    const { document } = dom(
      '<div class="alert warning"><span class="title">Danger</span></div>',
    ).window;
    const el = document.querySelector('.alert') as HTMLElement;
    expect(alertToTableItem(el)).toEqual({ type: 'warning', title: 'Danger' });
  });

  test('returns note alert with default title', () => {
    const { document } = dom('<div class="alert note">Some note</div>').window;
    const el = document.querySelector('.alert') as HTMLElement;
    expect(alertToTableItem(el)).toEqual({ type: 'note', title: 'Note' });
  });

  test('returns default Warning title when no .title element', () => {
    const { document } = dom(
      '<div class="alert warning">Text only</div>',
    ).window;
    const el = document.querySelector('.alert') as HTMLElement;
    expect(alertToTableItem(el)).toEqual({ type: 'warning', title: 'Warning' });
  });

  test('returns null for non-warning/note alert types', () => {
    const { document } = dom('<div class="alert info">Some info</div>').window;
    const el = document.querySelector('.alert') as HTMLElement;
    expect(alertToTableItem(el)).toBeNull();
  });
});

describe('switchCurrent', () => {
  test('adds current class to new element', () => {
    const { document } = dom('<li>A</li><li>B</li>').window;
    const items = document.querySelectorAll('li');
    switchCurrent(null, items[0] as HTMLElement);
    expect(items[0].classList.contains('current')).toBe(true);
  });

  test('removes current from old and adds to new', () => {
    const { document } = dom('<li class="current">A</li><li>B</li>').window;
    const items = document.querySelectorAll('li');
    switchCurrent(items[0] as HTMLElement, items[1] as HTMLElement);
    expect(items[0].classList.contains('current')).toBe(false);
    expect(items[1].classList.contains('current')).toBe(true);
  });
});

describe('toc mount', () => {
  test('returns early when no nav.toc exists', () => {
    const win = dom('<div>No toc</div>').window;
    const cleanup = mount(win);
    expect(cleanup).toBeUndefined();
  });

  test('returns early when toc has no links', () => {
    const win = dom('<nav class="toc"><ol></ol></nav>').window;
    const cleanup = mount(win);
    expect(cleanup).toBeUndefined();
  });

  describe('code page', () => {
    function createCodePage(hash = '') {
      const html =
        '<nav class="toc"><ol>' +
        '<li><a href="#L1">main</a></li>' +
        '<li><a href="#L10">helper</a></li>' +
        '<li><a href="#L20">util</a></li>' +
        '</ol></nav>' +
        '<div class="body"></div>';
      return new JSDOM(`<body class="code">${html}</body>`, {
        url: `http://localhost/${hash}`,
      }).window;
    }

    test('highlights the matching toc entry for the current hash', () => {
      const win = createCodePage('#L10');
      mount(win);

      const items = win.document.querySelectorAll('nav.toc ol li');
      expect(items[1].classList.contains('current')).toBe(true);
    });

    test('highlights nearest entry when hash is between line ranges', () => {
      const win = createCodePage('#L15');
      mount(win);

      const items = win.document.querySelectorAll('nav.toc ol li');
      expect(items[1].classList.contains('current')).toBe(true);
    });

    test('parses range hashes like #L5-L10', () => {
      const win = createCodePage('#L5-L10');
      mount(win);

      const items = win.document.querySelectorAll('nav.toc ol li');
      expect(items[0].classList.contains('current')).toBe(true);
    });

    test('no current item when hash has no line number', () => {
      const win = createCodePage('');
      mount(win);

      const current = win.document.querySelector('nav.toc .current');
      expect(current).toBeNull();
    });

    test('cleanup removes hashchange listener', () => {
      const win = createCodePage('#L1');
      const cleanup = mount(win);

      expect(typeof cleanup).toBe('function');
      cleanup!();
    });
  });

  describe('regular page', () => {
    function createRegularPage() {
      const html =
        '<nav class="toc"><ol>' +
        '<li><a href="#intro">Introduction</a></li>' +
        '<li><a href="#setup">Setup</a></li>' +
        '</ol></nav>' +
        '<div class="body">' +
        '<h2 id="intro">Introduction</h2>' +
        '<p>Content</p>' +
        '<h2 id="setup">Setup</h2>' +
        '<p>More content</p>' +
        '</div>';
      return new JSDOM(`<body>${html}</body>`, { url: 'http://localhost/' })
        .window;
    }

    test('sets a current item on mount', () => {
      const win = createRegularPage();
      mount(win);

      const current = win.document.querySelector('nav.toc .current');
      expect(current).not.toBeNull();
    });

    test('cleanup removes scroll listener', () => {
      const win = createRegularPage();
      const cleanup = mount(win);

      expect(typeof cleanup).toBe('function');
      cleanup!();
    });
  });
});
