import path from 'path';
import { describe, expect, test } from 'bun:test';
import type { TraceCache } from '../build-types';
import { invalidateTraceCacheForBatch, pruneTraceCache } from './compiler';
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
        sourceMtims: { [filePath]: 1 },
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

describe('invalidateTraceCacheForBatch', () => {
  test('invalidates cache entries for changed trace source paths', () => {
    const javaPath = path.resolve('/site/content/labs/TraceDemo.java');
    const pythonPath = path.resolve('/site/content/labs/trace_demo.py');
    const markdownPath = path.resolve('/site/content/labs/index.md');
    const cache = makeTraceCache([javaPath, pythonPath, markdownPath]);

    invalidateTraceCacheForBatch(
      cache,
      new Set([javaPath, pythonPath, markdownPath]),
    );

    expect(cache.has(javaPath)).toBe(false);
    expect(cache.has(pythonPath)).toBe(false);
    expect(cache.has(markdownPath)).toBe(true);
  });

  test('invalidates cache entries for removed Java paths', () => {
    const oldJavaPath = path.resolve('/site/content/labs/OldTrace.java');
    const newJavaPath = path.resolve('/site/content/labs/NewTrace.java');
    const cache = makeTraceCache([oldJavaPath, newJavaPath]);

    invalidateTraceCacheForBatch(cache, new Set([oldJavaPath, newJavaPath]));

    expect(cache.has(oldJavaPath)).toBe(false);
    expect(cache.has(newJavaPath)).toBe(false);
  });

  test('invalidates cache entries for removed Python paths', () => {
    const oldPythonPath = path.resolve('/site/content/labs/trace_demo.py');
    const newPythonPath = path.resolve('/site/content/labs/new_trace.py');
    const cache = makeTraceCache([oldPythonPath, newPythonPath]);

    invalidateTraceCacheForBatch(
      cache,
      new Set([oldPythonPath, newPythonPath]),
    );

    expect(cache.has(oldPythonPath)).toBe(false);
    expect(cache.has(newPythonPath)).toBe(false);
  });

  test('invalidates cache entries when a companion source changes', () => {
    const primaryPath = path.resolve('/site/content/labs/Demo.java');
    const companionPath = path.resolve('/site/content/lib/Bag.java');
    const otherPath = path.resolve('/site/content/labs/Other.java');
    const cache: TraceCache = new Map([
      [
        JSON.stringify([primaryPath, companionPath]),
        {
          artifactId: 'sha256-test',
          files: [],
          highlightedSources: [
            { file: 'Demo.java', highlightedSource: '<pre>demo</pre>' },
            { file: 'Bag.java', highlightedSource: '<pre>bag</pre>' },
          ],
          totalSteps: 1,
          sourceMtims: { [primaryPath]: 1, [companionPath]: 1 },
        },
      ],
      [
        JSON.stringify([otherPath]),
        {
          artifactId: 'sha256-other',
          files: [],
          highlightedSources: [
            { file: 'Other.java', highlightedSource: '<pre>other</pre>' },
          ],
          totalSteps: 1,
          sourceMtims: { [otherPath]: 1 },
        },
      ],
    ]);

    invalidateTraceCacheForBatch(cache, new Set([companionPath]));

    expect(cache.has(JSON.stringify([primaryPath, companionPath]))).toBe(false);
    expect(cache.has(JSON.stringify([otherPath]))).toBe(true);
  });
});

function emptySnapshot() {
  return import('../site-build').then(({ createSnapshot }) =>
    createSnapshot({
      siteVariables: {} as import('../types').SiteVariables,
      assetFiles: [],
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
