import { describe, expect, test } from 'bun:test';
import { compileTemplate } from '../build/lodash-template';
import { encodeAuthoredUrl } from '../build/template-globals';
import HEADING_TEMPLATE from './_heading.html' with { type: 'text' };

function renderHeading(params: Record<string, unknown>): string {
  return compileTemplate(HEADING_TEMPLATE)({ ...params, encodeAuthoredUrl });
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
    const html = compileTemplate(HEADING_TEMPLATE)({
      page: {
        breadcrumbs: [
          { url: '/docs/index.html', label: 'Docs & <Notes> **plain**' },
        ],
        title: 'Width is 5" bold',
        titleHtml: 'Width is 5&quot; <b>bold</b>',
      },
      encodeAuthoredUrl,
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
