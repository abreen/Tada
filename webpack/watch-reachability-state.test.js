const { describe, expect, test } = require('bun:test');
const { collectReachableSiteAssets } = require('./reachability');
const WatchReachabilityState = require('./watch-reachability-state');

function createReader(htmlByPath) {
  const calls = [];

  return {
    calls,
    read(assetPath) {
      calls.push(assetPath);
      if (!htmlByPath.has(assetPath)) {
        throw new Error(`Missing HTML asset: ${assetPath}`);
      }
      return htmlByPath.get(assetPath);
    },
  };
}

function createState(htmlEntries) {
  const htmlByPath = new Map(Object.entries(htmlEntries));
  const reader = createReader(htmlByPath);
  const state = new WatchReachabilityState();

  state.setKnownAssets(new Set(htmlByPath.keys()));
  state.rebuild(assetPath => reader.read(assetPath));

  return { htmlByPath, reader, state };
}

describe('WatchReachabilityState', () => {
  test('rebuild matches full traversal reachability', () => {
    const htmlByPath = new Map([
      ['index.html', '<a href="/about/">About</a>'],
      ['about/index.html', '<a href="/deep/">Deep</a>'],
      ['deep/index.html', '<p>Deep</p>'],
      ['orphan/index.html', '<p>Orphan</p>'],
    ]);
    const reader = createReader(htmlByPath);
    const state = new WatchReachabilityState();

    state.setKnownAssets(new Set(htmlByPath.keys()));
    state.rebuild(assetPath => reader.read(assetPath));

    expect(state.getReachablePaths()).toEqual(
      collectReachableSiteAssets({ htmlAssetsByPath: htmlByPath })
        .reachableHtmlPaths,
    );
  });

  test('incremental update adds a newly linked subtree', () => {
    const { htmlByPath, reader, state } = createState({
      'index.html': '<a href="/about/">About</a>',
      'about/index.html': '<p>About</p>',
      'hidden/index.html': '<a href="/bonus/">Bonus</a>',
      'bonus/index.html': '<p>Bonus</p>',
    });

    reader.calls.length = 0;
    htmlByPath.set(
      'about/index.html',
      '<a href="/hidden/">Reveal hidden subtree</a>',
    );
    state.setKnownAssets(new Set(htmlByPath.keys()));
    state.applyIncremental({
      changedAssetPaths: new Set(['about/index.html']),
      removedAssetPaths: new Set(),
      readHtmlForAsset: assetPath => reader.read(assetPath),
    });

    expect(reader.calls).toEqual(['about/index.html']);
    expect(state.getReachablePaths()).toEqual([
      'about/index.html',
      'bonus/index.html',
      'hidden/index.html',
      'index.html',
    ]);
  });

  test('incremental update removes a subtree when its only parent stops linking to it', () => {
    const { htmlByPath, reader, state } = createState({
      'index.html': '<a href="/about/">About</a>',
      'about/index.html': '<a href="/hidden/">Hidden</a>',
      'hidden/index.html': '<a href="/bonus/">Bonus</a>',
      'bonus/index.html': '<p>Bonus</p>',
    });

    reader.calls.length = 0;
    htmlByPath.set('about/index.html', '<p>About</p>');
    state.setKnownAssets(new Set(htmlByPath.keys()));
    state.applyIncremental({
      changedAssetPaths: new Set(['about/index.html']),
      removedAssetPaths: new Set(),
      readHtmlForAsset: assetPath => reader.read(assetPath),
    });

    expect(reader.calls).toEqual(['about/index.html']);
    expect(state.getReachablePaths()).toEqual([
      'about/index.html',
      'index.html',
    ]);
  });

  test('removing one of two parents keeps the child reachable', () => {
    const { htmlByPath, reader, state } = createState({
      'index.html': '<a href="/about/">About</a><a href="/keep/">Keep</a>',
      'about/index.html': '<a href="/child/">Child</a>',
      'keep/index.html': '<a href="/child/">Child</a>',
      'child/index.html': '<p>Child</p>',
    });

    htmlByPath.delete('about/index.html');
    state.setKnownAssets(new Set(htmlByPath.keys()));
    state.applyIncremental({
      changedAssetPaths: new Set(),
      removedAssetPaths: new Set(['about/index.html']),
      readHtmlForAsset: assetPath => reader.read(assetPath),
    });

    expect(state.getReachablePaths()).toEqual([
      'child/index.html',
      'index.html',
      'keep/index.html',
    ]);
  });

  test('a supported cycle remains reachable and drops once external support is removed', () => {
    const { htmlByPath, reader, state } = createState({
      'index.html': '<a href="/support/">Support</a>',
      'support/index.html': '<a href="/a/">A</a>',
      'a/index.html': '<a href="/b/">B</a>',
      'b/index.html': '<a href="/a/">A</a>',
    });

    expect(state.getReachablePaths()).toEqual([
      'a/index.html',
      'b/index.html',
      'index.html',
      'support/index.html',
    ]);

    reader.calls.length = 0;
    htmlByPath.set('support/index.html', '<p>No links</p>');
    state.setKnownAssets(new Set(htmlByPath.keys()));
    state.applyIncremental({
      changedAssetPaths: new Set(['support/index.html']),
      removedAssetPaths: new Set(),
      readHtmlForAsset: assetPath => reader.read(assetPath),
    });

    expect(reader.calls).toEqual(['support/index.html']);
    expect(state.getReachablePaths()).toEqual([
      'index.html',
      'support/index.html',
    ]);
  });

  test('changing an unreachable page updates its graph without reparsing the whole site', () => {
    const { htmlByPath, reader, state } = createState({
      'index.html': '<a href="/about/">About</a>',
      'about/index.html': '<p>About</p>',
      'hidden/index.html': '<p>Hidden</p>',
      'bonus/index.html': '<p>Bonus</p>',
    });

    reader.calls.length = 0;
    htmlByPath.set('hidden/index.html', '<a href="/bonus/">Bonus</a>');
    state.setKnownAssets(new Set(htmlByPath.keys()));
    state.applyIncremental({
      changedAssetPaths: new Set(['hidden/index.html']),
      removedAssetPaths: new Set(),
      readHtmlForAsset: assetPath => reader.read(assetPath),
    });

    expect(reader.calls).toEqual(['hidden/index.html']);
    expect(state.getReachablePaths()).toEqual([
      'about/index.html',
      'index.html',
    ]);

    reader.calls.length = 0;
    htmlByPath.set('about/index.html', '<a href="/hidden/">Hidden</a>');
    state.setKnownAssets(new Set(htmlByPath.keys()));
    state.applyIncremental({
      changedAssetPaths: new Set(['about/index.html']),
      removedAssetPaths: new Set(),
      readHtmlForAsset: assetPath => reader.read(assetPath),
    });

    expect(reader.calls).toEqual(['about/index.html']);
    expect(state.getReachablePaths()).toEqual([
      'about/index.html',
      'bonus/index.html',
      'hidden/index.html',
      'index.html',
    ]);
  });
});
