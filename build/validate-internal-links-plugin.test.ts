import { describe, expect, test } from 'bun:test';
import MarkdownIt from 'markdown-it';
import validateInternalLinks from './validate-internal-links-plugin';

function createMd(
  validTargets: string[],
  options: { sourceUrlPath?: string; codeExtensions?: string[] } = {},
) {
  const md = new MarkdownIt({ html: true });
  md.use(validateInternalLinks, {
    enabled: true,
    filePath: 'test.md',
    sourceUrlPath: options.sourceUrlPath ?? '/test.html',
    validTargets: new Set(validTargets),
    codeExtensions: options.codeExtensions ?? [],
  });
  return md;
}

describe('validateInternalLinks', () => {
  test('does nothing when disabled', () => {
    const md = new MarkdownIt();
    md.use(validateInternalLinks, { enabled: false });
    expect(() => md.render('[link](/missing.html)')).not.toThrow();
  });

  test('throws when required options are missing', () => {
    const md = new MarkdownIt();
    expect(() => {
      md.use(validateInternalLinks, { enabled: true });
      md.render('test');
    }).toThrow('requires filePath');
  });

  test('allows valid internal links', () => {
    const md = createMd(['/about.html']);
    expect(() => md.render('[About](/about.html)')).not.toThrow();
  });

  test('allows external links', () => {
    const md = createMd([]);
    expect(() => md.render('[Google](https://google.com)')).not.toThrow();
  });

  test('allows anchor links', () => {
    const md = createMd([]);
    expect(() => md.render('[Section](#top)')).not.toThrow();
  });

  test('allows mailto links', () => {
    const md = createMd([]);
    expect(() => md.render('[Email](mailto:test@example.com)')).not.toThrow();
  });

  test('throws for broken internal link', () => {
    const md = createMd(['/about.html']);
    expect(() => md.render('[Missing](/missing.html)')).toThrow(
      'broken internal link',
    );
  });

  test('strips query and hash before validating', () => {
    const md = createMd(['/page.html']);
    expect(() => md.render('[Page](/page.html?v=1#section)')).not.toThrow();
  });

  test('resolves relative links from source path', () => {
    const md = createMd(['/docs/guide.html'], {
      sourceUrlPath: '/docs/index.html',
    });
    expect(() => md.render('[Guide](guide.html)')).not.toThrow();
  });

  test('throws for broken relative link', () => {
    const md = createMd(['/docs/guide.html'], {
      sourceUrlPath: '/docs/index.html',
    });
    expect(() => md.render('[Missing](missing.html)')).toThrow(
      'broken internal link',
    );
  });

  test('resolves code file links to .ext.html pages', () => {
    const md = createMd(['/src/App.java.html'], { codeExtensions: ['java'] });
    expect(() => md.render('[App](/src/App.java)')).not.toThrow();
  });

  test('throws for link missing the code extension', () => {
    const md = createMd(['/src/App.java.html'], { codeExtensions: ['java'] });
    expect(() => md.render('[App](/src/App.html)')).toThrow(
      'broken internal link',
    );
  });

  test('detects directory links that should reference index.html', () => {
    const md = createMd(['/docs/index.html']);
    // The plugin logs the "directory link" message and throws a generic
    // "broken internal link(s)" error, so match the thrown message.
    expect(() => md.render('[Docs](/docs)')).toThrow('broken internal link');
  });

  test('validates links in raw HTML blocks', () => {
    const md = createMd(['/about.html']);
    expect(() => md.render('<a href="/missing.html">link</a>')).toThrow(
      'broken internal link',
    );
  });

  test('allows protocol-relative URLs', () => {
    const md = createMd([]);
    expect(() => md.render('[CDN](//cdn.example.com/lib.js)')).not.toThrow();
  });

  test('throws for .java.html link when code feature is disabled', () => {
    // When features.code is false, codeExtensions is [] and no code pages
    // are generated. Only the raw .java file exists as a valid target.
    const md = createMd(['/src/Rectangle.java'], { codeExtensions: [] });
    expect(() => md.render('[Rect](/src/Rectangle.java.html)')).toThrow(
      'broken internal link',
    );
  });

  test('throws for .py.html link when code feature is disabled', () => {
    const md = createMd(['/src/demo.py'], { codeExtensions: [] });
    expect(() => md.render('[Demo](/src/demo.py.html)')).toThrow(
      'broken internal link',
    );
  });

  test('allows .java link to raw file when code feature is disabled', () => {
    const md = createMd(['/src/Rectangle.java'], { codeExtensions: [] });
    expect(() => md.render('[Rect](/src/Rectangle.java)')).not.toThrow();
  });

  test('allows .java link to public file when code feature is enabled', () => {
    // Public files with code extensions are copied as-is; only the raw
    // path exists in valid targets, not the .html version.
    const md = createMd(['/Test.java'], { codeExtensions: ['java'] });
    expect(() => md.render('[Test](/Test.java)')).not.toThrow();
  });
});
