import { describe, expect, test } from 'bun:test';
import fs from 'fs';
import path from 'path';
import _ from 'lodash';
import { classNames } from './globals';

function renderNav(navData: unknown[], basePath: string = ''): string {
  const templatePath = path.resolve(import.meta.dir, '../templates/_nav.html');
  const templateStr = fs.readFileSync(templatePath, 'utf-8');
  return _.template(templateStr)({
    json: () => navData,
    cx: classNames,
    applyBasePath: (p: string) => basePath + p,
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
    expect(html).not.toContain('href=');
    expect(html).toContain('disabled');
    expect(html).toContain('external');
  });
});
