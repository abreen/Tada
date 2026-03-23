import { describe, expect, test } from 'bun:test';
import MarkdownIt from 'markdown-it';
import deflist from 'markdown-it-deflist';
import applyBasePathPlugin from './apply-base-path-plugin';
import deflistIdPlugin from './deflist-id-plugin';
import externalLinksPlugin from './external-links-plugin';
import headingSubtitlePlugin from './heading-subtitle-plugin';
import { createMarkdown } from './utils/markdown';
import { stripHtmlComments, injectKatexStylesheet } from './utils/render';
import type { SiteVariables } from './types';

describe('apply-base-path-plugin', () => {
  test('rewrites internal links, images, and raw html sources', () => {
    const md = new MarkdownIt({ html: true });
    md.use(applyBasePathPlugin, {
      basePath: '/course/',
      codeLanguages: { java: 'java' },
      features: { code: true },
    });

    const html = md.render(
      [
        '[Code](/src/example.java?view=1#top)',
        '',
        '![Image](/images/pic.png)',
        '',
        '<img src="/images/raw.png" alt="Raw">',
        '',
        '<a href="/about/">About</a>',
      ].join('\n'),
    );

    expect(html).toContain('href="/course/src/example.html?view=1#top"');
    expect(html).toContain('src="/course/images/pic.png"');
    expect(html).toContain('src="/course/images/raw.png"');
    expect(html).toContain('href="/course/about/"');
  });

  test('does not rewrite external or relative raw html links', () => {
    const md = new MarkdownIt({ html: true });
    md.use(applyBasePathPlugin, {
      basePath: '/course/',
      codeLanguages: {},
      features: { code: true },
    });

    const html = md.render(
      [
        '<a href="https://example.com/">External</a>',
        '',
        '<a href="relative.html">Relative</a>',
      ].join('\n'),
    );

    expect(html).toContain('href="https://example.com/"');
    expect(html).toContain('href="relative.html"');
  });

  test('rewrites relative code file links without applying base path', () => {
    const md = new MarkdownIt();
    md.use(applyBasePathPlugin, {
      basePath: '/course/',
      codeLanguages: { java: 'java' },
      features: { code: true },
    });

    const html = md.render('[App](./App.java)');

    expect(html).toContain('href="./App.html"');
    expect(html).not.toContain('href="./App.java"');
  });

  test('keeps code file extensions when the code feature is disabled', () => {
    const md = new MarkdownIt();
    md.use(applyBasePathPlugin, {
      basePath: '/course',
      codeLanguages: { java: 'java' },
      features: { code: false },
    });

    const html = md.render('[Code](/src/example.java#L1)');

    expect(html).toContain('href="/course/src/example.java#L1"');
    expect(html).not.toContain('href="/course/src/example.html#L1"');
  });
});

describe('external-links-plugin', () => {
  test('marks external http links without changing internal or non-http links', () => {
    const md = new MarkdownIt();
    md.use(externalLinksPlugin, { internalDomains: ['example.com'] });

    const html = md.render(
      [
        '[External](https://outside.example/docs)',
        '[Internal](https://example.com/docs)',
        '[Mail](mailto:test@example.com)',
      ].join(' '),
    );

    expect(html).toContain(
      '<a href="https://outside.example/docs" class="external" target="_blank">External</a>',
    );
    expect(html).toContain('<a href="https://example.com/docs">Internal</a>');
    expect(html).toContain('<a href="mailto:test@example.com">Mail</a>');
  });
});

describe('heading-subtitle-plugin', () => {
  test('wraps heading subtitles while preserving inline formatting', () => {
    const md = new MarkdownIt();
    md.use(headingSubtitlePlugin);

    const html = md.render('## Title # *Subtitle*').trim();

    expect(html).toBe(
      '<h2 class="has-subtitle">Title <span class="heading-subtitle"><em>Subtitle</em></span></h2>',
    );
  });
});

