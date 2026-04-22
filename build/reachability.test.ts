import { describe, expect, test } from 'bun:test';
import {
  collectReachableSiteAssets,
  collectReachableHtmlAssets,
} from './reachability';

describe('reachability', () => {
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
