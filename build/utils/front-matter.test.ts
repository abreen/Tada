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

  test('parses standard YAML front matter with --- delimiters', () => {
    const raw = '---\ntitle: Hello\nauthor: Alice\n---\nBody content here.';
    const result = parseFrontMatter(raw, '.md');
    expect(result.frontMatter).toBe('title: Hello\nauthor: Alice');
    expect(result.content).toBe('Body content here.');
  });

  test('parses standard format with blank line after closing delimiter', () => {
    const raw = '---\ntitle: Hello\n---\n\nBody content here.';
    const result = parseFrontMatter(raw, '.md');
    expect(result.frontMatter).toBe('title: Hello');
    expect(result.content).toBe('\nBody content here.');
  });

  test('parses standard format with blank lines inside front matter', () => {
    const raw = '---\ntitle: Hello\n\nauthor: Alice\n---\nBody.';
    const result = parseFrontMatter(raw, '.md');
    expect(result.frontMatter).toBe('title: Hello\n\nauthor: Alice');
    expect(result.content).toBe('Body.');
  });

  test('parses standard format with .html extension', () => {
    const raw = '---\ntitle: Page\nlayout: full\n---\n<h1>Hi</h1>';
    const result = parseFrontMatter(raw, '.html');
    expect(result.frontMatter).toBe('title: Page\nlayout: full');
    expect(result.content).toBe('<h1>Hi</h1>');
  });

  test('parses standard format with Windows line endings', () => {
    const raw = '---\r\ntitle: Hello\r\n---\r\nBody.';
    const result = parseFrontMatter(raw, '.md');
    expect(result.frontMatter).toBe('title: Hello');
    expect(result.content).toBe('Body.');
  });

  test('parses standard format with empty front matter', () => {
    const raw = '---\n---\nBody only.';
    const result = parseFrontMatter(raw, '.md');
    expect(result.frontMatter).toBe('');
    expect(result.content).toBe('Body only.');
  });

  test('throws on standard format with no closing delimiter', () => {
    const raw = '---\ntitle: Hello\nBody without closing.';
    expect(() => parseFrontMatter(raw, '.md')).toThrow(/closing.*---/i);
  });

  test('does not treat horizontal rule inside body as front matter', () => {
    const raw = 'title: Hello\n\nFirst paragraph.\n\n---\n\nSecond paragraph.';
    const result = parseFrontMatter(raw, '.md');
    expect(result.frontMatter).toBe('title: Hello');
    expect(result.content).toBe(
      '\nFirst paragraph.\n\n---\n\nSecond paragraph.',
    );
  });

  test('accepts trailing whitespace on closing --- delimiter', () => {
    const raw = '---\ntitle: Hello\n---  \nBody.';
    const result = parseFrontMatter(raw, '.md');
    expect(result.frontMatter).toBe('title: Hello');
    expect(result.content).toBe('Body.');
  });

  test('accepts trailing whitespace on opening --- delimiter', () => {
    const raw = '---  \ntitle: Hello\n---\nBody.';
    const result = parseFrontMatter(raw, '.md');
    expect(result.frontMatter).toBe('title: Hello');
    expect(result.content).toBe('Body.');
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

  test('parses standard YAML front matter into pageVariables', () => {
    const raw = '---\ntitle: Hello World\nauthor: Bob\n---\n# Main Content';
    const result = parseFrontMatterAndContent(raw, '.md');
    expect(result.pageVariables.title).toBe('Hello World');
    expect(result.pageVariables.author).toBe('Bob');
    expect(result.content).toContain('# Main Content');
  });

  test('parses standard format with boolean and numeric values', () => {
    const raw = '---\ntoc: true\norder: 5\n---\nContent.';
    const result = parseFrontMatterAndContent(raw, '.md');
    expect(result.pageVariables.toc).toBe(true);
    expect(result.pageVariables.order).toBe(5);
  });
});
