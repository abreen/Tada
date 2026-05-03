import { describe, expect, test } from 'bun:test';
import { JSDOM } from 'jsdom';
import {
  alertToTableItem,
  getHighlightIndexes,
  headingToTableItem,
  switchCurrent,
  type Alert,
  type Dinkus,
  type Heading,
} from './model';

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
    expect(headingToTableItem(el)).toEqual({
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
    expect(headingToTableItem(el).innerHtml).toBe('<em>Bold</em> title');
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
