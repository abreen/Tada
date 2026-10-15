import path from 'path';
import { createEmptyAuthorScripts } from '../author-scripts';
import { describe, expect, test } from 'bun:test';
import type { TraceCache } from '../build-types';
import { pruneTraceCache } from './compiler';
import type { TadaSourceRecord } from '../source-records';

function makeTraceCache(paths: string[]): TraceCache {
  return new Map(
    paths.map(filePath => [
      filePath,
      {
        artifactId: 'sha256-test',
        files: [],
        highlightedSources: [
          {
            file: path.basename(filePath),
            highlightedSource: '<pre>source</pre>',
          },
        ],
        totalSteps: 1,
        sourcePaths: [filePath],
        sourceHash: '',
      },
    ]),
  );
}

describe('pruneTraceCache', () => {
  test('drops cached traces that no page uses any more', () => {
    const used = path.resolve('/site/content/labs/Used.java');
    const unused = path.resolve('/site/content/labs/Unused.java');
    const cache = makeTraceCache([used, unused]);
    const page = {
      sourcePath: path.resolve('/site/content/labs/index.md'),
      traceDeps: new Set([used]),
    } as TadaSourceRecord;

    pruneTraceCache(cache, new Map([[page.sourcePath, page]]));

    expect([...cache.keys()]).toEqual([used]);
  });
});

function emptySnapshot() {
  return import('../site-build').then(({ createSnapshot }) =>
    createSnapshot({
      siteVariables: {} as import('../types').SiteVariables,
      assetFiles: [],
      authorScripts: createEmptyAuthorScripts(),
      documentIndex: new Map(),
      authorsData: undefined,
      records: new Map(),
      scan: {
        sources: new Map(),
      } as unknown as import('../source-model').TadaProjectScan,
    }),
  );
}

for (const failureAt of [1, 2]) {
  test(`write failure at build ${failureAt} clears the committed snapshot`, async () => {
    const { createBuildSession } = await import('./compiler');
    const state = await emptySnapshot();
    const snapshots: (typeof state | undefined)[] = [];
    let writes = 0;
    const build = createBuildSession(
      async snapshot => {
        snapshots.push(snapshot);
        return { ok: true, snapshot: state, full: false };
      },
      () => {
        if (++writes === failureAt) {
          throw new Error('disk write failed');
        }
      },
    );
    for (let i = 0; i <= failureAt; i++) {
      const result = await build(i ? new Set(['/source']) : undefined);
      expect(result.ok).toBe(i + 1 !== failureAt);
      if (!result.ok) {
        expect(result.diagnostics).toEqual([
          { message: 'Failed to write output: disk write failed' },
        ]);
      }
    }
    expect(snapshots[failureAt]).toBeUndefined();
    if (failureAt === 2) {
      expect(snapshots[1]).toBe(state);
    }
  });
}

test('compilation failure retains the last committed snapshot without writing', async () => {
  const { createBuildSession } = await import('./compiler');
  const state = await emptySnapshot();
  const snapshots: (typeof state | undefined)[] = [];
  let writes = 0;
  const build = createBuildSession(
    async snapshot => {
      snapshots.push(snapshot);
      if (snapshots.length === 2) {
        return { ok: false, diagnostics: [{ message: 'compile failed' }] };
      }
      return { ok: true, snapshot: state, full: false };
    },
    () => {
      writes++;
    },
  );
  await build();
  expect((await build(new Set(['/source']))).ok).toBe(false);
  await build(new Set(['/source']));
  expect(snapshots).toEqual([undefined, state, state]);
  expect(writes).toBe(2);
});
