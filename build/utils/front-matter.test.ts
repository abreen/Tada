import { describe, expect, test } from 'bun:test';
import { parseFrontMatterAndContent, parseFrontMatter } from './front-matter';

describe('parseFrontMatter', () => {
  test('parses markdown front matter separated by blank line', () => {
    const raw = 'title: Hello\nauthor: Alice\n\nBody content here.';
    const result = parseFrontMatter(raw, '.md');
    expect(result.frontMatter).toBe('title: Hello\nauthor: Alice');
    expect(result.content).toBe('\nBody content here.');
  });

  test('handles .markdown extension', () => {
    const raw = 'title: Test\n\nContent.';
    const result = parseFrontMatter(raw, '.markdown');
    expect(result.frontMatter).toBe('title: Test');
  });

  test('handles .html extension', () => {
    const raw = 'title: Page\nlayout: full\n\n<h1>Hi</h1>';
    const result = parseFrontMatter(raw, '.html');
    expect(result.frontMatter).toBe('title: Page\nlayout: full');
    expect(result.content).toBe('\n<h1>Hi</h1>');
  });

  test('returns null frontMatter for unknown extensions', () => {
    const raw = 'title: Nope\n\nContent';
    const result = parseFrontMatter(raw, '.txt');
    expect(result.frontMatter).toBe(null);
    expect(result.content).toBe(raw);
  });

  test('returns null frontMatter when content starts with blank line', () => {
    const raw = '\nNo front matter here.';
    const result = parseFrontMatter(raw, '.md');
    expect(result.frontMatter).toBe(null);
    expect(result.content).toBe(raw);
  });

  test('handles YAML multiline pipe syntax', () => {
    const raw =
      'title: Hello\ndescription: |\n  This is a\n  multiline value\n\nBody.';
    const result = parseFrontMatter(raw, '.md');
    expect(result.frontMatter).toContain('description: |');
    expect(result.frontMatter).toContain('  This is a');
    expect(result.frontMatter).toContain('  multiline value');
  });
});

describe('parseFrontMatterAndContent', () => {
  test('returns parsed pageVariables and content', () => {
    const raw = 'title: Hello World\nauthor: Bob\n\n# Main Content';
    const result = parseFrontMatterAndContent(raw, '.md');
    expect(result.pageVariables.title).toBe('Hello World');
    expect(result.pageVariables.author).toBe('Bob');
    expect(result.content).toContain('# Main Content');
  });

  test('handles content with no front matter fields', () => {
    const raw = '\nJust content, no front matter.';
    const result = parseFrontMatterAndContent(raw, '.md');
    expect(result.pageVariables).toEqual({});
    expect(result.content).toBe(raw);
  });

  test('handles boolean and numeric front matter values', () => {
    const raw = 'toc: true\norder: 5\n\nContent.';
    const result = parseFrontMatterAndContent(raw, '.md');
    expect(result.pageVariables.toc).toBe(true);
    expect(result.pageVariables.order).toBe(5);
  });

  test('handles Windows-style line endings', () => {
    const raw = 'title: Hello\r\n\r\nBody content.';
    const result = parseFrontMatterAndContent(raw, '.md');
    expect(result.pageVariables.title).toBe('Hello');
  });
});