describe('deflist-id-plugin', () => {
  test('injects unique ids for terms and falls back when a term slug is empty', () => {
    const md = new MarkdownIt();
    md.use(deflist);
    md.use(deflistIdPlugin);

    const html = md.render(
      ['Term 1', ': One', '', 'Term 1', ': Two', '', '!!!', ': Three'].join(
        '\n',
      ),
    );

    expect(html).toContain('<a id="term-1"></a>Term 1');
    expect(html).toContain('<a id="term-1-2"></a>Term 1');
    expect(html).toContain('<a id="term"></a>!!!');
  });
});

describe('custom markdown containers', () => {
  function createProjectMarkdown() {
    return createMarkdown(
      {
        base: '',
        basePath: '/',
        internalDomains: [],
        codeLanguages: {},
        features: { search: true, code: true, favicon: false },
        title: 'Test',
        titlePostfix: ' - Test',
        themeColor: 'steelblue',
        defaultTimeZone: 'America/New_York',
      } as SiteVariables,
      { validatorOptions: { enabled: false } },
    );
  }

  test('renders collapsible details blocks', () => {
    const md = createProjectMarkdown();

    const html = md.render(
      ['<<< details More info', 'Hello', '<<<'].join('\n'),
    );

    expect(html).toContain('<details><summary>More info</summary>');
    expect(html).toContain('<div class="content">');
    expect(html).toContain('<p>Hello</p>');
    expect(html).toContain('</div></details>');
  });

  test('renders collapsible details blocks with inline Markdown in summary', () => {
    const md = createProjectMarkdown();

    const html = md.render(
      ['<<< details More **info**', 'Hello', '<<<'].join('\n'),
    );

    expect(html).toContain(
      '<details><summary>More <strong>info</strong></summary>',
    );
  });

  test('renders section containers as section elements', () => {
    const md = createProjectMarkdown();

    const html = md.render(['::: section', 'Body', ':::'].join('\n'));

    expect(html).toContain('<section>');
    expect(html).toContain('<p>Body</p>');
    expect(html).toContain('</section>');
  });

  test('renders questions with question and spoiler answer', () => {
    const md = createProjectMarkdown();

    const html = md.render(
      [
        '??? question What is a data structure?',
        'An organized collection.',
        '???',
      ].join('\n'),
    );

    expect(html).toContain('<div class="question">');
    expect(html).toContain(
      '<p class="question-q"><span class="question-label">Q.</span><span>What is a data structure?</span></p>',
    );
    expect(html).toContain('<p class="question-a-label">A.</p>');
    expect(html).toContain(
      '<div class="question-a-body" data-pagefind-ignore>',
    );
    expect(html).toContain('<p>An organized collection.</p>');
  });

  test('renders alert containers with custom and default titles', () => {
    const md = createProjectMarkdown();

    const html = md.render(
      [
        '!!! note "Read this"',
        'Body',
        '!!!',
        '',
        '!!! warning',
        'Careful',
        '!!!',
      ].join('\n'),
    );

    expect(html).toContain('<div class="alert note">');
    expect(html).toContain('<p class="title" id="read-this">');
    expect(html).toContain(
      '<div class="alert warning"><p class="title">Warning</p>',
    );
    expect(html).toContain('<p>Body</p>');
    expect(html).toContain('<p>Careful</p>');
  });
});

describe('hidden_fence rule', () => {
  function createProjectMarkdown() {
    return createMarkdown(
      {
        base: '',
        basePath: '/',
        internalDomains: [],
        codeLanguages: {},
        features: { search: true, code: true, favicon: false },
        title: 'Test',
        titlePostfix: ' - Test',
        themeColor: 'steelblue',
        defaultTimeZone: 'America/New_York',
      } as SiteVariables,
      { validatorOptions: { enabled: false } },
    );
  }

  test('removes triple-hyphen comments containing a code fence', () => {
    const md = createProjectMarkdown();

    const html = md.render(
      ['<!---', '```', 'import java.util.*;', '```', '-->'].join('\n'),
    );

    expect(html).not.toContain('<!---');
    expect(html).not.toContain('import java.util');
  });

  test('does not remove triple-hyphen comments without a code fence', () => {
    const md = createProjectMarkdown();

    const html = md.render(
      ['<!---', 'This is a plain comment.', '-->'].join('\n'),
    );

    // markdown-it passes through html_block tokens unchanged;
    // the hidden_fence rule only converts comments that contain fences
    expect(html).toContain('<!---');
  });

  test('preserves double-hyphen HTML comments', () => {
    const md = createProjectMarkdown();

    const html = md.render(['<!-- standard HTML comment -->'].join('\n'));

    expect(html).toContain('<!-- standard HTML comment -->');
  });
});

