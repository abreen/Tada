import { beforeAll, describe, expect, spyOn, test } from 'bun:test';
import MarkdownIt from 'markdown-it';
import ParserBlock from 'markdown-it/lib/parser_block.mjs';
import deflist from 'markdown-it-deflist';
import footnote from 'markdown-it-footnote';
import markdownItAnchor from 'markdown-it-anchor';
import deflistIdPlugin from './deflist-id-plugin';
import externalLinksPlugin from './external-links-plugin';
import headingSubtitlePlugin from './heading-subtitle-plugin';
import superlinkPlugin from './superlink-plugin';
import columnsPlugin from './columns-plugin';
import tabsPlugin from './tabs-plugin';
import { createMarkdown } from './utils/markdown';
import { stripHtmlComments, injectKatexStylesheet } from './utils/render';
import { initHighlighter } from './utils/shiki-highlighter';
import type { RenderDependencyCollector, SiteVariables } from './types';

beforeAll(async () => {
  await initHighlighter(['ts']);
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
      '<a href="https://outside.example/docs" class="external" target="_blank" rel="noopener noreferrer">',
    );
    expect(html).toContain('<a href="https://example.com/docs">Internal</a>');
    expect(html).toContain('<a href="mailto:test@example.com">Mail</a>');
  });

  test('wraps the last word of an external link in a tail span', () => {
    const md = new MarkdownIt();
    md.use(externalLinksPlugin, {});

    const html = md.render('[Markdown examples page](https://example.com)');

    expect(html).toContain(
      '<a href="https://example.com" class="external" target="_blank" rel="noopener noreferrer">Markdown examples <span class="external-link-tail">page</span></a>',
    );
  });

  test('wraps the entire link content when it is a single word', () => {
    const md = new MarkdownIt();
    md.use(externalLinksPlugin, {});

    const html = md.render('[click](https://example.com)');

    expect(html).toContain(
      '<a href="https://example.com" class="external" target="_blank" rel="noopener noreferrer"><span class="external-link-tail">click</span></a>',
    );
  });

  test('does not wrap the tail of internal links', () => {
    const md = new MarkdownIt();
    md.use(externalLinksPlugin, { internalDomains: ['example.com'] });

    const html = md.render('[my internal link](https://example.com/docs)');

    expect(html).not.toContain('external-link-tail');
    expect(html).toContain(
      '<a href="https://example.com/docs">my internal link</a>',
    );
  });

  test('puts the tail span inside a surrounding strong element', () => {
    const md = new MarkdownIt();
    md.use(externalLinksPlugin, {});

    const html = md.render('[**bold link**](https://example.com)');

    expect(html).toContain(
      '<a href="https://example.com" class="external" target="_blank" rel="noopener noreferrer"><strong>bold <span class="external-link-tail">link</span></strong></a>',
    );
  });

  test('wraps the entire content when the link is a single bold word', () => {
    const md = new MarkdownIt();
    md.use(externalLinksPlugin, {});

    const html = md.render('[**bold**](https://example.com)');

    expect(html).toContain(
      '<a href="https://example.com" class="external" target="_blank" rel="noopener noreferrer"><span class="external-link-tail"><strong>bold</strong></span></a>',
    );
  });

  test('handles multiple spaces and trailing whitespace correctly', () => {
    const md = new MarkdownIt();
    md.use(externalLinksPlugin, {});

    const html = md.render('[hello   world](https://example.com)');

    expect(html).toContain(
      '<a href="https://example.com" class="external" target="_blank" rel="noopener noreferrer">hello   <span class="external-link-tail">world</span></a>',
    );
  });

  test('puts a trailing inline-formatted word inside the tail span', () => {
    const md = new MarkdownIt();
    md.use(externalLinksPlugin, {});

    const html = md.render('[click *here*](https://example.com)');

    // The space at the end of "click " is the split point; everything
    // after it (including the em_open/text/em_close) goes inside the span.
    expect(html).toContain(
      '<a href="https://example.com" class="external" target="_blank" rel="noopener noreferrer">click <span class="external-link-tail"><em>here</em></span></a>',
    );
  });

  test('keeps trailing inline code inside the tail span', () => {
    const md = new MarkdownIt();
    md.use(externalLinksPlugin, {});

    const html = md.render('[install `tada`](https://example.com)');

    expect(html).toContain(
      '<a href="https://example.com" class="external" target="_blank" rel="noopener noreferrer">install <span class="external-link-tail"><code>tada</code></span></a>',
    );
  });

  test('splits at the last hyphen when there is no space', () => {
    const md = new MarkdownIt();
    md.use(externalLinksPlugin, {});

    const html = md.render('[my-long-link](https://example.com)');

    expect(html).toContain(
      '<a href="https://example.com" class="external" target="_blank" rel="noopener noreferrer">my-long-<span class="external-link-tail">link</span></a>',
    );
  });

  test('prefers a later hyphen over an earlier space', () => {
    const md = new MarkdownIt();
    md.use(externalLinksPlugin, {});

    const html = md.render('[hello world-bound](https://example.com)');

    expect(html).toContain(
      '<a href="https://example.com" class="external" target="_blank" rel="noopener noreferrer">hello world-<span class="external-link-tail">bound</span></a>',
    );
  });

  test('skips a trailing hyphen and uses an earlier one', () => {
    const md = new MarkdownIt();
    md.use(externalLinksPlugin, {});

    const html = md.render('[my-link-](https://example.com)');

    expect(html).toContain(
      '<a href="https://example.com" class="external" target="_blank" rel="noopener noreferrer">my-<span class="external-link-tail">link-</span></a>',
    );
  });

  test('wraps the whole link when the only split char is at the end', () => {
    const md = new MarkdownIt();
    md.use(externalLinksPlugin, {});

    const html = md.render('[a-](https://example.com)');

    expect(html).toContain(
      '<a href="https://example.com" class="external" target="_blank" rel="noopener noreferrer"><span class="external-link-tail">a-</span></a>',
    );
  });

  test('puts the tail span inside nested inline formatting', () => {
    const md = new MarkdownIt();
    md.use(externalLinksPlugin, {});

    const html = md.render('[**bold *and italic***](https://example.com)');

    expect(html).toContain(
      '<a href="https://example.com" class="external" target="_blank" rel="noopener noreferrer"><strong>bold <em>and <span class="external-link-tail">italic</span></em></strong></a>',
    );
  });
});

