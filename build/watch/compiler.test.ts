import path from 'path';
import { describe, expect, test } from 'bun:test';
import type { TraceCache } from '../build-types';
import { invalidateTraceCacheForBatch } from './compiler';

function makeTraceCache(paths: string[]): TraceCache {
  return new Map(
    paths.map(filePath => [
      filePath,
      {
        manifestUrl: '/trace/manifest.json',
        artifactId: 'sha256-test',
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
          manifestUrl: '/trace/manifest.json',
          artifactId: 'sha256-test',
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
          manifestUrl: '/trace/other/manifest.json',
          artifactId: 'sha256-other',
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

for (const failureAt of [1, 2]) {
  test(`publication failure at build ${failureAt} clears the committed snapshot`, async () => {
    const { createBuildSession } = await import('./compiler');
    const state = {} as import('./snapshot').TadaSnapshot;
    const snapshots: (typeof state | undefined)[] = [];
    let publications = 0;
    const build = createBuildSession(
      async snapshot => {
        snapshots.push(snapshot);
        return {
          ok: true,
          snapshot: state,
          meta: {} as import('../build-types').TadaBuildMeta,
          commit: {
            kind: 'apply-mutations',
            rootDir: '/output',
            mutations: [],
          },
        };
      },
      () => {
        if (++publications === failureAt) {
          throw new Error('disk publication failed');
        }
      },
    );
    for (let i = 0; i <= failureAt; i++) {
      const result = await build(i ? new Set(['/source']) : undefined);
      expect(result.ok).toBe(i + 1 !== failureAt);
    }
    expect(snapshots[failureAt]).toBeUndefined();
    if (failureAt === 2) {
      expect(snapshots[1]).toBe(state);
    }
  });
}

test('compilation failure retains the last committed snapshot without publishing', async () => {
  const { createBuildSession } = await import('./compiler');
  const state = {} as import('./snapshot').TadaSnapshot;
  const snapshots: (typeof state | undefined)[] = [];
  let publications = 0;
  const build = createBuildSession(
    async snapshot => {
      snapshots.push(snapshot);
      if (snapshots.length === 2) {
        return { ok: false, diagnostics: [{ message: 'compile failed' }] };
      }
      return {
        ok: true,
        snapshot: state,
        meta: {} as import('../build-types').TadaBuildMeta,
        commit: { kind: 'apply-mutations', rootDir: '/output', mutations: [] },
      };
    },
    () => {
      publications++;
    },
  );
  await build();
  expect((await build(new Set(['/source']))).ok).toBe(false);
  await build(new Set(['/source']));
  expect(snapshots).toEqual([undefined, state, state]);
  expect(publications).toBe(2);
});
