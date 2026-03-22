import { describe, expect, test } from 'bun:test';
import { generateTocHtml, generateCodeTocHtml } from './toc-plugin';
import type { JavaTocEntry } from './types';

describe('generateTocHtml', () => {
  test('returns empty string for empty array', () => {
    expect(generateTocHtml([])).toBe('');
  });

  test('returns empty string for null/undefined', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(generateTocHtml(null as any)).toBe('');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(generateTocHtml(undefined as any)).toBe('');
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
      { kind: 'alert', type: 'warning', title: 'Caution' },
    ]);
    expect(html).toContain('class="alert-item level3 warning"');
    expect(html).toContain('Caution');
  });

  test('alert before any heading uses level 2 (lastHeadingLevel defaults to 1)', () => {
    const html = generateTocHtml([
      { kind: 'alert', type: 'note', title: 'Note' },
    ]);
    expect(html).toContain('class="alert-item level2 note"');
  });

  test('handles mixed items in order', () => {
    const html = generateTocHtml([
      { kind: 'heading', level: '2', id: 'a', innerHtml: 'A' },
      { kind: 'dinkus' },
      { kind: 'heading', level: '3', id: 'b', innerHtml: 'B' },
      { kind: 'alert', type: 'note', title: 'FYI' },
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
