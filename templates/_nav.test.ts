import { describe, expect, test } from 'bun:test';
import fs from 'fs';
import path from 'path';
import _ from 'lodash';
import { classNames, encodeAuthoredUrl } from '../build/template-globals';

function readTemplateForTest(fileName: string): string {
  return fs.readFileSync(path.join(import.meta.dir, fileName), 'utf-8');
}

const NAV_TEMPLATE = readTemplateForTest('_nav.html');

function renderNav(navData: unknown[]): string {
  return _.template(NAV_TEMPLATE)({
    config: () => navData,
    cx: classNames,
    encodeAuthoredUrl,
  });
}

describe('_nav.html template', () => {
  test('external links have target="_blank"', () => {
    const navData = [
      {
        title: 'Links',
        links: [{ text: 'Outside', external: 'https://example.com' }],
      },
    ];

    const html = renderNav(navData);
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toContain('href="https://example.com"');
    expect(html).toContain('class="external"');
  });

  test('internal links do not have target="_blank"', () => {
    const navData = [
      { title: 'Links', links: [{ text: 'Home', internal: '/index.html' }] },
    ];

    const html = renderNav(navData);
    expect(html).not.toContain('target="_blank"');
    expect(html).toContain('href="/index.html"');
  });

  test('disabled external links still have target="_blank"', () => {
    const navData = [
      {
        title: 'Links',
        links: [
          { text: 'Soon', external: 'https://example.com', disabled: true },
        ],
      },
    ];

    const html = renderNav(navData);
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).not.toContain('href=');
    expect(html).toContain('disabled');
    expect(html).toContain('external');
  });

  test('encodes authored link URLs before rendering href attributes', () => {
    const navData = [
      {
        title: 'Links',
        links: [
          {
            text: 'Outside',
            external: 'https://example.com/my page?q=<tag>"quote"',
          },
        ],
      },
    ];

    const html = renderNav(navData);
    expect(html).toContain(
      'href="https://example.com/my%20page?q=%3Ctag%3E%22quote%22"',
    );
  });

  test('preserves existing percent escapes in authored link URLs', () => {
    const navData = [
      {
        title: 'Links',
        links: [
          {
            text: 'Outside',
            external: 'https://example.com/search?q=hello%20world',
          },
        ],
      },
    ];

    const html = renderNav(navData);
    expect(html).toContain('href="https://example.com/search?q=hello%20world"');
    expect(html).not.toContain('hello%2520world');
  });

  test('preserves existing percent escapes for reserved URL characters', () => {
    const navData = [
      {
        title: 'Links',
        links: [
          {
            text: 'Outside',
            external: 'https://example.com/files/a%2Fb?q=hello%20world',
          },
        ],
      },
    ];

    const html = renderNav(navData);
    expect(html).toContain(
      'href="https://example.com/files/a%2Fb?q=hello%20world"',
    );
    expect(html).not.toContain('a%252Fb');
  });
});
