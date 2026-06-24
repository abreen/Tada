import { describe, expect, test } from 'bun:test';
import { createMarkdown, footnoteLabel } from './utils/markdown';
import type { SiteVariables } from './types';

describe('front matter inline Markdown', () => {
  test('renders inline formatting and smart typography', () => {
    const markdown = createMarkdown({} as SiteVariables);
    expect(markdown.renderInline('A **bold** "title"')).toBe(
      'A <strong>bold</strong> “title”',
    );
  });
});

describe('footnoteLabel', () => {
  test('uses digits followed by capital letters', () => {
    expect(footnoteLabel(1)).toBe('1');
    expect(footnoteLabel(9)).toBe('9');
    expect(footnoteLabel(10)).toBe('A');
    expect(footnoteLabel(35)).toBe('Z');
  });

  test('enforces the single-character range', () => {
    expect(() => footnoteLabel(0)).toThrow(/at most 35 footnotes/);
    expect(() => footnoteLabel(36)).toThrow(/at most 35 footnotes/);
  });
});
