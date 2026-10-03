import { describe, expect, test } from 'bun:test';
import _ from 'lodash';
import { compileTemplate } from '../build/lodash-template';
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
  test('renders the charset declaration as the first element in head', () => {
    const html = renderTop('sans', 'standard');

    expect(html).toMatch(/<head>\s*<meta charset="UTF-8" \/>/);
  });

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

  test('defines the closed stroke lengths before styles load', () => {
    const html = renderTop('sans', 'standard');
    const icon = html.match(/<svg\b[^>]*class="menu-icon"[^>]*>/)?.[0];
    expect(icon).toContain('stroke-dasharray="18 36"');
    expect(icon).toContain('stroke-dashoffset="0"');
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
      {
        serif: { regular: 'fonts/body.woff2' },
        serifMono: { regular: 'fonts/mono.woff2' },
      },
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

  test('uses bundled families for the loading barrier with tuning alone', () => {
    const html = renderTop('serif', 'standard', undefined, undefined, false, {
      serif: { tuning: { scale: 1.1 } },
      serifMono: { tuning: { scale: 0.85 } },
    });
    expect(html).toContain("'Source Serif 4'");
    expect(html).toContain("'Courier Prime'");
    expect(html).not.toContain('Tada Custom Serif');
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

  test('escapes plain-text page and site values', () => {
    const html = compileTemplate(TOP_TEMPLATE)({
      site: {
        defaultFont: 'sans',
        defaultContrast: 'standard',
        features: { favicon: true, search: false },
        title: 'Tom & Jerry <Lab>',
        titlePostfix: ' - Tom & Jerry <Lab>',
        symbol: 'A&B',
      },
      page: {
        title: 'Width is 5" bold & more',
        description: 'Uses a < b and 6" rulers',
        author: { name: `Ann "Annie" O'Neil` },
        template: 'default',
      },
      tadaVersion: '0.0.0',
      isWatchMode: false,
      speculationRulesHrefMatches: '/*',
      render: () => '',
    });

    expect(html).toContain(
      '<meta name="description" content="Uses a &lt; b and 6&quot; rulers" />',
    );
    expect(html).toContain(
      '<meta property="og:title" content="Width is 5&quot; bold &amp; more" />',
    );
    expect(html).toContain(
      '<meta name="author" content="Ann &quot;Annie&quot; O&#39;Neil" />',
    );
    expect(html).toContain(
      '<title>Width is 5&quot; bold &amp; more - Tom &amp; Jerry &lt;Lab&gt;</title>',
    );
    expect(html).toContain(
      '<meta name="apple-mobile-web-app-title" content="A&amp;B">',
    );
    expect(html).toContain(
      '<span class="logo" aria-hidden="true">A&amp;B</span>',
    );
    expect(html).toContain(
      '<span class="site-title" aria-hidden="true">Tom &amp; Jerry &lt;Lab&gt;</span>',
    );
  });
});
