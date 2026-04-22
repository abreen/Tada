import { describe, expect, test } from 'bun:test';
import { collectReachableSiteAssets } from './reachability';
import WatchReachabilityState from './watch-reachability-state';

function createReader(
  analysisByPath: Map<string, { outgoingTargets: Set<string> }>,
) {
  const calls: string[] = [];

  return {
    calls,
    read(assetPath: string) {
      calls.push(assetPath);
      if (!analysisByPath.has(assetPath)) {
        throw new Error(`Missing HTML analysis: ${assetPath}`);
      }
      return analysisByPath.get(assetPath)!;
    },
  };
}

function createState(
  analysisEntries: Record<string, { outgoingTargets: Set<string> }>,
) {
  const analysisByPath = new Map(Object.entries(analysisEntries));
  const reader = createReader(analysisByPath);
  const state = new WatchReachabilityState();

  state.setKnownAssets(new Set(analysisByPath.keys()));
  state.rebuild(assetPath => reader.read(assetPath));

  return { analysisByPath, reader, state };
}

describe('WatchReachabilityState', () => {
  test('rebuild matches full traversal reachability', () => {
    const htmlAnalysisByPath = new Map([
      ['index.html', { outgoingTargets: new Set<string>(['/about/']) }],
      ['about/index.html', { outgoingTargets: new Set<string>(['/deep/']) }],
      ['deep/index.html', { outgoingTargets: new Set<string>() }],
      ['orphan/index.html', { outgoingTargets: new Set<string>() }],
    ]);
    const reader = createReader(htmlAnalysisByPath);
    const state = new WatchReachabilityState();

    state.setKnownAssets(new Set(htmlAnalysisByPath.keys()));
    state.rebuild(assetPath => reader.read(assetPath));

    expect(state.getReachablePaths()).toEqual(
      collectReachableSiteAssets({ htmlAnalysisByPath }).reachableHtmlPaths,
    );
  });

  test('incremental update adds a newly linked subtree', () => {
    const { analysisByPath, reader, state } = createState({
      'index.html': { outgoingTargets: new Set<string>(['/about/']) },
      'about/index.html': { outgoingTargets: new Set<string>() },
      'hidden/index.html': { outgoingTargets: new Set<string>(['/bonus/']) },
      'bonus/index.html': { outgoingTargets: new Set<string>() },
    });

    reader.calls.length = 0;
    analysisByPath.set('about/index.html', {
      outgoingTargets: new Set<string>(['/hidden/']),
    });
    state.setKnownAssets(new Set(analysisByPath.keys()));
    state.applyIncremental({
      changedAssetPaths: new Set(['about/index.html']),
      removedAssetPaths: new Set(),
      readAnalysisForAsset: assetPath => reader.read(assetPath),
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
    const { analysisByPath, reader, state } = createState({
      'index.html': { outgoingTargets: new Set<string>(['/about/']) },
      'about/index.html': { outgoingTargets: new Set<string>(['/hidden/']) },
      'hidden/index.html': { outgoingTargets: new Set<string>(['/bonus/']) },
      'bonus/index.html': { outgoingTargets: new Set<string>() },
    });

    reader.calls.length = 0;
    analysisByPath.set('about/index.html', {
      outgoingTargets: new Set<string>(),
    });
    state.setKnownAssets(new Set(analysisByPath.keys()));
    state.applyIncremental({
      changedAssetPaths: new Set(['about/index.html']),
      removedAssetPaths: new Set(),
      readAnalysisForAsset: assetPath => reader.read(assetPath),
    });

    expect(reader.calls).toEqual(['about/index.html']);
    expect(state.getReachablePaths()).toEqual([
      'about/index.html',
      'index.html',
    ]);
  });

  test('removing one of two parents keeps the child reachable', () => {
    const { analysisByPath, reader, state } = createState({
      'index.html': { outgoingTargets: new Set<string>(['/about/', '/keep/']) },
      'about/index.html': { outgoingTargets: new Set<string>(['/child/']) },
      'keep/index.html': { outgoingTargets: new Set<string>(['/child/']) },
      'child/index.html': { outgoingTargets: new Set<string>() },
    });

    analysisByPath.delete('about/index.html');
    state.setKnownAssets(new Set(analysisByPath.keys()));
    state.applyIncremental({
      changedAssetPaths: new Set(),
      removedAssetPaths: new Set(['about/index.html']),
      readAnalysisForAsset: assetPath => reader.read(assetPath),
    });

    expect(state.getReachablePaths()).toEqual([
      'child/index.html',
      'index.html',
      'keep/index.html',
    ]);
  });

  test('a supported cycle remains reachable and drops once external support is removed', () => {
    const { analysisByPath, reader, state } = createState({
      'index.html': { outgoingTargets: new Set<string>(['/support/']) },
      'support/index.html': { outgoingTargets: new Set<string>(['/a/']) },
      'a/index.html': { outgoingTargets: new Set<string>(['/b/']) },
      'b/index.html': { outgoingTargets: new Set<string>(['/a/']) },
    });

    expect(state.getReachablePaths()).toEqual([
      'a/index.html',
      'b/index.html',
      'index.html',
      'support/index.html',
    ]);

    reader.calls.length = 0;
    analysisByPath.set('support/index.html', {
      outgoingTargets: new Set<string>(),
    });
    state.setKnownAssets(new Set(analysisByPath.keys()));
    state.applyIncremental({
      changedAssetPaths: new Set(['support/index.html']),
      removedAssetPaths: new Set(),
      readAnalysisForAsset: assetPath => reader.read(assetPath),
    });

    expect(reader.calls).toEqual(['support/index.html']);
    expect(state.getReachablePaths()).toEqual([
      'index.html',
      'support/index.html',
    ]);
  });

  test('changing an unreachable page updates its graph without reparsing the whole site', () => {
    const { analysisByPath, reader, state } = createState({
      'index.html': { outgoingTargets: new Set<string>(['/about/']) },
      'about/index.html': { outgoingTargets: new Set<string>() },
      'hidden/index.html': { outgoingTargets: new Set<string>() },
      'bonus/index.html': { outgoingTargets: new Set<string>() },
    });

    reader.calls.length = 0;
    analysisByPath.set('hidden/index.html', {
      outgoingTargets: new Set<string>(['/bonus/']),
    });
    state.setKnownAssets(new Set(analysisByPath.keys()));
    state.applyIncremental({
      changedAssetPaths: new Set(['hidden/index.html']),
      removedAssetPaths: new Set(),
      readAnalysisForAsset: assetPath => reader.read(assetPath),
    });

    expect(reader.calls).toEqual(['hidden/index.html']);
    expect(state.getReachablePaths()).toEqual([
      'about/index.html',
      'index.html',
    ]);

    reader.calls.length = 0;
    analysisByPath.set('about/index.html', {
      outgoingTargets: new Set<string>(['/hidden/']),
    });
    state.setKnownAssets(new Set(analysisByPath.keys()));
    state.applyIncremental({
      changedAssetPaths: new Set(['about/index.html']),
      removedAssetPaths: new Set(),
      readAnalysisForAsset: assetPath => reader.read(assetPath),
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
