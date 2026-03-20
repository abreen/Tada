const { describe, expect, test } = require('bun:test');
const MarkdownIt = require('markdown-it');
const deflist = require('markdown-it-deflist');
const applyBasePathPlugin = require('./apply-base-path-plugin');
const deflistIdPlugin = require('./deflist-id-plugin');
const externalLinksPlugin = require('./external-links-plugin');
const headingSubtitlePlugin = require('./heading-subtitle-plugin');
const { createMarkdown } = require('./utils/markdown');

describe('apply-base-path-plugin', () => {
  test('rewrites internal links, images, and raw html image sources', () => {
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
      ].join('\n'),
    );

    expect(html).toContain('href="/course/src/example.html?view=1#top"');
    expect(html).toContain('src="/course/images/pic.png"');
    expect(html).toContain('src="/course/images/raw.png"');
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
      { basePath: '/', internalDomains: [], codeLanguages: {}, features: {} },
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
