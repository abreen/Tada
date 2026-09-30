import { expect, test } from 'bun:test';
import template from 'lodash/template';
import TOP from './_top.html' with { type: 'text' };
import { encodePublicAssetPath } from '../build/custom-fonts';

function render(site: Record<string, unknown> = {}) {
  return template(TOP)({
    site: { features: { favicon: true }, title: 'Test', ...site },
    page: {},
    tadaVersion: 'test',
    isWatchMode: true,
    encodePublicAssetPath,
    render: () => '',
  });
}

test('logo takes precedence and remains decorative', () => {
  const html = render({ logo: 'brand/logo %.svg', symbol: 'TADA' });
  expect(html).toContain(
    'src="/brand/logo%20%25.svg" alt="" aria-hidden="true"',
  );
  expect(html).not.toContain('<span class="logo"');
});

test('symbol fallback and omitted branding', () => {
  expect(render({ symbol: 'TADA' })).toContain(
    '<span class="logo" aria-hidden="true">TADA</span>',
  );
  expect(render()).not.toContain('class="logo');
});

test('custom favicon emits only its ICO link', () => {
  const html = render({ favicon: 'brand/icon.ico' });
  expect(html).toContain('href="/brand/icon.ico"');
  expect(html.match(/rel="icon"/g)).toHaveLength(1);
  expect(html).not.toContain('apple-touch-icon');
  expect(html).not.toContain('manifest.json');
  expect(html).not.toContain('web-app');
  expect(
    render({ favicon: 'brand/icon.ico', features: { favicon: false } }),
  ).not.toContain('rel="icon"');
});