describe('superlink-plugin', () => {
  function createSuperlinkMarkdown(
    options: { typographer?: boolean; externalLinks?: boolean } = {},
  ) {
    const siteVariables = { internalDomains: ['example.com'] };
    const md = new MarkdownIt({ typographer: options.typographer });
    if (options.externalLinks) {
      md.use(externalLinksPlugin, siteVariables);
    }
    return md.use(superlinkPlugin, siteVariables);
  }

  test('renders a title and description superlink', () => {
    const md = createSuperlinkMarkdown();

    expect(
      md.render('[Foo bar][Second line with description](/destination.html)'),
    ).toBe(
      '<p><a href="/destination.html" class="button superlink">' +
        '<span class="superlink-title">Foo bar</span>\n' +
        '<span class="superlink-description">Second line with description</span>' +
        '</a></p>\n',
    );
  });

  test('allows whitespace around the destination', () => {
    const md = createSuperlinkMarkdown();

    const html = md.render('[Foo][Bar](  /destination.html  )');

    expect(html).toContain(
      '<a href="/destination.html" class="button superlink">',
    );
  });

  test('renders inline Markdown in both the title and the description', () => {
    const md = createSuperlinkMarkdown();

    const html = md.render('[**Bold** title][A `code` description](/x.html)');

    expect(html).toContain(
      '<span class="superlink-title"><strong>Bold</strong> title</span>',
    );
    expect(html).toContain(
      '<span class="superlink-description">A <code>code</code> description</span>',
    );
  });

  test('applies typographer replacements in both parts', () => {
    const md = createSuperlinkMarkdown({ typographer: true });

    const html = md.render("[It's here][Don't stop -- read on](/x.html)");

    expect(html).toContain('<span class="superlink-title">It’s here</span>');
    expect(html).toContain(
      '<span class="superlink-description">Don’t stop – read on</span>',
    );
  });

  test('a code span containing ][ does not end the title', () => {
    const md = createSuperlinkMarkdown();

    const html = md.render('[Use `][` here][Description](/x.html)');

    expect(html).toContain(
      '<span class="superlink-title">Use <code>][</code> here</span>',
    );
  });

  test('takes precedence over a defined reference link', () => {
    const md = createSuperlinkMarkdown();

    const html = md.render(
      ['[Foo][Bar](/button.html)', '', '[Bar]: /reference.html'].join('\n'),
    );

    expect(html).toContain('<a href="/button.html" class="button superlink">');
    expect(html).not.toContain('/reference.html');
  });

  test('leaves ordinary links and reference links alone', () => {
    const md = createSuperlinkMarkdown();

    const html = md.render(
      [
        '[inline](/inline.html)',
        '[reference][ref]',
        '[shortcut][]',
        '',
        '[ref]: /reference.html',
        '[shortcut]: /shortcut.html',
      ].join('\n'),
    );

    expect(html).toContain('<a href="/inline.html">inline</a>');
    expect(html).toContain('<a href="/reference.html">reference</a>');
    expect(html).toContain('<a href="/shortcut.html">shortcut</a>');
    expect(html).not.toContain('superlink');
  });

  test('does not match when the parts are not directly adjacent', () => {
    const md = createSuperlinkMarkdown();

    for (const source of [
      '[Foo] [Bar](/x.html)',
      '[Foo]\n[Bar](/x.html)',
      '[Foo][Bar] (/x.html)',
    ]) {
      expect(md.render(source)).not.toContain('superlink');
    }
  });

  test('does not match an escaped opening bracket', () => {
    const md = createSuperlinkMarkdown();

    const html = md.render('\\[Foo][Bar](/x.html)');

    expect(html).not.toContain('superlink');
    expect(html).toContain('<a href="/x.html">Bar</a>');
  });

  test('does not match when a part is empty or blank', () => {
    const md = createSuperlinkMarkdown();

    for (const source of [
      '[][Bar](/x.html)',
      '[Foo][](/x.html)',
      '[ ][Bar](/x.html)',
      '[Foo][ ](/x.html)',
    ]) {
      expect(md.render(source)).not.toContain('superlink');
    }
  });

  test('does not match an unsafe destination', () => {
    const md = createSuperlinkMarkdown();

    const html = md.render('[Foo][Bar](javascript:alert(1))');

    expect(html).not.toContain('superlink');
    expect(html).not.toContain('<a');
  });

  test('does not allow links inside either part', () => {
    const md = createSuperlinkMarkdown();

    expect(md.render('[See [inner](/a.html)][Desc](/b.html)')).not.toContain(
      'superlink',
    );
    expect(md.render('[Title][See [inner](/a.html)](/b.html)')).not.toContain(
      'superlink',
    );
  });

  test('does not allow autolinks or raw anchors inside either part', () => {
    const md = new MarkdownIt({ html: true }).use(superlinkPlugin, {
      internalDomains: [],
    });

    for (const source of [
      '[<https://example.com>][Desc](/b.html)',
      '[Title][<https://example.com>](/b.html)',
      '[**<https://example.com>**][Desc](/b.html)',
      '[<a href="/a.html">Raw</a>][Desc](/b.html)',
      '[Title][<A HREF="/a.html">Raw</A>](/b.html)',
    ]) {
      const html = md.render(source);
      expect(html).not.toContain('superlink');
    }
  });

  test('allows other inline HTML inside either part', () => {
    const md = new MarkdownIt({ html: true }).use(superlinkPlugin, {
      internalDomains: [],
    });

    const html = md.render('[A <abbr>B</abbr>][<kbd>C</kbd>](/x.html)');

    expect(html).toContain('<a href="/x.html" class="button superlink">');
    expect(html).toContain('<abbr>B</abbr>');
    expect(html).toContain('<kbd>C</kbd>');
  });

  test('does not reparse nested brackets that have no destination', () => {
    const md = createSuperlinkMarkdown();
    let source = '[A][B]';
    for (let i = 0; i < 20; i++) {
      source = `[${source}][B]`;
    }

    const start = performance.now();
    const html = md.render(source);
    const elapsed = performance.now() - start;

    expect(html).not.toContain('superlink');
    expect(elapsed).toBeLessThan(1000);
  });

  test('checking labels for anchors does not register footnotes', () => {
    const md = new MarkdownIt({ html: true })
      .use(footnote)
      .use(superlinkPlugin, { internalDomains: [] });
    const footnoteCount = (html: string) =>
      html.split('class="footnote-item"').length - 1;

    expect(footnoteCount(md.render('[A ^[note]][B]'))).toBe(1);
    expect(footnoteCount(md.render('[A ^[note]][B](/x.html)'))).toBe(1);
    // A rejected superlink is parsed again as ordinary Markdown
    const rejected = md.render('[<https://example.com> ^[note]][B](/x.html)');
    expect(rejected).not.toContain('superlink');
    expect(footnoteCount(rejected)).toBe(1);
  });

  test('marks external destinations without wrapping a tail span', () => {
    const md = createSuperlinkMarkdown({ externalLinks: true });

    const html = md.render(
      '[Out][Elsewhere on the web](https://outside.example/docs)',
    );

    expect(html).toBe(
      '<p><a href="https://outside.example/docs" class="button superlink external" target="_blank" rel="noopener noreferrer">' +
        '<span class="superlink-title">Out</span>\n' +
        '<span class="superlink-description">Elsewhere on the web</span>' +
        '</a></p>\n',
    );
  });

  test('does not add target or rel to internal destinations', () => {
    const md = createSuperlinkMarkdown({ externalLinks: true });

    const html = md.render(
      '[Home][Same site](https://example.com/docs) [Local][Relative](/docs.html)',
    );

    expect(html).toContain(
      '<a href="https://example.com/docs" class="button superlink">',
    );
    expect(html).toContain('<a href="/docs.html" class="button superlink">');
    expect(html).not.toContain('target=');
    expect(html).not.toContain('external');
  });

  test('separates the title and description in extracted text', () => {
    const md = createSuperlinkMarkdown();

    const html = md.render('[Foo bar][Second line](/x.html)');

    expect(html).toContain(
      'Foo bar</span>\n<span class="superlink-description">Second line</span>',
    );
  });

  test('leaves a footnote reference followed by a link alone', () => {
    const md = new MarkdownIt().use(footnote);
    md.use(superlinkPlugin, { internalDomains: [] });

    const html = md.render(
      ['Word[^1][source](/x.html)', '', '[^1]: The note.'].join('\n'),
    );

    expect(html).toContain('footnote-ref');
    expect(html).toContain('<a href="/x.html">source</a>');
    expect(html).not.toContain('superlink');
  });

  test('does not match a title that starts with a caret', () => {
    const md = createSuperlinkMarkdown();

    expect(md.render('[^note][Desc](/x.html)')).not.toContain('superlink');
  });

  test('renders consecutive lines as sibling anchors', () => {
    const md = createSuperlinkMarkdown();

    const html = md.render('[A][a](/a.html)\n[B][b](/b.html)');

    expect(html).toBe(
      '<p><a href="/a.html" class="button superlink">' +
        '<span class="superlink-title">A</span>\n' +
        '<span class="superlink-description">a</span></a>\n' +
        '<a href="/b.html" class="button superlink">' +
        '<span class="superlink-title">B</span>\n' +
        '<span class="superlink-description">b</span></a></p>\n',
    );
  });

  test('is registered in the project Markdown pipeline', () => {
    const md = createMarkdown(
      {
        base: '',
        basePath: '/',
        internalDomains: [],
        extensionToShikiLanguage: {},
        shikiLanguages: ['ts'],
        features: { search: true, favicon: false, footer: true, pickers: true },
        title: 'Test',
        titlePostfix: ' - Test',
        themeColor: 'steelblue',
      } as SiteVariables,
      { validatorOptions: { enabled: false } },
    );

    const html = md.render(
      [
        '[Foo bar][Second line](/destination.html)',
        '[Out][Away](https://outside.example/docs)',
        '',
        '[Normal](/normal.html)',
      ].join('\n'),
    );

    expect(html).toContain(
      '<a href="/destination.html" class="button superlink"><span class="superlink-title">Foo bar</span>',
    );
    expect(html).toContain(
      '<a href="https://outside.example/docs" class="button superlink external" target="_blank" rel="noopener noreferrer">',
    );
    expect(html).not.toContain('external-link-tail');
    expect(html).toContain('<a href="/normal.html">Normal</a>');
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
  test('includes inline code in readable term ids and deduplicates equivalent terms', () => {
    const md = new MarkdownIt().use(deflist).use(deflistIdPlugin);
    const source = [
      '`Map`',
      ': Code only',
      '',
      'Map',
      ': Plain duplicate',
      '',
      'Use `Map`',
      ': Mixed term',
      '',
      'Use Map',
      ': Mixed duplicate',
      '',
      '`Map`',
      ': Repeated code',
    ].join('\n');

    const html = md.render(source);

    expect(html).toContain('<a id="map"></a><code>Map</code>');
    expect(html).toContain('<a id="map-2"></a>Map');
    expect(html).toContain('<a id="use-map"></a>Use <code>Map</code>');
    expect(html).toContain('<a id="use-map-2"></a>Use Map');
    expect(html).toContain('<a id="map-3"></a><code>Map</code>');
    expect(md.render(source)).toBe(html);
  });

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
        extensionToShikiLanguage: {},
        shikiLanguages: ['ts'],
        features: { search: true, favicon: false, footer: true, pickers: true },
        title: 'Test',
        titlePostfix: ' - Test',
        themeColor: 'steelblue',
      } as SiteVariables,
      { validatorOptions: { enabled: false } },
    );
  }

  test('renders comment tokens with fg2 color in fenced code blocks', () => {
    const md = createProjectMarkdown();

    const html = md.render(
      ['```ts', '// note', 'const x = 1', '```'].join('\n'),
    );

    expect(html).toContain(
      'style="--shiki-light:var(--fg2-color);--shiki-dark:var(--fg2-color)"',
    );
    expect(html).toContain('// note');
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
    expect(html).toContain(
      '<div class="question-a-content">\n<p>An organized collection.</p>\n</div></div></div></div>',
    );
  });

  test('renders checked-list questions as multiple choice blocks', () => {
    const md = createProjectMarkdown();

    const html = md.render(
      [
        '??? question Which option is correct?',
        '- [ ] **One**',
        '- [x] [Two](./two.md)',
        '???',
      ].join('\n'),
    );

    expect(html).toContain('<div class="question question-multiple-choice">');
    expect(html).toContain(
      '<p class="question-q"><span class="question-label">Q.</span><span>Which option is correct?</span></p>',
    );
    expect(html).not.toContain('question-a-label');
    expect(html).not.toContain('[ ]');
    expect(html).not.toContain('[x]');
    expect(html).toContain(
      '<div class="question-multiple-choice-option"><strong>One</strong></div>',
    );
    expect(html).toContain(
      '<div class="question-multiple-choice-option" data-correct=""><a href="./two.md">Two</a></div>',
    );
  });

  test('keeps non-checked-list questions as spoiler answers', () => {
    const md = createProjectMarkdown();

    const html = md.render(
      ['??? question Which option is correct?', '- one', '- two', '???'].join(
        '\n',
      ),
    );

    expect(html).toContain('<div class="question">');
    expect(html).toContain('<p class="question-a-label">A.</p>');
    expect(html).toContain('<ul class="styled-list">');
    expect(html).not.toContain('question-multiple-choice');
  });

  test('rejects multiple choice questions without exactly one correct option', () => {
    const md = createProjectMarkdown();

    expect(() =>
      md.render(
        [
          '??? question Which option is correct?',
          '- [ ] one',
          '- [ ] two',
          '???',
        ].join('\n'),
      ),
    ).toThrow(
      'multiple choice question must include exactly one correct option marked with [x], but found 0',
    );

    expect(() =>
      md.render(
        [
          '??? question Which option is correct?',
          '- [x] one',
          '- [x] two',
          '???',
        ].join('\n'),
      ),
    ).toThrow(
      'multiple choice question must include exactly one correct option marked with [x], but found 2',
    );
  });

  test('multiple choice rendering does not clear collected TOC items', () => {
    const md = createProjectMarkdown();
    const env: Record<string, unknown> = {};

    const html = md.render(
      [
        '## Before',
        '',
        '??? question Which option is correct?',
        '- [ ] One',
        '- [x] Two',
        '???',
        '',
        '## After',
      ].join('\n'),
      env,
    );

    expect(html).toContain('question-multiple-choice');
    expect(env.tocItems).toEqual([
      { kind: 'heading', level: '2', id: 'before', innerHtml: 'Before' },
      { kind: 'heading', level: '2', id: 'after', innerHtml: 'After' },
    ]);
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
    expect(html).toContain('<p class="title" id="read-this">Read this</p>');
    expect(html).toContain(
      '<div class="alert warning"><p class="title" id="warning">Warning</p>',
    );
    expect(html).toContain('<p>Body</p>');
    expect(html).toContain('<p>Careful</p>');
  });

  test('deduplicates alert IDs', () => {
    const md = createProjectMarkdown();

    const html = md.render(
      [
        '!!! note',
        'First',
        '!!!',
        '',
        '!!! note',
        'Second',
        '!!!',
        '',
        '!!! note "Custom"',
        'Third',
        '!!!',
        '',
        '!!! note "Custom"',
        'Fourth',
        '!!!',
      ].join('\n'),
    );

    expect(html).toContain('<p class="title" id="note">Note</p>');
    expect(html).toContain('<p class="title" id="note-2">Note</p>');
    expect(html).toContain('id="custom"');
    expect(html).toContain('id="custom-2"');
  });
});

