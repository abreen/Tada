import { describe, expect, test } from 'bun:test';
import _ from 'lodash';
import { compileTemplate } from '../build/lodash-template';
import { encodeAuthoredUrl } from '../build/template-globals';
import HEADING_TEMPLATE from './_heading.html' with { type: 'text' };

function renderHeading(params: Record<string, unknown>): string {
  return _.template(HEADING_TEMPLATE)({ ...params, encodeAuthoredUrl });
}

describe('_heading.html template', () => {
  test('encodes authored parent URLs before rendering href attributes', () => {
    const html = renderHeading({
      page: {
        parent: '/docs/my page.html?label=<Docs>"',
        parentLabel: 'Docs',
        titleHtml: 'Title',
      },
    });

    expect(html).toContain('href="/docs/my%20page.html?label=%3CDocs%3E%22"');
  });

  test('preserves existing percent escapes in authored parent URLs', () => {
    const html = renderHeading({
      page: {
        parent: '/docs/my%20page.html?label=hello%20world',
        parentLabel: 'Docs',
        titleHtml: 'Title',
      },
    });

    expect(html).toContain('href="/docs/my%20page.html?label=hello%20world"');
    expect(html).not.toContain('my%2520page');
  });

  test('preserves existing percent escapes for reserved URL characters', () => {
    const html = renderHeading({
      page: {
        parent: '/docs/a%2Fb.html?label=hello%20world',
        parentLabel: 'Docs',
        titleHtml: 'Title',
      },
    });

    expect(html).toContain('href="/docs/a%2Fb.html?label=hello%20world"');
    expect(html).not.toContain('a%252Fb');
  });

  test('escapes the breadcrumb label but keeps the title HTML', () => {
    const html = compileTemplate(HEADING_TEMPLATE)({
      page: {
        parent: '/docs/index.html',
        parentLabel: 'Docs & <Notes>',
        titleHtml: 'Width is 5&quot; <b>bold</b>',
      },
      encodeAuthoredUrl,
    });

    expect(html).toContain('data-pagefind-ignore>Docs &amp; &lt;Notes&gt;</a>');
    expect(html).toContain('>Width is 5&quot; <b>bold</b></h1>');
  });
});
