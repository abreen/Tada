import { describe, expect, test } from 'bun:test';
import {
  getProcessedExtensions,
  extensionIsMarkdown,
  isLiterateJava,
} from './file-types.js';

describe('getProcessedExtensions', () => {
  test('includes md, markdown, html, and custom extensions', () => {
    expect(getProcessedExtensions(['java'])).toEqual([
      'md',
      'markdown',
      'html',
      'java',
    ]);
  });

  test('works with empty code extensions', () => {
    expect(getProcessedExtensions([])).toEqual(['md', 'markdown', 'html']);
  });
});

describe('extensionIsMarkdown', () => {
  test('returns true for .md', () => {
    expect(extensionIsMarkdown('.md')).toBe(true);
  });

  test('returns true for .markdown', () => {
    expect(extensionIsMarkdown('.markdown')).toBe(true);
  });

  test('returns false for .html', () => {
    expect(extensionIsMarkdown('.html')).toBe(false);
  });

  test('returns false for .txt', () => {
    expect(extensionIsMarkdown('.txt')).toBe(false);
  });
});

describe('isLiterateJava', () => {
  test('returns true for .java.md files', () => {
    expect(isLiterateJava('Example.java.md')).toBe(true);
  });

  test('case insensitive', () => {
    expect(isLiterateJava('Example.JAVA.MD')).toBe(true);
  });

  test('returns false for plain .md files', () => {
    expect(isLiterateJava('readme.md')).toBe(false);
  });

  test('returns false for .java files', () => {
    expect(isLiterateJava('Example.java')).toBe(false);
  });

  test('handles paths with directories', () => {
    expect(isLiterateJava('/content/code/Example.java.md')).toBe(true);
  });
});