describe('markdown slide segmentation', () => {
  function createSlidesMarkdown() {
    return createMarkdown(
      {
        base: '',
        basePath: '/',
        internalDomains: [],
        extensionToShikiLanguage: {},
        shikiLanguages: ['ts'],
        features: { search: true, favicon: false, footer: true, pickers: true },
        title: 'Test',
        titlePostfix: ' - Test',
        themeColor: 'steelblue',
      } as SiteVariables,
      {
        filePath: 'content/slides.md',
        slides: true,
        validatorOptions: { enabled: false },
      },
    );
  }

  test('wraps slide pages in a slide deck and removes hr output', () => {
    const md = createSlidesMarkdown();

    const html = md.render(['# One', '', '---', '', '## Two'].join('\n'));

    expect(html).toContain('<div class="slide-deck" data-slides-root>');
    expect(html).toContain('<div class="slide" data-slide-index="0">');
    expect(html).toContain('<div class="slide" data-slide-index="1">');
    expect(html).not.toContain('<hr');
  });

  test('does not wrap inline renders in slide markup', () => {
    const md = createSlidesMarkdown();

    const html = md.renderInline('What is **three** times four?');

    expect(html).toBe('What is <strong>three</strong> times four?');
    expect(html).not.toContain('slide-deck');
  });

  test('renders question prompts normally on slide pages', () => {
    const md = createSlidesMarkdown();

    const html = md.render(
      [
        '## Slide three',
        '',
        '??? question What is three times four?',
        '',
        'The answer is twelve.',
        '',
        '???',
      ].join('\n'),
    );

    expect(html).toContain(
      '<p class="question-q"><span class="question-label">Q.</span><span>What is three times four?</span></p>',
    );
    expect(
      (html.match(/<div class="slide-deck" data-slides-root>/g) ?? []).length,
    ).toBe(1);
  });

  test('does not collect dinkus TOC items in slide mode', () => {
    const md = createSlidesMarkdown();
    const env: Record<string, unknown> = {};

    md.render(['# One', '', '---', '', '## Two'].join('\n'), env);

    expect(env.tocItems).toEqual([
      { kind: 'heading', level: '1', id: 'one', innerHtml: 'One' },
      { kind: 'heading', level: '2', id: 'two', innerHtml: 'Two' },
    ]);
  });

  test('removes raw html hr tags on slide pages', () => {
    const md = createSlidesMarkdown();

    const html = md.render(['# One', '', '<hr>', '', '## Two'].join('\n'));
    const renderedSlides = html.match(/<div class="slide" data-slide-index="/g);

    expect(html).not.toContain('<hr');
    expect(renderedSlides).toHaveLength(1);
    expect(html).toContain(
      '<div class="slide" data-slide-index="0"><h1 id="one">One</h1>',
    );
    expect(html).toContain('<h2 id="two">Two</h2>');
  });

  test('removes inline raw html hr tags embedded in text on slide pages', () => {
    const md = createSlidesMarkdown();

    const html = md.render('Text <hr> more');

    expect(html).not.toContain('<hr');
    expect(html).toContain('<p>Text  more</p>');
  });

  test('removes inline raw html hr tags inside multiple choice options on slide pages', () => {
    const md = createSlidesMarkdown();

    const html = md.render(
      [
        '??? question Which option is correct?',
        '- [ ] A <hr> option',
        '- [x] B option',
        '???',
      ].join('\n'),
    );

    expect(html).toContain('question-multiple-choice');
    expect(html).not.toContain('<hr');
    expect(html).toContain(
      '<div class="question-multiple-choice-option">A  option</div>',
    );
  });

  test('removes embedded raw html hr tags inside single-line html blocks on slide pages', () => {
    const md = createSlidesMarkdown();

    const html = md.render('<div><hr></div>');

    expect(html).not.toContain('<hr');
    expect(html).toContain('<div></div>');
  });

  test('removes embedded raw html hr tags inside multiline html blocks on slide pages', () => {
    const md = createSlidesMarkdown();

    const html = md.render(['<div>', '<hr>', '</div>'].join('\n'));

    expect(html).not.toContain('<hr');
    expect(html).toContain('<div>\n\n</div>');
  });

  test('keeps hr-like string literals inside script tags on slide pages', () => {
    const md = createSlidesMarkdown();

    const html = md.render('<script>const x = "<hr>";</script>');

    expect(html).toContain('<script>const x = "<hr>";</script>');
  });

  test('keeps hr-like attribute values on slide pages', () => {
    const md = createSlidesMarkdown();

    const html = md.render('<div data-label="<hr>"></div>');

    expect(html).toContain('<div data-label="<hr>"></div>');
  });

  test('removes real hr elements without corrupting hr-like attribute values on slide pages', () => {
    const md = createSlidesMarkdown();

    const html = md.render('<div data-label="<hr>"><hr></div>');

    expect(html).toContain('<div data-label="<hr>"></div>');
    expect(html).not.toContain('<div data-label=""></div>');
  });

  test('ignores blank slides from leading trailing and consecutive separators', () => {
    const md = createSlidesMarkdown();
    const env: Record<string, unknown> = {};

    const html = md.render(
      ['---', '', '# One', '', '---', '', '---', '', '## Two', '', '---'].join(
        '\n',
      ),
      env,
    );

    const renderedSlides = html.match(/<div class="slide" data-slide-index="/g);

    expect(renderedSlides).toHaveLength(2);
    expect(html).toContain(
      '<div class="slide" data-slide-index="0"><h1 id="one">One</h1>',
    );
    expect(html).toContain(
      '<div class="slide" data-slide-index="1"><h2 id="two">Two</h2>',
    );
    expect(env.slideCount).toBe(2);
  });
});

describe('markdown fence languages', () => {
  function createProjectMarkdown({
    features = { search: true, favicon: false, footer: true, pickers: true },
    shikiLanguages,
  }: Partial<SiteVariables> = {}) {
    return createMarkdown(
      {
        base: '',
        basePath: '/',
        internalDomains: [],
        extensionToShikiLanguage: {},
        shikiLanguages,
        features,
        title: 'Test',
        titlePostfix: ' - Test',
        themeColor: 'steelblue',
      } as SiteVariables,
      { validatorOptions: { enabled: false }, filePath: 'content/page.md' },
    );
  }

  test('highlights bundled fence languages listed in shikiLanguages', () => {
    const md = createProjectMarkdown({ shikiLanguages: ['ts'] });

    const html = md.render(['```ts', 'const x = 1', '```'].join('\n'));

    expect(html).toContain('<pre class="shiki');
    expect(html).toContain('const');
  });

  test('rejects bundled fence languages missing from shikiLanguages', () => {
    const md = createProjectMarkdown();

    expect(() => md.render(['```ts', 'const x = 1', '```'].join('\n'))).toThrow(
      'content/page.md: Markdown fence language "ts" is not listed in site.shikiLanguages',
    );
  });

  test('rejects invalid fence language strings', () => {
    const md = createProjectMarkdown();

    expect(() =>
      md.render(['```not-a-language', 'hello', '```'].join('\n')),
    ).toThrow(
      'content/page.md: Markdown fence language "not-a-language" is not a supported Shiki language',
    );
  });

  test('allows plain-text fence aliases without shikiLanguages', () => {
    const md = createProjectMarkdown();

    for (const lang of ['text', 'txt', 'plain']) {
      const html = md.render([`~~~${lang}`, 'hello', '~~~'].join('\n'));
      expect(html).toContain('<pre class="shiki');
      expect(html).toContain('hello');
    }
  });

  test('highlights fences even when no code-page mappings are configured', () => {
    const md = createProjectMarkdown({
      features: { search: true, favicon: false, footer: true, pickers: true },
      shikiLanguages: ['ts'],
    });

    const html = md.render(['```ts', 'const x = 1', '```'].join('\n'));

    expect(html).toContain('<pre class="shiki');
    expect(html).toContain('const');
  });
});

describe('hidden_fence rule', () => {
  function createProjectMarkdown() {
    return createMarkdown(
      {
        base: '',
        basePath: '/',
        internalDomains: [],
        extensionToShikiLanguage: {},
        features: { search: true, favicon: false, footer: true, pickers: true },
        title: 'Test',
        titlePostfix: ' - Test',
        themeColor: 'steelblue',
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
        extensionToShikiLanguage: {},
        features: { search: true, favicon: false, footer: true, pickers: true },
        title: 'Test',
        titlePostfix: ' - Test',
        themeColor: 'steelblue',
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

// Lines read by every block parser, including the ones that locate code
function countParsedLines(render: () => void): number {
  const parse = spyOn(ParserBlock.prototype, 'parse');
  try {
    render();
    return parse.mock.calls.reduce(
      (sum, [src]) => sum + src.split('\n').length,
      0,
    );
  } finally {
    parse.mockRestore();
  }
}

describe('columns plugin', () => {
  const md = new MarkdownIt().use(columnsPlugin);

  test('finds code in time proportional to the document', () => {
    const source = Array.from(
      { length: 200 },
      (_, i) => `Paragraph ${i}.\n\n+++\nLeft ${i}.\n+++\nRight ${i}.\n+++\n`,
    ).join('\n');
    const lines = source.split('\n').length;
    const html = { value: '' };
    const parsed = countParsedLines(() => {
      html.value = md.render(source);
    });
    expect(html.value.match(/class="columns"/g)).toHaveLength(200);
    expect(parsed).toBeLessThan(lines * 10);
  });

  test('basic two-column layout', () => {
    const html = md.render('+++\nCol 1\n+++\nCol 2\n+++\n');
    expect(html).toContain('<div class="columns">');
    expect(html).toContain('<p>Col 1</p>');
    expect(html).toContain('<p>Col 2</p>');
    // Two column divs inside the wrapper
    expect(html).toMatch(
      /<div class="columns">\n<div>\n.*<\/div>\n<div>\n.*<\/div>\n<\/div>/s,
    );
  });

  test('rich markdown inside columns', () => {
    const html = md.render('+++\n## Heading\n- item\n+++\nA paragraph.\n+++\n');
    expect(html).toContain('<h2>Heading</h2>');
    expect(html).toContain('<li>');
    expect(html).toContain('<p>A paragraph.</p>');
  });

  test.each([
    ['backticks', '```text\n+++\n```'],
    ['tildes', '~~~text\n+++\n~~~'],
    ['long fence', '````text\n```\n+++\n````'],
    ['mismatched fence', '```text\n~~~\n+++\n```'],
    ['indented closing fence', '```text\n    ```\n+++\n```'],
    ['closing fence with text', '~~~text\n~~~ trailing\n+++\n~~~'],
    ['list fence', '- ```text\n  +++\n  ```'],
    ['blockquote fence', '> ```text\n> +++\n> ```'],
    ['nested list fence', '- outer\n  - ~~~text\n    +++\n    ~~~'],
    ['indented code', '    +++'],
    ['tab-indented code', '\t+++'],
  ])('preserves literal delimiters in %s', (_name, code) => {
    const first = `## Heading\n\n${code}\n\n- item\n`;
    const second = `A **second** column.\n\n${code}\n`;
    expect(md.render(`+++\n${first}+++\n${second}+++\n`)).toBe(
      `<div class="columns">\n<div>\n${md.render(first)}</div>\n<div>\n${md.render(second)}</div>\n</div>\n`,
    );
  });

  test('an unclosed code fence cannot supply column boundaries', () => {
    const html = md.render('+++\n```text\n+++\nSecond\n+++\n');
    expect(html).not.toContain('<div class="columns">');
    expect(html).toContain(
      '<pre><code class="language-text">+++\nSecond\n+++\n</code></pre>',
    );
  });

  test('columns nested in a blockquote preserve fenced code', () => {
    const source = '+++\n~~~text\n+++\n~~~\n+++\nSecond\n+++\n';
    const quoted = source
      .trimEnd()
      .split('\n')
      .map(line => `> ${line}`)
      .join('\n');
    expect(md.render(quoted)).toBe(
      `<blockquote>\n${md.render(source)}</blockquote>\n`,
    );
    expect(md.render(quoted)).toContain(
      '<code class="language-text">+++\n</code>',
    );
  });

  test('columns nested in a list preserve fenced code', () => {
    const source = '+++\n~~~text\n+++\n~~~\n+++\nSecond\n+++\n';
    const listed = source
      .trimEnd()
      .split('\n')
      .map((line, index) => `${index === 0 ? '- ' : '  '}${line}`)
      .join('\n');
    expect(md.render(listed)).toBe(
      `<ul>\n<li>\n${md.render(source)}</li>\n</ul>\n`,
    );
  });

  test('incomplete block with only two fences is not matched', () => {
    const html = md.render('+++\nContent\n+++\n');
    expect(html).not.toContain('<div class="columns">');
  });

  test('empty columns produce no content errors', () => {
    const html = md.render('+++\n+++\n+++\n');
    expect(html).toContain('<div class="columns">');
  });
});

describe('tabs plugin', () => {
  const md = new MarkdownIt().use(tabsPlugin);

  test('finds code in time proportional to the document', () => {
    const source = Array.from(
      { length: 200 },
      (_, i) => `Paragraph ${i}.\n\n[Tab ${i}|\n\nContent ${i}.\n\n]\n`,
    ).join('\n');
    const lines = source.split('\n').length;
    const html = { value: '' };
    const parsed = countParsedLines(() => {
      html.value = md.render(source);
    });
    expect(html.value.match(/class="tabs"/g)).toHaveLength(200);
    expect(parsed).toBeLessThan(lines * 10);
  });

  test('scans openers without a closing line in time proportional to the document', () => {
    const source = Array.from(
      { length: 200 },
      (_, i) => `[Not a tab ${i}|\n\nText ${i}.\n`,
    ).join('\n');
    const lines = source.split('\n').length;
    const html = { value: '' };
    const parsed = countParsedLines(() => {
      html.value = md.render(source);
    });
    expect(html.value).not.toContain('class="tabs"');
    expect(parsed).toBeLessThan(lines * 10);
  });

  test('renders a group with a tab list and labeled panels', () => {
    const html = md.render(
      "[Tab 1|\n\nHere's the content.\n\n]\n[Tab 2|\n\nSecond.\n\n]\n",
    );
    expect(html).toBe(
      [
        '<div class="tabs" id="tabs-1">',
        '<div class="tabs-track">',
        '<button type="button" class="tabs-scroll tabs-scroll-start" tabindex="-1" aria-hidden="true" hidden=""></button>',
        '<div class="tabs-list">',
        '<button type="button" class="tabs-tab" id="tabs-1-tab-1" data-selected="" disabled=""><span class="tabs-tab-label">Tab 1</span></button>',
        '<button type="button" class="tabs-tab" id="tabs-1-tab-2" disabled=""><span class="tabs-tab-label">Tab 2</span></button>',
        '</div>',
        '<button type="button" class="tabs-scroll tabs-scroll-end" tabindex="-1" aria-hidden="true" hidden=""></button>',
        '</div>',
        '<div class="tabs-panels">',
        '<div class="tabs-panel" id="tabs-1-panel-1" data-selected="">',
        '<p class="tabs-panel-label" data-pagefind-ignore="">Tab 1</p>',
        "<p>Here's the content.</p>",
        '</div>',
        '<div class="tabs-panel" id="tabs-1-panel-2">',
        '<p class="tabs-panel-label" data-pagefind-ignore="">Tab 2</p>',
        '<p>Second.</p>',
        '</div>',
        '</div>',
        '</div>',
        '',
      ].join('\n'),
    );
  });

  test('allows empty panels', () => {
    const html = md.render('[A|\n\n]\n[B|\n]\n[C|\n\n\n]\n');
    expect(html.match(/class="tabs-tab"/g)).toHaveLength(3);
    expect(html.match(/class="tabs-panel"/g)).toHaveLength(3);
    expect(html.match(/class="tabs"/g)).toHaveLength(1);
  });

  test('blank lines between blocks keep one group', () => {
    const html = md.render('[A|\na\n]\n\n\n[B|\nb\n]\n');
    expect(html.match(/class="tabs"/g)).toHaveLength(1);
    expect(html).toContain('id="tabs-1-panel-2"');
  });

  test('other content between blocks starts a new group', () => {
    const html = md.render('[A|\na\n]\n\nBetween.\n\n[B|\nb\n]\n');
    expect(html.match(/class="tabs"/g)).toHaveLength(2);
    expect(html).toContain('<p>Between.</p>');
    expect(html).toContain('id="tabs-1-tab-1"');
    expect(html).toContain('id="tabs-2-tab-1"');
    expect(html).not.toContain('tabs-1-tab-2');
  });

  test('a single tab is a group', () => {
    const html = md.render('[Only|\ntext\n]\n');
    expect(html).toContain('id="tabs-1-tab-1"');
    expect(html).toContain('<p>text</p>');
  });

  test('labels accept inline Markdown and are trimmed', () => {
    const html = md.render('[  *Java* `main`  |\nx\n]\n');
    expect(html).toContain(
      'disabled=""><span class="tabs-tab-label"><em>Java</em> <code>main</code></span></button>',
    );
    expect(html).toContain(
      '<p class="tabs-panel-label" data-pagefind-ignore=""><em>Java</em> <code>main</code></p>',
    );
  });

  test('panels contain full Markdown', () => {
    const html = md.render('[A|\n## Heading\n\n- item\n\n```js\nx\n```\n]\n');
    expect(html).toContain('<h2>Heading</h2>');
    expect(html).toContain('<li>item</li>');
    expect(html).toContain('<code class="language-js">x\n</code>');
  });

  test('groups nest inside panels', () => {
    const html = md.render(
      '[Outer 1|\n[Inner 1|\ni1\n]\n[Inner 2|\ni2\n]\n]\n[Outer 2|\no2\n]\n',
    );
    expect(html.match(/class="tabs"/g)).toHaveLength(2);
    expect(html).toMatch(
      /id="tabs-1-panel-1"[^]*<div class="tabs" id="tabs-2">[^]*<p>i2<\/p>\n<\/div>\n<\/div>\n<\/div>\n<\/div>\n<div class="tabs-panel" id="tabs-1-panel-2">/,
    );
    expect(html).toContain('<p>o2</p>');
  });

  test.each([
    ['backticks', '```text\n]\n[X|\n```'],
    ['tildes', '~~~text\n]\n~~~'],
    ['indented code', '    ]\n    [X|'],
  ])('preserves literal delimiters in %s', (_name, code) => {
    const content = `Before.\n\n${code}\n\nAfter.\n`;
    expect(md.render(`[A|\n${content}]\n`)).toContain(
      `<p class="tabs-panel-label" data-pagefind-ignore="">A</p>\n${md.render(content)}</div>`,
    );
  });

  test('an unclosed tab is ordinary text', () => {
    const html = md.render('[A|\ntext\n');
    expect(html).not.toContain('class="tabs"');
    expect(html).toBe('<p>[A|\ntext</p>\n');
  });

  test('an unclosed code fence cannot supply the closing line', () => {
    const html = md.render('[A|\n```text\n]\n');
    expect(html).not.toContain('class="tabs"');
  });

  test.each([
    ['empty label', '[|\nx\n]\n'],
    ['blank label', '[  |\nx\n]\n'],
    ['footnote-like label', '[^1|\nx\n]\n'],
    ['text after the bar', '[A| more\nx\n]\n'],
    ['indented open line', '    [A|\nx\n]\n'],
  ])('ignores %s', (_name, source) => {
    expect(md.render(source)).not.toContain('class="tabs"');
  });

  test('a table row starting with a link stays in its tab', () => {
    const table = '| A | B |\n| - | - |\n[x](u) | y |\n';
    const html = md.render(`[Tab|\n\n${table}\n]\n`);
    expect(html).toContain('class="tabs"');
    expect(html).toContain(`${md.render(table)}</div>`);
  });

  test.each([
    ['a link', '[x](u) |'],
    ['an unbalanced bracket', '[a]b|'],
  ])('a line starting with %s does not open a tab', (_name, line) => {
    expect(md.render(`${line}\ntext\n]\n`)).not.toContain('class="tabs"');
  });

  test('labels may contain balanced and escaped brackets', () => {
    const html = md.render('[Array[int] \\] `]`|\nx\n]\n');
    expect(html).toContain(
      'disabled=""><span class="tabs-tab-label">Array[int] ] <code>]</code></span></button>',
    );
  });

  test('preserves literal delimiters in raw <pre> HTML', () => {
    const pre = '<pre>\n[1,\n]\n</pre>\n';
    const html = new MarkdownIt({ html: true })
      .use(tabsPlugin)
      .render(`[A|\n${pre}]\n`);
    expect(html).toContain('class="tabs"');
    expect(html).toContain(`${pre}</div>`);
  });

  test('tab buttons show link text without the link', () => {
    const html = md.render('[See [docs](u)|\nx\n]\n');
    expect(html).toContain(
      'disabled=""><span class="tabs-tab-label">See docs</span></button>',
    );
    expect(html).toContain(
      'data-pagefind-ignore="">See <a href="u">docs</a></p>',
    );
  });

  test('a footnote reference in a label is parsed once', () => {
    const html = new MarkdownIt()
      .use(footnote)
      .use(tabsPlugin)
      .render('[Java[^1]|\nx\n]\n\n[^1]: Note.\n');
    expect(html.match(/id="fnref1"/g)).toHaveLength(1);
    expect(html.match(/href="#fnref1"/g)).toHaveLength(1);
    expect(html).toContain(
      'disabled=""><span class="tabs-tab-label">Java</span></button>',
    );
  });

  test('group ids skip ids used by headings', () => {
    const html = new MarkdownIt()
      .use(markdownItAnchor, { tabIndex: false })
      .use(tabsPlugin)
      .render('## Tabs 1\n\n## Tabs 2 Tab 1\n\n[A|\na\n]\n[B|\nb\n]\n');
    expect(html).toContain('<h2 id="tabs-1">');
    expect(html).toContain('<h2 id="tabs-2-tab-1">');
    expect(html).toContain('<div class="tabs" id="tabs-3">');
    expect(html).toContain('id="tabs-3-tab-2"');
    expect(html).toContain('id="tabs-3-panel-2"');
  });

  test('a tab in a list item closes inside it', () => {
    const html = md.render('- [A|\n  a\n  ]\n- b\n');
    expect(html).toContain('<li>\n<div class="tabs"');
    expect(html).toContain('<li>b</li>');
  });

  test('a closing line after the end of a list item does not close its tab', () => {
    const html = md.render('- [A|\n  a\n- b\n  ]\n');
    expect(html).not.toContain('class="tabs"');
    expect(html).toContain('<li>b\n]</li>');
  });

  test('ids are unique per render', () => {
    expect(md.render('[A|\na\n]\n')).toContain('id="tabs-1"');
    expect(md.render('[A|\na\n]\n')).toContain('id="tabs-1"');
  });

  describe('steppers', () => {
    test('renders numbered tabs as a stepper with Back and Next buttons', () => {
      const html = md.render(
        '[1. Install|\n\nFirst.\n\n]\n[2. Configure|\n\nSecond.\n\n]\n',
      );
      expect(html).toBe(
        [
          '<div class="tabs tabs-stepper" id="tabs-1">',
          '<div class="tabs-track">',
          '<button type="button" class="tabs-scroll tabs-scroll-start" tabindex="-1" aria-hidden="true" hidden=""></button>',
          '<div class="tabs-list">',
          '<button type="button" class="tabs-tab" id="tabs-1-tab-1" data-selected="" disabled=""><span class="tabs-tab-label">1. Install</span></button>',
          '<button type="button" class="tabs-tab" id="tabs-1-tab-2" disabled=""><span class="tabs-tab-label">2. Configure</span></button>',
          '</div>',
          '<button type="button" class="tabs-scroll tabs-scroll-end" tabindex="-1" aria-hidden="true" hidden=""></button>',
          '</div>',
          '<div class="tabs-panels">',
          '<div class="tabs-panel" id="tabs-1-panel-1" data-selected="">',
          '<p class="tabs-panel-label" data-pagefind-ignore="">1. Install</p>',
          '<p>First.</p>',
          '</div>',
          '<div class="tabs-panel" id="tabs-1-panel-2">',
          '<p class="tabs-panel-label" data-pagefind-ignore="">2. Configure</p>',
          '<p>Second.</p>',
          '</div>',
          '<div class="tabs-step-nav" data-pagefind-ignore="">',
          '<button type="button" class="tabs-step tabs-step-back" disabled="" hidden=""><span aria-hidden="true">←</span> Back</button>',
          '<button type="button" class="tabs-step tabs-step-next" disabled="">Next <span aria-hidden="true">→</span></button>',
          '<span class="tabs-step-status visually-hidden" role="status"></span>',
          '</div>',
          '</div>',
          '</div>',
          '',
        ].join('\n'),
      );
    });

    test.each([
      ['numbers that skip', '[1. A|\na\n]\n[3. B|\nb\n]\n'],
      ['numbers that do not start at 1', '[2. A|\na\n]\n[3. B|\nb\n]\n'],
      ['a single numbered tab', '[1. A|\na\n]\n'],
      ['parenthesized numbers', '[1) A|\na\n]\n[2) B|\nb\n]\n'],
      ['an unnumbered tab', '[1. A|\na\n]\n[B|\nb\n]\n'],
      ['a number without a space', '[1.A|\na\n]\n[2.B|\nb\n]\n'],
      ['zero-padded numbers', '[01. A|\na\n]\n[02. B|\nb\n]\n'],
    ])('%s stay plain tabs', (_name, source) => {
      const html = md.render(source);
      expect(html).toContain('<div class="tabs" id="tabs-1">');
      expect(html).not.toContain('tabs-stepper');
      expect(html).not.toContain('tabs-step-nav');
    });

    test('a stepper nested in a step has its own buttons', () => {
      const html = md.render(
        '[1. Outer|\n[1. Inner|\ni1\n]\n[2. Inner|\ni2\n]\n]\n[2. Outer|\no2\n]\n',
      );
      expect(html.match(/class="tabs tabs-stepper"/g)).toHaveLength(2);
      expect(html.match(/class="tabs-step-nav"/g)).toHaveLength(2);
      expect(html).toMatch(
        /<p>i2<\/p>\n<\/div>\n<div class="tabs-step-nav"[^]*?<\/div>\n<\/div>\n<\/div>\n<\/div>\n<div class="tabs-panel" id="tabs-1-panel-2">/,
      );
    });
  });
});

describe('injectKatexStylesheet', () => {
  test('injects deferred KaTeX stylesheet link into <head>', () => {
    const html =
      '<html><head><meta charset="UTF-8"></head><body></body></html>';
    const result = injectKatexStylesheet(html);

    expect(result).toContain('href="/katex/katex.min.css"');
    expect(result).toContain('rel="stylesheet"');
  });
});

describe('footnote rendering', () => {
  function createProjectMarkdown() {
    return createMarkdown(
      {
        base: '',
        basePath: '/',
        internalDomains: [],
        extensionToShikiLanguage: {},
        features: { search: true, favicon: false, footer: true, pickers: true },
        title: 'Test',
        titlePostfix: ' - Test',
        themeColor: 'steelblue',
      } as SiteVariables,
      { validatorOptions: { enabled: false } },
    );
  }

  test('uses ordinary numeric labels', () => {
    const md = createProjectMarkdown();
    const refs = Array.from({ length: 11 }, (_, i) => `[^${i + 1}]`).join(' ');
    const defs = Array.from(
      { length: 11 },
      (_, i) => `[^${i + 1}]: note ${i + 1}`,
    ).join('\n');
    const html = md.render(`Refs: ${refs}\n\n${defs}\n`);

    expect(html).toContain(
      'class="footnote-ref" href="#fn1" id="fnref1">1</a>',
    );
    expect(html).toContain(
      'class="footnote-ref" href="#fn10" id="fnref10">10</a>',
    );
    expect(html).toContain('<li id="fn1" class="footnote-item">');
    expect(html).not.toContain('footnote-marker');
  });

  test('wraps footnotes in an ordinary ordered list', () => {
    const md = createProjectMarkdown();
    const html = md.render('Para.[^1]\n\n[^1]: note\n');

    expect(html).toContain(
      '<div class="footnotes"><p class="title">Footnotes</p><ol>',
    );
    expect(html).toContain('</ol></div>');
  });

  test('supports more than 35 footnotes', () => {
    const md = createProjectMarkdown();
    const refs = Array.from({ length: 36 }, (_, i) => `[^${i + 1}]`).join(' ');
    const defs = Array.from(
      { length: 36 },
      (_, i) => `[^${i + 1}]: note ${i + 1}`,
    ).join('\n');
    const html = md.render(`${refs}\n\n${defs}\n`);
    expect(html).toContain(
      'class="footnote-ref" href="#fn36" id="fnref36">36</a>',
    );
  });
});

describe('wikilink-plugin', () => {
  const byTitle = new Map<string, string[]>([
    ['Foo Bar', ['/notes/foo-bar.html']],
    ['Using `git`', ['/git.html']],
    ['C# notes', ['/c#/notes and more.html']],
    ['Twin', ['/a.html', '/b.html']],
  ]);

  function createWikiMarkdown(
    dependencyCollector?: RenderDependencyCollector,
    unlinkableTitles: string[] = [],
  ) {
    const pageTitles = { byTitle, unlinkableTitles };
    return createMarkdown(
      {
        base: '',
        basePath: '/',
        internalDomains: [],
        extensionToShikiLanguage: {},
        shikiLanguages: ['ts'],
        features: { search: true, favicon: false, footer: true, pickers: true },
        title: 'Test',
        titlePostfix: ' - Test',
        themeColor: 'steelblue',
      } as SiteVariables,
      { filePath: 'content/page.md', pageTitles, dependencyCollector },
    );
  }

  test('links to the page with the exact title', () => {
    expect(createWikiMarkdown().render('See [[Foo Bar]].')).toBe(
      '<p>See <a href="/notes/foo-bar.html">Foo Bar</a>.</p>\n',
    );
  });

  test('uses the text after a pipe as the link text', () => {
    expect(createWikiMarkdown().render('[[Foo Bar|the *other* page]]')).toBe(
      '<p><a href="/notes/foo-bar.html">the <em>other</em> page</a></p>\n',
    );
  });

  test('trims whitespace around the title', () => {
    expect(createWikiMarkdown().render('[[ Foo Bar | here ]]')).toContain(
      '<a href="/notes/foo-bar.html"> here </a>',
    );
    expect(createWikiMarkdown().render('[[  Foo Bar  ]]')).toContain(
      '<a href="/notes/foo-bar.html">Foo Bar</a>',
    );
  });

  test('renders inline Markdown in a title used as link text', () => {
    expect(createWikiMarkdown().render('[[Using `git`]]')).toContain(
      '<a href="/git.html">Using <code>git</code></a>',
    );
  });

  test('percent-encodes the page path', () => {
    expect(createWikiMarkdown().render('[[C# notes]]')).toContain(
      '<a href="/c%23/notes%20and%20more.html">C# notes</a>',
    );
  });

  test('matches titles case-sensitively', () => {
    expect(() => createWikiMarkdown().render('[[foo bar]]')).toThrow(
      'content/page.md: broken wikilink "[[foo bar]]": no page has the title "foo bar"',
    );
    expect(() => createWikiMarkdown().render('[[Foo  Bar]]')).toThrow(
      'broken wikilink',
    );
  });

  test('fails when more than one page has the title', () => {
    expect(() => createWikiMarkdown().render('[[Twin]]')).toThrow(
      'content/page.md: ambiguous wikilink "[[Twin]]": "Twin" is the title of /a.html, /b.html',
    );
  });

  test('records the titles it looks up, even unresolved ones', () => {
    const wikiTitles = new Set<string>();
    createWikiMarkdown({ wikiTitles }).render('[[Foo Bar|x]] [[Using `git`]]');
    expect(wikiTitles).toEqual(new Set(['Foo Bar', 'Using `git`']));

    const missing = new Set<string>();
    expect(() =>
      createWikiMarkdown({ wikiTitles: missing }).render('[[Nope]]'),
    ).toThrow();
    expect(missing).toEqual(new Set(['Nope']));
  });

  test('leaves code, escapes, and incomplete brackets alone', () => {
    const md = createWikiMarkdown();
    for (const source of [
      '`[[Foo Bar]]`',
      '\\[[Foo Bar]]',
      '[[Foo Bar]',
      '[[]]',
      '[[ | text]]',
      '[[Foo Bar|]]',
      '[[Foo\nBar]]',
    ]) {
      expect(md.render(source)).not.toContain('<a');
    }
    expect(md.render('```\n[[Foo Bar]]\n```')).not.toContain('<a');
  });

  test('never nests inside another link', () => {
    const md = createWikiMarkdown();
    // As with nested Markdown links, the inner link wins
    expect(md.render('[see [[Foo Bar]]](/x.html)')).toBe(
      '<p>[see <a href="/notes/foo-bar.html">Foo Bar</a>](/x.html)</p>\n',
    );
    expect(md.render('[See [[Foo Bar]]][description](/x.html)')).toBe(
      '<p>[See <a href="/notes/foo-bar.html">Foo Bar</a>]' +
        '<a href="/x.html">description</a></p>\n',
    );
    expect(() => md.render('<a href="/x.html">[[Foo Bar]]</a>')).toThrow(
      'content/page.md: wikilink "[[Foo Bar]]" is inside a link',
    );
  });

  test('leaves Markdown links with bracketed text to the link rule', () => {
    const md = createWikiMarkdown();
    expect(md.render('See [[1]](/paper.html).')).toBe(
      '<p>See <a href="/paper.html">[1]</a>.</p>\n',
    );
    expect(md.render('[[1]][paper]\n\n[paper]: /paper.html')).toBe(
      '<p><a href="/paper.html">[1]</a></p>\n',
    );
    expect(md.render('[[1]]\n\n[1]: /one.html')).toBe(
      '<p>[<a href="/one.html">1</a>]</p>\n',
    );
    expect(md.render('[[Foo Bar]][[Using `git`]]')).toBe(
      '<p><a href="/notes/foo-bar.html">Foo Bar</a>' +
        '<a href="/git.html">Using <code>git</code></a></p>\n',
    );
  });

  test('stays a wikilink before a footnote or undefined reference', () => {
    const md = createWikiMarkdown();
    expect(md.render('See [[Foo Bar]][^1].\n\n[^1]: Note')).toContain(
      'See <a href="/notes/foo-bar.html">Foo Bar</a><a class="footnote-ref"',
    );
    expect(md.render('[[Foo Bar]][nowhere]')).toBe(
      '<p><a href="/notes/foo-bar.html">Foo Bar</a>[nowhere]</p>\n',
    );
  });

  test('wins over a reference definition when a page has the title', () => {
    expect(
      createWikiMarkdown().render('[[Foo Bar]]\n\n[foo bar]: /elsewhere.html'),
    ).toBe('<p><a href="/notes/foo-bar.html">Foo Bar</a></p>\n');
  });

  test('accepts an escaped pipe, as in a table cell', () => {
    const md = createWikiMarkdown();
    expect(md.render('[[Foo Bar\\|text]]')).toBe(
      '<p><a href="/notes/foo-bar.html">text</a></p>\n',
    );
    expect(md.render('| a |\n|---|\n| [[Foo Bar\\|text]] |\n')).toContain(
      '<td><a href="/notes/foo-bar.html">text</a></td>',
    );
  });

  test('leaves wikilinks in image alt text unresolved', () => {
    const wikiTitles = new Set<string>();
    expect(
      createWikiMarkdown({ wikiTitles }).render(
        '![From [[Old Lecture]]](d.png)',
      ),
    ).toBe('<p><img src="d.png" alt="From Old Lecture"></p>\n');
    expect(wikiTitles.size).toBe(0);
  });

  test('resolves wikilinks in inline footnotes', () => {
    const md = createWikiMarkdown();
    expect(md.render('Text^[See [[Foo Bar]].]')).toContain(
      '<a href="/notes/foo-bar.html">Foo Bar</a>',
    );
    expect(() => md.render('Text^[See [[Missing]].]')).toThrow(
      'broken wikilink "[[Missing]]"',
    );
  });

  test('keeps links out of table of contents entries', () => {
    const env: { tocItems?: { innerHtml?: string }[] } = {};
    createWikiMarkdown().render('## About [[Foo Bar]] and [it](/x.html)', env);
    expect(env.tocItems?.[0].innerHtml).toBe('About Foo Bar and it');
  });

  test('names pages whose titles cannot be linked', () => {
    expect(() =>
      createWikiMarkdown(undefined, ['content/v.md (why)']).render('[[1.10]]'),
    ).toThrow(
      `no page has the title "1.10"; these pages' titles cannot be linked: content/v.md (why)`,
    );
  });

  test('fails when the link text contains a link', () => {
    expect(() =>
      createWikiMarkdown().render('[[Foo Bar|<https://example.com>]]'),
    ).toThrow('wikilink "[[Foo Bar|<https://example.com>]]" text cannot');
  });

  test('leaves footnotes and superlinks working', () => {
    const md = createWikiMarkdown();
    expect(md.render('Hi[^1] [[Foo Bar]]\n\n[^1]: Note')).toContain(
      'class="footnote-ref"',
    );
    expect(md.render('[Title][Description](/d.html)')).toContain(
      'class="button superlink"',
    );
  });

  test('is off without page titles', () => {
    const md = createMarkdown({
      base: '',
      basePath: '/',
      internalDomains: [],
      extensionToShikiLanguage: {},
      shikiLanguages: ['ts'],
      features: { search: true, favicon: false, footer: true, pickers: true },
      title: 'Test',
      titlePostfix: ' - Test',
      themeColor: 'steelblue',
    } as SiteVariables);
    expect(md.render('[[Foo Bar]]')).toBe('<p>[[Foo Bar]]</p>\n');
  });
});