describe('stripHtmlComments', () => {
  test('removes a single triple-hyphen comment', () => {
    const result = stripHtmlComments(
      '<p>Before</p>\n<!--- hidden comment -->\n<p>After</p>',
    );
    expect(result).toBe('<p>Before</p>\n\n<p>After</p>');
  });

  test('removes multiple triple-hyphen comments', () => {
    const result = stripHtmlComments('<!--- first -->\ntext\n<!--- second -->');
    expect(result).toBe('\ntext\n');
  });

  test('removes triple-hyphen comments spanning multiple lines', () => {
    const result = stripHtmlComments(
      '<p>Keep</p>\n<!---\nLine 1\nLine 2\n-->\n<p>Also keep</p>',
    );
    expect(result).toBe('<p>Keep</p>\n\n<p>Also keep</p>');
  });

  test('does not remove double-hyphen HTML comments', () => {
    const input = '<p>Before</p>\n<!-- keep this -->\n<p>After</p>';
    expect(stripHtmlComments(input)).toBe(input);
  });

  test('returns input unchanged when there are no comments', () => {
    const input = '<p>Hello world</p>';
    expect(stripHtmlComments(input)).toBe(input);
  });
});

describe('katex plugin', () => {
  function createProjectMarkdown() {
    return createMarkdown(
      {
        base: '',
        basePath: '/',
        internalDomains: [],
        codeLanguages: {},
        features: { search: true, code: true, favicon: false },
        title: 'Test',
        titlePostfix: ' - Test',
        themeColor: 'steelblue',
        defaultTimeZone: 'America/New_York',
      } as SiteVariables,
      { validatorOptions: { enabled: false } },
    );
  }

  test('renders inline math with $ delimiters', () => {
    const md = createProjectMarkdown();
    const html = md.render('The equation $E = mc^2$ is famous.');
    expect(html).toContain('class="katex"');
    expect(html).toContain('mc');
  });

  test('renders display math with $$ delimiters', () => {
    const md = createProjectMarkdown();
    const html = md.render('$$\\sum_{i=1}^{n} i = \\frac{n(n+1)}{2}$$');
    expect(html).toContain('class="katex-display"');
  });

  test('includes aria-label for inline math', () => {
    const md = createProjectMarkdown();
    const html = md.render('$E = mc^2$');
    expect(html).toContain('aria-label="E, equals, m, c, squared"');
  });

  test('includes aria-label for display math', () => {
    const md = createProjectMarkdown();
    const html = md.render('$$\\frac{1}{2}$$');
    expect(html).toContain(
      'aria-label="start fraction, 1, divided by, 2, end fraction"',
    );
  });

  test('throws on invalid LaTeX syntax', () => {
    const md = createProjectMarkdown();
    expect(() => md.render('$\\invalidcommand{$')).toThrow();
  });

  test('does not produce katex output when no math delimiters are used', () => {
    const md = createProjectMarkdown();
    const html = md.render('Just a normal paragraph with a $5 price tag.');
    expect(html).not.toContain('class="katex"');
  });
});

describe('injectKatexStylesheet', () => {
  test('injects deferred KaTeX stylesheet link into <head>', () => {
    const html =
      '<html><head><meta charset="UTF-8"></head><body></body></html>';
    const result = injectKatexStylesheet(html, p => p);

    expect(result).toContain('href="/katex/katex.min.css"');
    expect(result).toContain('media="print"');
    expect(result).toContain('onload="this.media=\'all\'"');
    expect(result).toContain('<noscript>');
  });

  test('applies basePath to the stylesheet URL', () => {
    const html = '<html><head></head><body></body></html>';
    const result = injectKatexStylesheet(html, p => '/course' + p);

    expect(result).toContain('href="/course/katex/katex.min.css"');
  });
});
