import path from 'path';
import { describe, expect, test } from 'bun:test';
import { createTadaWatchPlan, diffAuthorKeys } from './planner';
import type { ChangeBatch } from './types';
import type {
  TadaProjectScan,
  TadaSnapshot,
  TadaSourceRecord,
} from './snapshot';

const SITE_ROOT = path.resolve(path.sep, 'site');

function sitePath(...parts: string[]): string {
  return path.join(SITE_ROOT, ...parts);
}

function makeRecord(
  sourcePath: string,
  outputs: string[],
  options: Partial<TadaSourceRecord> = {},
): TadaSourceRecord {
  return {
    sourcePath,
    kind: options.kind || 'content',
    outputs: new Map(outputs.map(output => [output, output])),
    partialDeps: options.partialDeps || new Set(),
    traceDeps: options.traceDeps || new Set(),
    internalTargets: options.internalTargets || new Set(),
    generatedOutputPaths: options.generatedOutputPaths || new Set(),
    authorKey: options.authorKey,
  };
}

function makeScan(overrides: Partial<TadaProjectScan> = {}): TadaProjectScan {
  return {
    contentDir: sitePath('content'),
    publicDir: sitePath('public'),
    distDir: sitePath('dist'),
    contentFiles: new Set(),
    buildContentFiles: new Set(),
    publicFiles: new Set(),
    validTargets: new Set(),
    literateJavaOutputPaths: new Set(),
    processedExts: new Set(['md', 'html']),
    contentOwners: new Map(),
    publicOwners: new Map(),
    sourceOutputPaths: new Map(),
    sourceTargetPaths: new Map(),
    ...overrides,
  };
}

function makeSnapshot(overrides: Partial<TadaSnapshot> = {}): TadaSnapshot {
  const contentRecord = makeRecord(sitePath('content', 'index.md'), [
    'index.html',
  ]);
  const scan = makeScan({
    contentFiles: new Set([contentRecord.sourcePath]),
    buildContentFiles: new Set([contentRecord.sourcePath]),
    contentOwners: new Map([['index.html', contentRecord.sourcePath]]),
    sourceOutputPaths: new Map([
      [contentRecord.sourcePath, new Set(['index.html'])],
    ]),
    sourceTargetPaths: new Map([
      [contentRecord.sourcePath, new Set(['/index.html'])],
    ]),
    validTargets: new Set(['/index.html']),
  });
  return {
    siteVariables: {
      base: 'http://localhost',
      basePath: '/',
      title: 'Site',
      titlePostfix: ' - Site',
      themeColor: 'black',
      defaultTimeZone: 'America/New_York',
      features: { search: true, favicon: true, footer: true },
    },
    assetFiles: [],
    navData: [],
    authorsData: {},
    contentRecords: new Map([[contentRecord.sourcePath, contentRecord]]),
    publicRecords: new Map(),
    outputOwners: new Map([
      ['index.html', { kind: 'content', sourcePath: contentRecord.sourcePath }],
    ]),
    reversePartialDeps: new Map(),
    reverseTraceDeps: new Map(),
    reverseInternalTargetDeps: new Map(),
    reverseAuthorDeps: new Map(),
    scan,
    ...overrides,
  };
}

function makeBatch(changes: ChangeBatch['changes']): ChangeBatch {
  return { changes };
}

function expectIncremental(plan: ReturnType<typeof createTadaWatchPlan>) {
  expect(plan.kind).toBe('incremental');
  if (plan.kind !== 'incremental') {
    throw new Error('expected incremental watch plan');
  }
  return plan;
}

