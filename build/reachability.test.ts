import { describe, expect, test } from 'bun:test';
import {
  collectReachableSiteAssets,
  collectReachableHtmlAssets,
} from './reachability';

describe('reachability', () => {
  test.each([
    ['/', ['index.html'], []],
    [
      '/about',
      ['index.html', 'about/index.html', 'about.html'],
      ['about/index.html'],
    ],
    ['/about', ['index.html', 'about.html'], ['about.html']],
    ['/about/', ['index.html', 'about.html'], []],
    ['/about/', ['index.html', 'about/index.html'], ['about/index.html']],
    [
      '/about.html',
      ['index.html', 'about/index.html', 'about.html'],
      ['about.html'],
    ],
    ['docs/../about.html', ['index.html', 'about.html'], ['about.html']],
    ['/missing', ['index.html', 'about.html'], []],
    ['/guide.pdf', ['index.html', 'guide.pdf/index.html'], []],
  ])('resolves %s against %j', (target, paths, followed) => {
    const htmlAnalysisByPath = new Map(
      paths.map(outputPath => [
        outputPath,
        {
          outgoingTargets: new Set(outputPath === 'index.html' ? [target] : []),
        },
      ]),
    );
    expect(collectReachableHtmlAssets({ htmlAnalysisByPath })).toEqual(
      ['index.html', ...followed].sort(),
    );
  });

  test('deduplicates cyclic routes and collects only known non-HTML assets from the chosen root', () => {
    const htmlAnalysisByPath = new Map([
      ['index.html', { outgoingTargets: new Set(['/hidden.pdf']) }],
      [
        'start.html',
        {
          outgoingTargets: new Set([
            '/about',
            '/about/',
            '/about/index.html',
            '/guide.pdf',
            '/unknown.png',
            '/asset',
            '/',
          ]),
        },
      ],
      [
        'about/index.html',
        { outgoingTargets: new Set(['/start.html', '/guide.pdf', '/z.png']) },
      ],
    ]);

    expect(
      collectReachableSiteAssets({
        htmlAnalysisByPath,
        rootPath: 'start.html',
        knownAssetTargets: new Set([
          '/guide.pdf',
          '/z.png',
          '/asset',
          '/',
          '/start.html',
          '/about/index.html',
          '/hidden.pdf',
        ]),
      }),
    ).toEqual({
      reachableHtmlPaths: ['about/index.html', 'index.html', 'start.html'],
      reachableAssetTargets: ['/guide.pdf', '/hidden.pdf', '/z.png'],
    });
  });

  test('collectReachableSiteAssets follows HTML outputs and collects linked internal assets generically', () => {
    const htmlAnalysisByPath = new Map([
      [
        'index.html',
        {
          outgoingTargets: new Set<string>([
            '/about/',
            '/docs/guide.pdf',
            '/img/logo.png',
          ]),
        },
      ],
      [
        'about/index.html',
        { outgoingTargets: new Set<string>(['/deep.html']) },
      ],
      ['deep.html', { outgoingTargets: new Set<string>() }],
      [
        'orphan/index.html',
        { outgoingTargets: new Set<string>(['/hidden.pdf']) },
      ],
    ]);

    const result = collectReachableSiteAssets({
      htmlAnalysisByPath,
      knownAssetTargets: new Set([
        '/docs/guide.pdf',
        '/img/logo.png',
        '/hidden.pdf',
      ]),
      rootPath: 'index.html',
    });

    expect(result).toEqual({
      reachableHtmlPaths: ['about/index.html', 'deep.html', 'index.html'],
      reachableAssetTargets: ['/docs/guide.pdf', '/img/logo.png'],
    });
  });

  test('collectReachableHtmlAssets returns only reachable html outputs', () => {
    const htmlAnalysisByPath = new Map([
      ['index.html', { outgoingTargets: new Set<string>(['/about.html']) }],
      ['about.html', { outgoingTargets: new Set<string>() }],
      ['orphan.html', { outgoingTargets: new Set<string>() }],
    ]);

    expect(collectReachableHtmlAssets({ htmlAnalysisByPath })).toEqual([
      'about.html',
      'index.html',
    ]);
  });

  test('throws when the reachability root is missing', () => {
    expect(() =>
      collectReachableSiteAssets({
        htmlAnalysisByPath: new Map([
          ['about.html', { outgoingTargets: new Set<string>() }],
        ]),
      }),
    ).toThrow('Pagefind reachability root not found');
  });
});
