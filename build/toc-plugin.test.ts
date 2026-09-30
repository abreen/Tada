import { describe, expect, test } from 'bun:test';
import { generateTocHtml, generateCodeTocHtml } from './toc-plugin';
import type { JavaTocEntry } from './types';
import { createMarkdown } from './utils/markdown';

describe('generateTocHtml', () => {
  test('returns empty string for empty array', () => {
    expect(generateTocHtml([])).toBe('');
  });

  test('generates heading items with correct level and link', () => {
    const html = generateTocHtml([
      { kind: 'heading', level: '2', id: 'intro', innerHtml: 'Introduction' },
    ]);
    expect(html).toContain('<ol>');
    expect(html).toContain('class="heading-item level2"');
    expect(html).toContain('href="#intro"');
    expect(html).toContain('Introduction');
    expect(html).toContain('</ol>');
  });

  test('generates dinkus items', () => {
    const html = generateTocHtml([{ kind: 'dinkus' }]);
    expect(html).toContain('class="dinkus-item"');
  });

  test('generates alert items at one level deeper than last heading', () => {
    const html = generateTocHtml([
      { kind: 'heading', level: '2', id: 'sec', innerHtml: 'Section' },
      { kind: 'alert', type: 'warning', title: 'Caution', id: 'caution' },
    ]);
    expect(html).toContain('class="alert-item level3 warning"');
    expect(html).toContain('href="#caution"');
    expect(html).toContain('Caution');
  });

  test('alert before any heading uses level 2 (lastHeadingLevel defaults to 1)', () => {
    const html = generateTocHtml([
      { kind: 'alert', type: 'note', title: 'Note', id: 'note' },
    ]);
    expect(html).toContain('class="alert-item level2 note"');
    expect(html).toContain('href="#note"');
  });

  test('alert links use deduplicated IDs', () => {
    const html = generateTocHtml([
      { kind: 'alert', type: 'note', title: 'Note', id: 'note' },
      { kind: 'alert', type: 'note', title: 'Note', id: 'note-2' },
    ]);
    expect(html).toContain('href="#note"');
    expect(html).toContain('href="#note-2"');
  });

  test('handles mixed items in order', () => {
    const html = generateTocHtml([
      { kind: 'heading', level: '2', id: 'a', innerHtml: 'A' },
      { kind: 'dinkus' },
      { kind: 'heading', level: '3', id: 'b', innerHtml: 'B' },
      { kind: 'alert', type: 'note', title: 'FYI', id: 'fyi' },
    ]);
    expect(html).toContain('level2');
    expect(html).toContain('dinkus-item');
    expect(html).toContain('level3');
    expect(html).toContain('level4');
  });
});

describe('generateCodeTocHtml', () => {
  test('returns empty string for empty array', () => {
    expect(generateCodeTocHtml([])).toBe('');
  });

  test('returns empty string for null/undefined', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(generateCodeTocHtml(null as any)).toBe('');
  });

  test('generates grouped entries with labels', () => {
    const items: JavaTocEntry[] = [
      { kind: 'field', label: 'x', name: 'x', line: 5 },
      { kind: 'method', label: 'getX()', name: 'getX()', line: 10 },
    ];
    const html = generateCodeTocHtml(items);
    expect(html).toContain('Fields');
    expect(html).toContain('Methods');
    expect(html).toContain('href="#L5"');
    expect(html).toContain('href="#L10"');
  });

  test('groups items by kind in order of appearance', () => {
    const items: JavaTocEntry[] = [
      { kind: 'method', label: 'foo()', name: 'foo()', line: 1 },
      { kind: 'constructor', label: 'Bar()', name: 'Bar()', line: 5 },
      { kind: 'method', label: 'baz()', name: 'baz()', line: 10 },
    ];
    const html = generateCodeTocHtml(items);
    const methodsPos = html.indexOf('Methods');
    const constructorsPos = html.indexOf('Constructors');
    expect(methodsPos).toBeLessThan(constructorsPos);
  });

  test('escapes HTML in names', () => {
    const items: JavaTocEntry[] = [
      { kind: 'method', label: 'compare<T>()', name: 'compare<T>()', line: 1 },
    ];
    const html = generateCodeTocHtml(items);
    expect(html).toContain('compare&lt;T&gt;()');
    expect(html).not.toContain('compare<T>()');
  });
});

describe('collected alert targets', () => {
  test.each(['Nested', 'Visible'])(
    'keeps the visible alert target when an excluded alert is titled %s',
    nestedTitle => {
      const md = createMarkdown({
        base: 'https://example.edu',
        basePath: '/',
        title: 'Test',
        titlePostfix: '',
        themeColor: 'steelblue',
        defaultTimeZone: 'America/New_York',
        features: {
          search: false,
          favicon: false,
          footer: false,
          pickers: false,
        },
      });
      const env: Record<string, unknown> = {};
      const html = md.render(
        `<<< details More\n\n!!! note "${nestedTitle}"\nHidden in details.\n!!!\n\n<<<\n\n` +
          '!!! note "Visible"\nVisible content.\n!!!\n\n' +
          '::: section\n\n!!! warning "Section alert"\nContent.\n!!!\n\n:::\n',
        env,
      );
      const toc = generateTocHtml(
        env.tocItems as Parameters<typeof generateTocHtml>[0],
      );
      const visibleId = nestedTitle === 'Visible' ? 'visible-2' : 'visible';
      expect(html).toContain(`id="${visibleId}">Visible</p>`);
      expect(toc).toContain(`href="#${visibleId}">Visible</a>`);
      expect(toc).toContain('href="#section-alert">Section alert</a>');
      expect(toc.match(/class="alert-item/g)).toHaveLength(2);
    },
  );
});
