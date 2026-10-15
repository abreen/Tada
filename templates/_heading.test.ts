import { describe, expect, test } from 'bun:test';
import { encodeAuthoredUrl } from '../build/template-globals';
import HEADING_TEMPLATE from './_heading.html' with { type: 'text' };
import BREADCRUMBS_TEMPLATE from './_breadcrumbs.html' with { type: 'text' };
import { renderWithPartials } from './test-helpers';

function renderHeading(params: Record<string, unknown>): string {
  return renderWithPartials(
    HEADING_TEMPLATE,
    { encodeAuthoredUrl, ...params },
    { '_breadcrumbs.html': BREADCRUMBS_TEMPLATE },
  );
}

describe('_heading.html template', () => {
  test('encodes authored breadcrumb URLs before rendering href attributes', () => {
    const html = renderHeading({
      page: {
        breadcrumbs: [
          { url: '/docs/my page.html?label=<Docs>"', label: 'Docs' },
        ],
        title: 'Title',
        titleHtml: 'Title',
      },
    });

    expect(html).toContain('href="/docs/my%20page.html?label=%3CDocs%3E%22"');
  });

  test('preserves existing percent escapes in authored breadcrumb URLs', () => {
    const html = renderHeading({
      page: {
        breadcrumbs: [
          { url: '/docs/my%20page.html?label=hello%20world', label: 'Docs' },
        ],
        title: 'Title',
        titleHtml: 'Title',
      },
    });

    expect(html).toContain('href="/docs/my%20page.html?label=hello%20world"');
    expect(html).not.toContain('my%2520page');
  });

  test('preserves existing percent escapes for reserved URL characters', () => {
    const html = renderHeading({
      page: {
        breadcrumbs: [
          { url: '/docs/a%2Fb.html?label=hello%20world', label: 'Docs' },
        ],
        title: 'Title',
        titleHtml: 'Title',
      },
    });

    expect(html).toContain('href="/docs/a%2Fb.html?label=hello%20world"');
    expect(html).not.toContain('a%252Fb');
  });

  test('escapes the breadcrumb label but keeps the title HTML', () => {
    const html = renderHeading({
      page: {
        breadcrumbs: [
          { url: '/docs/index.html', label: 'Docs & <Notes> **plain**' },
        ],
        title: 'Width is 5" bold',
        titleHtml: 'Width is 5&quot; <b>bold</b>',
      },
    });

    expect(html).toContain('>Docs &amp; &lt;Notes&gt; **plain**</a>');
    expect(html).toContain('>Width is 5&quot; <b>bold</b></h1>');
  });
});

describe('breadcrumb trail', () => {
  test('renders ordered ancestors and an unlinked escaped current title', () => {
    const html = renderHeading({
      page: {
        breadcrumbs: [
          { label: 'Labs', url: '/labs/index.html' },
          { label: 'Lab 0', url: '/labs/00/index.html' },
        ],
        title: 'Counting & <vowels>',
        titleHtml: 'Counting &amp; <em>vowels</em>',
      },
    });
    expect(html).toContain(
      '<nav class="breadcrumbs" aria-label="Breadcrumb" data-pagefind-ignore>',
    );
    expect(html).toContain('<ol>');
    expect(html.indexOf('>Labs</a>')).toBeLessThan(html.indexOf('>Lab 0</a>'));
    expect(html.indexOf('>Lab 0</a>')).toBeLessThan(
      html.indexOf('aria-current="page"'),
    );
    expect(html).toContain(
      '<span aria-current="page">Counting &amp; &lt;vowels&gt;</span>',
    );
    expect(html.match(/aria-hidden="true"/g)).toHaveLength(2);
    expect(html).toContain('>Counting &amp; <em>vowels</em></h1>');
  });

  test('shows code page titles as code', () => {
    const html = renderHeading({
      page: {
        template: 'code',
        breadcrumbs: [
          { label: 'Labs', url: '/labs/index.html' },
          { label: 'A<B>.java', url: '/A.java.html', isCodePage: true },
        ],
        title: 'Foo.java',
        titleHtml: '<code>Foo.java</code>',
      },
    });
    expect(html).toContain('<a href="/labs/index.html">Labs</a>');
    expect(html).toContain(
      '<a class="code-page" href="/A.java.html"><code>A&lt;B&gt;.java</code></a>',
    );
    expect(html).toContain(
      '<span class="code-page" aria-current="page"><code>Foo.java</code></span>',
    );
  });

  test.each([{ breadcrumbs: undefined }, { breadcrumbs: [] }])(
    'omits navigation for absent or empty ancestors: %j',
    ({ breadcrumbs }) => {
      const html = renderHeading({
        page: { breadcrumbs, title: 'Title', titleHtml: 'Title' },
      });
      expect(html).not.toContain('aria-label="Breadcrumb"');
      expect(html).toContain('>Title</h1>');
    },
  );
});

describe('untitled page heading', () => {
  test('renders nothing for a page without a title, date, or author', () => {
    const html = renderHeading({ page: {} });

    expect(html.trim()).toBe('');
  });

  test('renders the date without a heading for an untitled page', () => {
    const html = renderHeading({
      page: { published: '2026-01-02' },
      isoDate: () => '2026-01-02',
      readableDate: () => 'January 2, 2026',
    });

    expect(html).toContain('<div class="title-and-info" data-pagefind-body>');
    expect(html).toContain('January 2, 2026');
    expect(html).not.toContain('<h1');
  });
});
