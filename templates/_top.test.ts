import { describe, expect, test } from 'bun:test';
import _ from 'lodash';
import TOP_TEMPLATE from './_top.html' with { type: 'text' };

function renderTop(
  defaultFont: 'sans' | 'serif',
  defaultContrast: 'standard' | 'high',
  banner?: string,
  bannerHtml?: string,
  search = false,
  fontOverrides?: { serif?: object; serifMono?: object },
) {
  return _.template(TOP_TEMPLATE)({
    site: {
      defaultFont,
      defaultContrast,
      banner,
      fontOverrides,
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
  test('renders one menu icon with three persistent SVG strokes', () => {
    const html = renderTop('sans', 'standard');
    const icon = html.match(/<svg\b[^>]*class="menu-icon"[^>]*>/)?.[0];

    expect(icon).toBeDefined();
    expect(icon).toContain('viewBox="0 0 24 24"');
    expect(icon).toContain('aria-hidden="true"');
    expect(icon).toContain('focusable="false"');
    expect(html.match(/class="menu-icon-line/g)).toHaveLength(3);
    expect(html).toContain(
      'class="menu-icon-line menu-icon-line-top" d="M3 6h18"',
    );
    expect(html).toContain(
      'class="menu-icon-line menu-icon-line-middle" d="M3 12h18"',
    );
    expect(html).toContain(
      'class="menu-icon-line menu-icon-line-bottom" d="M3 18h18"',
    );
  });

  test('keeps search disabled until its client component mounts', () => {
    const html = renderTop('sans', 'standard', undefined, undefined, true);
    const searchInput = html.match(
      /<input\b[^>]*\bname="quick-search"[^>]*>/,
    )?.[0];

    expect(searchInput).toBeDefined();
    expect(searchInput).toMatch(/\sdisabled(?:\s|\/>)/);
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

  test('selects the primary common faces for the font-loading barrier', () => {
    const bundledHtml = renderTop('sans', 'standard');
    const customHtml = renderTop(
      'sans',
      'standard',
      undefined,
      undefined,
      false,
      { serif: {}, serifMono: {} },
    );

    expect(bundledHtml).toContain("sans: ['Inter', 'Google Sans Code']");
    expect(bundledHtml).toContain("'Source Serif 4'");
    expect(bundledHtml).toContain("'Courier Prime'");
    expect(customHtml).toContain("'Tada Custom Serif'");
    expect(customHtml).toContain("'Tada Custom Serif Mono'");
    expect(customHtml).toContain(
      `document.fonts.load('normal 400 1em "' + bodyFamily + '"')`,
    );
    expect(customHtml).toContain(
      `document.fonts.load('normal 700 1em "' + bodyFamily + '"')`,
    );
    expect(customHtml).toContain(
      `document.fonts.load('normal 400 1em "' + monoFamily + '"')`,
    );
    expect(customHtml).not.toContain('document.fonts.ready');
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
