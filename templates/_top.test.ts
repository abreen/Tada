import { describe, expect, test } from 'bun:test';
import _ from 'lodash';
import TOP_TEMPLATE from './_top.html' with { type: 'text' };

function renderTop(
  defaultFont: 'sans' | 'serif',
  defaultContrast: 'standard' | 'high',
  banner?: string,
  bannerHtml?: string,
  search = false,
) {
  return _.template(TOP_TEMPLATE)({
    site: {
      defaultFont,
      defaultContrast,
      banner,
      features: { favicon: false, search },
      title: 'Test site',
      titlePostfix: ' - Test site',
    },
    bannerHtml,
    page: { title: 'Page', template: 'default' },
    tadaVersion: '0.0.0',
    isWatchMode: true,
    speculationRulesHrefMatches: '/*',
    render: () => '',
  });
}

describe('_top.html template', () => {
  test('keeps search disabled until its client component mounts', () => {
    const html = renderTop('sans', 'standard', undefined, undefined, true);

    expect(html).toContain('name="quick-search"');
    expect(html).toContain(
      'aria-controls="quick-search-results"\n                 disabled',
    );
    expect(html).not.toContain('previousElementSibling.disabled=false');
  });

  test('renders sans and standard defaults without effective state attributes', () => {
    const html = renderTop('sans', 'standard');
    const openingTag = html.match(/<html[^>]*>/)?.[0];

    expect(openingTag).toContain('data-default-font-preference="sans"');
    expect(openingTag).toContain('data-default-contrast-preference="standard"');
    expect(openingTag).not.toContain(' data-font-preference=');
    expect(openingTag).not.toContain(' data-contrast-preference=');
  });

  test('renders serif and high contrast as effective build-time defaults', () => {
    const html = renderTop('serif', 'high');
    const openingTag = html.match(/<html[^>]*>/)?.[0];

    expect(openingTag).toContain('data-default-font-preference="serif"');
    expect(openingTag).toContain('data-default-contrast-preference="high"');
    expect(openingTag).toContain('data-font-preference="serif"');
    expect(openingTag).toContain('data-contrast-preference="high"');
  });

  test('renders a non-empty banner without a title', () => {
    const html = renderTop(
      'sans',
      'standard',
      '**Scheduled maintenance**',
      '<p><strong>Scheduled maintenance</strong></p>\n',
    );

    expect(html).toContain(
      '<aside class="site-banner alert" data-pagefind-ignore>',
    );
    expect(html).toContain('<p><strong>Scheduled maintenance</strong></p>');
    expect(html).not.toContain('<p class="title">');
    expect(html).not.toContain('&lt;strong&gt;');
  });

  test.each([undefined, ''])('omits an empty banner (%p)', banner => {
    const html = renderTop('sans', 'standard', banner, '');

    expect(html).not.toContain('<aside class="site-banner');
  });
});
