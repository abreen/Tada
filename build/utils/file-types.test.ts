import { describe, expect, test } from 'bun:test';
import {
  getProcessedExtensions,
  extensionIsMarkdown,
  extensionIsMdx,
  extensionIsMdxContent,
  extensionIsPlainTextPage,
  isLiterateJava,
  isPartial,
} from './file-types';

describe('getProcessedExtensions', () => {
  test('includes md, markdown, html, and custom extensions', () => {
    expect(getProcessedExtensions(['java'])).toEqual([
      'md',
      'markdown',
      'mdx',
      'html',
      'java',
    ]);
  });

  test('works with empty code extensions', () => {
    expect(getProcessedExtensions([])).toEqual([
      'md',
      'markdown',
      'mdx',
      'html',
    ]);
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

  test('returns false for .mdx', () => {
    expect(extensionIsMarkdown('.mdx')).toBe(false);
  });

  test('returns false for .txt', () => {
    expect(extensionIsMarkdown('.txt')).toBe(false);
  });
});

describe('extensionIsMdx', () => {
  test('returns true for .mdx', () => {
    expect(extensionIsMdx('.mdx')).toBe(true);
  });

  test('returns false for Markdown and HTML', () => {
    expect(extensionIsMdx('.md')).toBe(false);
    expect(extensionIsMdx('.html')).toBe(false);
  });
});

describe('extensionIsMdxContent', () => {
  test('returns true for every Markdown content extension', () => {
    expect(extensionIsMdxContent('.md')).toBe(true);
    expect(extensionIsMdxContent('.markdown')).toBe(true);
    expect(extensionIsMdxContent('.mdx')).toBe(true);
  });

  test('returns false for HTML and copied content', () => {
    expect(extensionIsMdxContent('.html')).toBe(false);
    expect(extensionIsMdxContent('.txt')).toBe(false);
  });
});

describe('extensionIsPlainTextPage', () => {
  test('returns true for Markdown, MDX, and HTML page extensions', () => {
    expect(extensionIsPlainTextPage('.md')).toBe(true);
    expect(extensionIsPlainTextPage('.markdown')).toBe(true);
    expect(extensionIsPlainTextPage('.mdx')).toBe(true);
    expect(extensionIsPlainTextPage('.html')).toBe(true);
  });

  test('returns false for copied content extensions', () => {
    expect(extensionIsPlainTextPage('.txt')).toBe(false);
  });
});

describe('isPartial', () => {
  test('returns true for files starting with _', () => {
    expect(isPartial('_foo.md')).toBe(true);
    expect(isPartial('/content/subdir/_bar.html')).toBe(true);
  });

  test('returns false for regular files', () => {
    expect(isPartial('index.md')).toBe(false);
    expect(isPartial('/content/page.html')).toBe(false);
  });

  test('handles paths with directories', () => {
    expect(isPartial('/content/lectures/02/_pr1.md')).toBe(true);
    expect(isPartial('/content/lectures/02/subdir/_foobar.html')).toBe(true);
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
