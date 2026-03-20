const { describe, expect, test } = require('bun:test');
const {
  collectDirectSiteAssetLinks,
  collectReachableSiteAssets,
} = require('./reachability');

describe('reachability', () => {
  test('collectDirectSiteAssetLinks resolves relative links and ignores excluded links', () => {
    const result = collectDirectSiteAssetLinks({
      html: `
        <a href="../guide.html?x=1#top">Guide</a>
        <a class="disabled" href="/ignore/">Ignore</a>
        <a href="https://example.com/">External</a>
        <a href="#section">Anchor</a>
        <a href="mailto:test@example.com">Mail</a>
        <a href="/docs/guide.pdf#page=2">PDF</a>
      `,
      fromAssetPath: 'section/index.html',
      knownAssets: new Set(['guide.html', 'ignore/index.html']),
      knownPdfPaths: new Set(['/docs/guide.pdf']),
      basePath: '/',
    });

    expect(result).toEqual({
      htmlAssetPaths: ['guide.html'],
      pdfPaths: ['/docs/guide.pdf'],
    });
  });

  test('collectDirectSiteAssetLinks honors basePath and meta refresh', () => {
    const result = collectDirectSiteAssetLinks({
      html: `
        <a href="/course/faq/">FAQ</a>
        <meta http-equiv="refresh" content="0; url='/course/refresh/'" />
      `,
      fromAssetPath: 'index.html',
      knownAssets: new Set(['faq/index.html', 'refresh/index.html']),
      basePath: '/course',
    });

    expect(result).toEqual({
      htmlAssetPaths: ['faq/index.html', 'refresh/index.html'],
      pdfPaths: [],
    });
  });

  test('collectReachableSiteAssets reuses direct link parsing for html and pdf reachability', () => {
    const htmlAssetsByPath = new Map([
      [
        'index.html',
        `
          <a href="/about/">About</a>
          <a href="/docs/guide.pdf">Guide PDF</a>
        `,
      ],
      [
        'about/index.html',
        `<meta http-equiv="refresh" content="0; url='/redirect/'" />`,
      ],
      ['redirect/index.html', '<p>Done</p>'],
      ['orphan/index.html', '<p>Orphan</p>'],
    ]);

    const result = collectReachableSiteAssets({
      htmlAssetsByPath,
      knownPdfPaths: new Set(['/docs/guide.pdf']),
      rootPath: 'index.html',
      basePath: '/',
    });

    expect(result).toEqual({
      reachableHtmlPaths: [
        'about/index.html',
        'index.html',
        'redirect/index.html',
      ],
      reachablePdfPaths: ['/docs/guide.pdf'],
    });
  });
});
