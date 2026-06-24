import { beforeAll, describe, expect, test } from 'bun:test';
import { renderMdx } from './mdx';
import { initHighlighter } from './shiki-highlighter';

beforeAll(async () => {
  await initHighlighter(['text']);
});

function render(source: string): string {
  return renderMdx(source, {
    filePath: '/content/page.md',
    templateParams: {
      page: { title: 'Page title' },
      site: { title: 'Site title', internalDomains: ['example.edu'] },
      vars: { course: 'CSCI E-22' },
    },
  });
}

describe('renderMdx', () => {
  test('binds page, site, and vars as native MDX expressions', () => {
    expect(render('# {page.title}: {site.title} ({vars.course})')).toContain(
      '<h1 id="page-title-site-title-csci-e-22">Page title: Site title (CSCI E-22)</h1>',
    );
  });

  test('renders native MDX comments as no output', () => {
    const html = render('Before\n\n{/* hidden {site.title} */}\n\nAfter');
    expect(html).toContain('<p>Before</p>');
    expect(html).toContain('<p>After</p>');
    expect(html).not.toContain('hidden');
  });

  test('rejects author import and export syntax through the MDX AST', () => {
    expect(() => render('import value from "./value.js"')).toThrow(
      'MDX import/export statements are not supported',
    );
    expect(() => render('export const value = 1')).toThrow(
      'MDX import/export statements are not supported',
    );
  });

  test('reports JSX replacements for removed 1.x syntax', () => {
    expect(() => render('!!! note\nBody\n!!!')).toThrow('use <Note>');
    expect(() => render('??? question Why?\nAnswer\n???')).toThrow(
      'use <Question> or <MultipleChoice>',
    );
    expect(() => render('{{{ _part.md }}}')).toThrow('use <Partial>');
    expect(() => render('+++\nLeft\n+++\nRight\n+++')).toThrow(
      'use <Columns> and <Column>',
    );
    expect(() => render('<%= site.title %>')).toThrow(
      'use native MDX expressions',
    );
    expect(() => render('<!--- old comment -->')).toThrow(
      'use native MDX comments',
    );
  });

  test('does not diagnose removed syntax inside code fences', () => {
    expect(render('```text\n!!! note\n{{{ _part.md }}}\n```')).toContain(
      '!!! note',
    );
  });

  test('does not diagnose removed syntax inside inline code', () => {
    const html = render(
      'Use `<%= site.title %>`, `{{{ _part.md }}}`, and `<!--- comment -->` as examples.',
    );
    expect(html).toContain('<code>&lt;%= site.title %&gt;</code>');
    expect(html).toContain('<code>{{{ _part.md }}}</code>');
    expect(html).toContain('<code>&lt;!--- comment --&gt;</code>');
  });

  test('renders note, warning, details, section, and subtitle components', () => {
    const html = render(
      [
        '<Note title={<>Read <strong>this</strong></>}>A **note**.</Note>',
        '<Warning>Careful.</Warning>',
        '<Details summary={<>More <strong>info</strong></>}>Hidden.</Details>',
        '<Section>',
        '',
        'Grouped.',
        '',
        '</Section>',
        '## Main <Subtitle>Secondary</Subtitle>',
      ].join('\n\n'),
    );

    expect(html).toContain('<div class="alert note">');
    expect(html).toContain(
      '<p class="title" id="read-this">Read <strong>this</strong></p>',
    );
    expect(html).toContain('<div class="alert warning">');
    expect(html).toContain(
      '<details><summary>More <strong>info</strong></summary>',
    );
    expect(html).toContain('<section><p>Grouped.</p></section>');
    expect(html).toContain(
      '<h2 id="main-secondary" class="has-subtitle">Main <span class="heading-subtitle">Secondary</span></h2>',
    );
  });

  test('renders question and multiple-choice components', () => {
    const html = render(
      [
        '<Question prompt="What is X?">An **answer**.</Question>',
        '<MultipleChoice prompt={<>Pick <strong>one</strong>.</>}>',
        '  <Choice>First</Choice>',
        '  <Choice correct>Second</Choice>',
        '</MultipleChoice>',
      ].join('\n\n'),
    );

    expect(html).toContain('<div class="question">');
    expect(html).toContain('<span>What is X?</span>');
    expect(html).toContain(
      '<div class="question-a-body" data-pagefind-ignore>',
    );
    expect(html).toContain('<strong>answer</strong>');
    expect(html).toContain('<div class="question question-multiple-choice">');
    expect(html).toContain('Pick <strong>one</strong>.');
    expect(html).toContain(
      '<div class="question-multiple-choice-option">First</div>',
    );
    expect(html).toContain(
      '<div class="question-multiple-choice-option" data-correct="">Second</div>',
    );
  });

  test('renders columns and slides from direct child components', () => {
    const html = render(
      [
        '<Columns>',
        '  <Column>Left</Column>',
        '  <Column>Right</Column>',
        '</Columns>',
        '<Slides>',
        '  <Slide>One</Slide>',
        '  <Slide>Two</Slide>',
        '</Slides>',
      ].join('\n'),
    );

    expect(html).toContain(
      '<div class="columns"><div>Left</div><div>Right</div></div>',
    );
    expect(html).toContain('<div class="slide-deck" data-slides-root="">');
    expect(html).toContain('<div class="slide" data-slide-index="0">One</div>');
    expect(html).toContain('<div class="slide" data-slide-index="1">Two</div>');
  });

  test('marks pages containing Slides for the page template', () => {
    const page: Record<string, unknown> = {};
    renderMdx('<Slides><Slide>One</Slide></Slides>', {
      filePath: '/content/slides.md',
      templateParams: { page, site: {}, vars: {} },
    });

    expect(page.slides).toBe(true);
    expect(page.slideCount).toBe(1);
  });

  test('collects heading, dinkus, and alert table-of-contents metadata', () => {
    const metadata = { tocItems: [] as unknown[], alertIds: [] as string[] };
    renderMdx('# One\n\n---\n\n<Note title="Read me">Body</Note>', {
      filePath: '/content/page.md',
      templateParams: { page: {}, site: {}, vars: {} },
      metadata,
    });

    expect(metadata.tocItems).toEqual([
      { kind: 'heading', level: '1', id: 'one', innerHtml: 'One' },
      { kind: 'dinkus' },
      { kind: 'alert', type: 'note', title: 'Read me' },
    ]);
    expect(metadata.alertIds).toEqual(['read-me']);
  });

  test('preserves Markdown link and list behavior', () => {
    const html = render(
      [
        '"Smart quotes" and -- punctuation.',
        '',
        '- [Internal](https://example.edu/page)',
        '- [External link](https://outside.example/page)',
      ].join('\n'),
    );

    expect(html).toContain('“Smart quotes”');
    expect(html).toContain('<ul class="styled-list">');
    expect(html).toContain('<div class="styled-list-item">');
    expect(html).toContain('<a href="https://example.edu/page">Internal</a>');
    expect(html).toContain(
      '<a href="https://outside.example/page" class="external" target="_blank" rel="noopener noreferrer">',
    );
  });

  test('renders inline and display math with accessible KaTeX output', () => {
    const html = render('Inline $E = mc^2$.\n\n$$\\frac{1}{2}$$\n\nPrice: $5');

    expect(html).toContain('class="katex"');
    expect(html).toContain('aria-label="E, equals, m, c, squared"');
    expect(html).toContain('class="katex-block"');
    expect(html).toContain('start fraction, 1, divided by, 2, end fraction');
    expect(html).toContain('Price: $5');
  });

  test('protects TeX braces from MDX expression parsing', () => {
    const html = render('$$\\sum_{i=1}^{n-1} i = \\frac{n(n-1)}{2}$$');
    expect(html).toContain('class="katex-block"');
    expect(html).toContain('sum');
  });

  test('leaves math delimiters inside inline code literal', () => {
    const html = render('Use `$$` for display math and render $x$ inline.');
    expect(html).toContain('<code>$$</code>');
    expect(html).toContain('class="katex"');
  });

  test('renders footnotes and definition lists', () => {
    const html = render(
      [
        'A statement.[^note]',
        '',
        '[^note]: Supporting text.',
        '',
        'Term',
        ': A **definition**.',
      ].join('\n'),
    );

    expect(html).toContain(
      'class="footnote-ref" href="#fn1" id="fnref1">1</a>',
    );
    expect(html).toContain(
      '<div class="footnotes"><p class="title">Footnotes</p><ol>',
    );
    expect(html).toContain(
      '<li id="fn1" class="footnote-item"><span class="footnote-marker" aria-hidden="true">1</span>',
    );
    expect(html).toContain('<dl><dt><a id="term"></a>Term</dt>');
    expect(html).toContain('<dd>A <strong>definition</strong>.</dd></dl>');
  });

  test('renders pipe tables with alignment', () => {
    const html = render(
      ['| Name | Value |', '| :--- | ---: |', '| Alpha | 1 |'].join('\n'),
    );

    expect(html).toContain('<table><thead><tr>');
    expect(html).toContain('<th align="left">Name</th>');
    expect(html).toContain('<th align="right">Value</th>');
    expect(html).toContain('<tbody><tr>');
    expect(html).toContain('<td align="left">Alpha</td>');
  });

  test('renders inline Markdown inside pipe-table cells', () => {
    const html = render(
      [
        '| Name | Documentation |',
        '| --- | --- |',
        '| **Alpha** | [Guide](/guide/) |',
      ].join('\n'),
    );

    expect(html).toContain('<td><strong>Alpha</strong></td>');
    expect(html).toContain('<td><a href="/guide/">Guide</a></td>');
  });

  test('accepts HTML-style void elements without closing slashes', () => {
    expect(render('<img src="/photo.jpg">\n\nLine<br>break')).toContain(
      '<img src="/photo.jpg">',
    );
    expect(render('<img src="/photo.jpg">\n\nLine<br>break')).toContain(
      'Line<br>break',
    );
  });

  test('passes fence language names to custom renderers', () => {
    const languages: string[] = [];
    renderMdx('```text\nhello\n```', {
      filePath: '/content/page.md',
      templateParams: { page: {}, site: {}, vars: {} },
      renderFence(_source, language) {
        languages.push(language);
        return '<pre>custom</pre>';
      },
    });
    expect(languages).toEqual(['text']);
  });

  test('exposes immutable page, site, and vars values', () => {
    expect(() => render('{site.title = "Changed"}')).toThrow();
  });

  test('preserves Date values in the immutable expression scope', () => {
    expect(
      renderMdx('{page.published.getUTCFullYear()}', {
        filePath: '/content/page.md',
        templateParams: {
          page: { published: new Date('2026-03-20T00:00:00.000Z') },
          site: {},
          vars: {},
        },
      }),
    ).toBe('2026');
  });

  test('validates component props and children', () => {
    expect(() => render('<Note unknown="x">Body</Note>')).toThrow(
      '<Note> does not accept "unknown"',
    );
    expect(() => render('<Details>Body</Details>')).toThrow(
      '<Details> requires a "summary" prop',
    );
    expect(() => render('<Columns><Column>Only</Column></Columns>')).toThrow(
      '<Columns> requires exactly two <Column> children',
    );
    expect(() =>
      render(
        '<MultipleChoice prompt="Pick"><Choice correct>Only</Choice></MultipleChoice>',
      ),
    ).toThrow('<MultipleChoice> requires at least two <Choice> children');
    expect(() =>
      render(
        '<MultipleChoice prompt="Pick"><Choice correct>A</Choice><Choice correct>B</Choice></MultipleChoice>',
      ),
    ).toThrow('<MultipleChoice> requires exactly one correct <Choice>');
    expect(() => render('<Choice correct>Orphan</Choice>')).toThrow(
      '<Choice> must be a direct child of <MultipleChoice>',
    );
  });
});
