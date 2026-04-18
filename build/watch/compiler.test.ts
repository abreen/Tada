import path from 'path';
import { describe, expect, test } from 'bun:test';
import type { TraceCache } from './compiler-types';
import { invalidateTraceCacheForBatch } from './compiler';

function makeTraceCache(paths: string[]): TraceCache {
  return new Map(
    paths.map(filePath => [
      filePath,
      {
        manifestUrl: '/trace/manifest.json',
        highlightedSource: '<pre>source</pre>',
        totalSteps: 1,
        mtime: 1,
      },
    ]),
  );
}

describe('invalidateTraceCacheForBatch', () => {
  test('invalidates cache entries for changed Java paths', () => {
    const javaPath = path.resolve('/site/content/labs/TraceDemo.java');
    const markdownPath = path.resolve('/site/content/labs/index.md');
    const cache = makeTraceCache([javaPath, markdownPath]);

    invalidateTraceCacheForBatch(cache, {
      changes: [
        { path: javaPath, kind: 'change' },
        { path: markdownPath, kind: 'change' },
      ],
    });

    expect(cache.has(javaPath)).toBe(false);
    expect(cache.has(markdownPath)).toBe(true);
  });

  test('invalidates cache entries for removed Java paths', () => {
    const oldJavaPath = path.resolve('/site/content/labs/OldTrace.java');
    const newJavaPath = path.resolve('/site/content/labs/NewTrace.java');
    const cache = makeTraceCache([oldJavaPath, newJavaPath]);

    invalidateTraceCacheForBatch(cache, {
      changes: [
        { path: oldJavaPath, kind: 'unlink' },
        { path: newJavaPath, kind: 'add' },
      ],
    });

    expect(cache.has(oldJavaPath)).toBe(false);
    expect(cache.has(newJavaPath)).toBe(false);
  });
});
