import path from 'path';
import { describe, expect, test } from 'bun:test';
import { createTadaWatchPlan, diffAuthorKeys } from './planner';
import type { ChangeBatch } from '../../watch/types';
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
  return {
    siteVariables: {
      base: 'http://localhost',
      basePath: '/',
      title: 'Site',
      titlePostfix: ' - Site',
      themeColor: 'black',
      defaultTimeZone: 'America/New_York',
      features: { search: true, code: true, favicon: true, footer: true },
    },
    assetFiles: [],
    navData: [],
    authorsData: {},
    processedExts: new Set(['md', 'html']),
    contentRecords: new Map([[contentRecord.sourcePath, contentRecord]]),
    publicRecords: new Map(),
    outputOwners: new Map([
      ['index.html', { kind: 'content', sourcePath: contentRecord.sourcePath }],
    ]),
    reversePartialDeps: new Map(),
    reverseTraceDeps: new Map(),
    reverseInternalTargetDeps: new Map(),
    reverseAuthorDeps: new Map(),
    contentFiles: new Set([contentRecord.sourcePath]),
    buildContentFiles: new Set([contentRecord.sourcePath]),
    publicFiles: new Set(),
    literateJavaOutputPaths: new Set(),
    contentOwners: new Map([['index.html', contentRecord.sourcePath]]),
    publicOwners: new Map(),
    sourceOutputPaths: new Map([
      [contentRecord.sourcePath, new Set(['index.html'])],
    ]),
    sourceTargetPaths: new Map([
      [contentRecord.sourcePath, new Set(['/index.html'])],
    ]),
    validTargets: new Set(['/index.html']),
    ...overrides,
  };
}

function makeBatch(changes: ChangeBatch['changes']): ChangeBatch {
  return { changes };
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

    expect(plan.kind).toBe('incremental');
    expect([...plan.contentToRender].sort()).toEqual(
      [dependentPath, partialPath].sort(),
    );
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

    expect([...plan.contentToRender]).toEqual([contentPath]);
    expect([...plan.publicToRemove]).toEqual([publicPath]);
  });
});