describe('createTadaWatchPlan', () => {
  test('diffAuthorKeys returns only changed keys', () => {
    expect(
      [
        ...diffAuthorKeys(
          {
            alex: { name: 'Alex', avatar: '/avatars/alex.jpg' },
            sam: { name: 'Sam', avatar: '/avatars/sam.jpg' },
          },
          {
            alex: { name: 'Alexandra', avatar: '/avatars/alex.jpg' },
            sam: { name: 'Sam', avatar: '/avatars/sam.jpg' },
            taylor: { name: 'Taylor', avatar: '/avatars/taylor.jpg' },
          },
        ),
      ].sort(),
    ).toEqual(['alex', 'taylor']);
  });

  test('rebuilds reverse partial dependents for partial edits', () => {
    const partialPath = sitePath('content', '_greeting.md');
    const dependentPath = sitePath('content', 'page.md');
    const snapshot = makeSnapshot({
      reversePartialDeps: new Map([[partialPath, new Set([dependentPath])]]),
    });
    const scan = makeScan({
      contentFiles: new Set([partialPath, dependentPath]),
      buildContentFiles: new Set([dependentPath]),
    });

    const plan = createTadaWatchPlan({
      snapshot,
      batch: makeBatch([{ path: partialPath, kind: 'change' }]),
      scan,
    });

    const incrementalPlan = expectIncremental(plan);
    expect([...incrementalPlan.contentToRender].sort()).toEqual(
      [dependentPath, partialPath].sort(),
    );
  });

  test('does not rebuild root page when deleting an unreferenced content page', () => {
    const indexPath = sitePath('content', 'index.md');
    const removedPath = sitePath('content', 'orphan.md');
    const snapshot = makeSnapshot({
      contentRecords: new Map([
        [indexPath, makeRecord(indexPath, ['index.html'])],
        [removedPath, makeRecord(removedPath, ['orphan.html'])],
      ]),
      outputOwners: new Map([
        ['index.html', { kind: 'content', sourcePath: indexPath }],
        ['orphan.html', { kind: 'content', sourcePath: removedPath }],
      ]),
      scan: makeScan({
        contentFiles: new Set([indexPath, removedPath]),
        buildContentFiles: new Set([indexPath, removedPath]),
        contentOwners: new Map([
          ['index.html', indexPath],
          ['orphan.html', removedPath],
        ]),
        sourceOutputPaths: new Map([
          [indexPath, new Set(['index.html'])],
          [removedPath, new Set(['orphan.html'])],
        ]),
        sourceTargetPaths: new Map([
          [indexPath, new Set(['/index.html'])],
          [removedPath, new Set(['/orphan.html'])],
        ]),
        validTargets: new Set(['/index.html', '/orphan.html']),
      }),
    });
    const scan = makeScan({
      contentFiles: new Set([indexPath]),
      buildContentFiles: new Set([indexPath]),
      contentOwners: new Map([['index.html', indexPath]]),
      sourceOutputPaths: new Map([[indexPath, new Set(['index.html'])]]),
      sourceTargetPaths: new Map([[indexPath, new Set(['/index.html'])]]),
      validTargets: new Set(['/index.html']),
    });

    const plan = createTadaWatchPlan({
      snapshot,
      batch: makeBatch([{ path: removedPath, kind: 'unlink' }]),
      scan,
    });

    const incrementalPlan = expectIncremental(plan);
    expect([...incrementalPlan.contentToRender]).toEqual([]);
    expect([...incrementalPlan.contentToRemove]).toEqual([removedPath]);
  });

  test('does not rebuild sibling pages when deleting a page with shared dependencies', () => {
    const partialPath = sitePath('content', '_shared.md');
    const tracePath = sitePath('content', 'TraceDemo.java');
    const removedPath = sitePath('content', 'removed.md');
    const siblingPath = sitePath('content', 'sibling.md');
    const removedRecord = makeRecord(removedPath, ['removed.html'], {
      partialDeps: new Set([partialPath]),
      traceDeps: new Set([tracePath]),
    });
    const siblingRecord = makeRecord(siblingPath, ['sibling.html'], {
      partialDeps: new Set([partialPath]),
      traceDeps: new Set([tracePath]),
    });
    const snapshot = makeSnapshot({
      contentRecords: new Map([
        [removedPath, removedRecord],
        [siblingPath, siblingRecord],
      ]),
      outputOwners: new Map([
        ['removed.html', { kind: 'content', sourcePath: removedPath }],
        ['sibling.html', { kind: 'content', sourcePath: siblingPath }],
      ]),
      reversePartialDeps: new Map([
        [partialPath, new Set([removedPath, siblingPath])],
      ]),
      reverseTraceDeps: new Map([
        [tracePath, new Set([removedPath, siblingPath])],
      ]),
      scan: makeScan({
        contentFiles: new Set([removedPath, siblingPath]),
        buildContentFiles: new Set([removedPath, siblingPath]),
        contentOwners: new Map([
          ['removed.html', removedPath],
          ['sibling.html', siblingPath],
        ]),
        sourceOutputPaths: new Map([
          [removedPath, new Set(['removed.html'])],
          [siblingPath, new Set(['sibling.html'])],
        ]),
        sourceTargetPaths: new Map([
          [removedPath, new Set(['/removed.html'])],
          [siblingPath, new Set(['/sibling.html'])],
        ]),
        validTargets: new Set(['/removed.html', '/sibling.html']),
      }),
    });
    const scan = makeScan({
      contentFiles: new Set([siblingPath]),
      buildContentFiles: new Set([siblingPath]),
      contentOwners: new Map([['sibling.html', siblingPath]]),
      sourceOutputPaths: new Map([[siblingPath, new Set(['sibling.html'])]]),
      sourceTargetPaths: new Map([[siblingPath, new Set(['/sibling.html'])]]),
      validTargets: new Set(['/sibling.html']),
    });

    const plan = createTadaWatchPlan({
      snapshot,
      batch: makeBatch([{ path: removedPath, kind: 'unlink' }]),
      scan,
    });

    const incrementalPlan = expectIncremental(plan);
    expect([...incrementalPlan.contentToRender]).toEqual([]);
    expect([...incrementalPlan.contentToRemove]).toEqual([removedPath]);
  });

  test('rebuilds a content owner after public handoff removal', () => {
    const contentPath = sitePath('content', 'about.md');
    const publicPath = sitePath('public', 'about.html');
    const snapshot = makeSnapshot({
      contentRecords: new Map([
        [contentPath, makeRecord(contentPath, ['about.html'])],
      ]),
      publicRecords: new Map([
        [
          publicPath,
          makeRecord(publicPath, ['about.html'], { kind: 'public' }),
        ],
      ]),
      outputOwners: new Map([
        ['about.html', { kind: 'public', sourcePath: publicPath }],
      ]),
    });
    const scan = makeScan({
      contentFiles: new Set([contentPath]),
      buildContentFiles: new Set([contentPath]),
      contentOwners: new Map([['about.html', contentPath]]),
      validTargets: new Set(['/about.html']),
    });

    const plan = createTadaWatchPlan({
      snapshot,
      batch: makeBatch([{ path: publicPath, kind: 'unlink' }]),
      scan,
    });

    const incrementalPlan = expectIncremental(plan);
    expect([...incrementalPlan.contentToRender]).toEqual([contentPath]);
    expect([...incrementalPlan.publicToRemove]).toEqual([publicPath]);
  });

  test('re-renders copied content after public handoff removal', () => {
    const contentPath = sitePath('content', 'assets', 'logo.svg');
    const publicPath = sitePath('public', 'assets', 'logo.svg');
    const snapshot = makeSnapshot({
      contentRecords: new Map([
        [contentPath, makeRecord(contentPath, ['assets/logo.svg'])],
      ]),
      publicRecords: new Map([
        [
          publicPath,
          makeRecord(publicPath, ['assets/logo.svg'], { kind: 'public' }),
        ],
      ]),
      outputOwners: new Map([
        ['assets/logo.svg', { kind: 'public', sourcePath: publicPath }],
      ]),
    });
    const scan = makeScan({
      contentFiles: new Set([contentPath]),
      contentOwners: new Map([['assets/logo.svg', contentPath]]),
      sourceOutputPaths: new Map([[contentPath, new Set(['assets/logo.svg'])]]),
      sourceTargetPaths: new Map([
        [contentPath, new Set(['/assets/logo.svg'])],
      ]),
      validTargets: new Set(['/assets/logo.svg']),
    });

    const plan = createTadaWatchPlan({
      snapshot,
      batch: makeBatch([{ path: publicPath, kind: 'unlink' }]),
      scan,
    });

    const incrementalPlan = expectIncremental(plan);
    expect([...incrementalPlan.contentToRender]).toEqual([contentPath]);
    expect([...incrementalPlan.publicToRemove]).toEqual([publicPath]);
  });
});
