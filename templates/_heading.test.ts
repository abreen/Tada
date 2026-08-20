import { describe, expect, test } from 'bun:test';
import _ from 'lodash';
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
});
