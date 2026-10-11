import { describe, expect, test } from 'bun:test';
import { removeHighlightParam } from './param';

describe('removeHighlightParam', () => {
  test.each([
    ['/a.pdf?pagefind-highlight=odd#page=2', '/a.pdf#page=2'],
    ['/a.pdf?pagefind-highlight=odd&pagefind-highlight=even', '/a.pdf'],
    ['/a.pdf?v=1&pagefind-highlight=odd', '/a.pdf?v=1'],
    ['https://x.test/a.pdf?pagefind-highlight=odd', 'https://x.test/a.pdf'],
    ['/a.pdf#page=2', '/a.pdf#page=2'],
    ['/a.pdf', '/a.pdf'],
  ])('%s becomes %s', (url, expected) => {
    expect(removeHighlightParam(url)).toBe(expected);
  });
});
