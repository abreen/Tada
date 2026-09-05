import { expect, test } from 'bun:test';
import { EventEmitter } from 'events';
import type chokidar from 'chokidar';
import { runWatchEngine } from './engine';
import type { ChangeBatch, WatchLifecycleEvent } from './types';
import type { TadaSnapshot } from './snapshot';
import type { TadaBuildMeta } from './compiler-types';

for (const failureAt of [1, 2]) {
  test(`publication failure at build ${failureAt} retries a full build without success`, async () => {
    const watcher = new EventEmitter();
    const events: WatchLifecycleEvent[] = [];
    const builds: {
      snapshot: TadaSnapshot | undefined;
      batch?: ChangeBatch;
    }[] = [];
    const initialSnapshot = {} as TadaSnapshot;
    let publications = 0;
    let complete!: () => void;
    const finished = new Promise<void>(resolve => {
      complete = resolve;
    });
    const engine = runWatchEngine(
      {
        debounceMs: 1,
        compiler: {
          getWatchTargets: () => [{ path: '/sources' }],
          async build(snapshot, batch) {
            builds.push({ snapshot, batch });
            return {
              ok: true,
              snapshot: initialSnapshot,
              meta: {} as TadaBuildMeta,
              commit: {
                kind: 'apply-mutations',
                rootDir: '/output',
                mutations: [],
              },
            };
          },
        },
        onEvent(event) {
          events.push(event);
          if (event.kind === 'watching') {
            watcher.emit('change', '/sources/first');
          }
          if (event.kind === 'build-failed' && failureAt === 2) {
            watcher.emit('change', '/sources/second');
          }
          if (event.kind === 'build-succeeded' && publications > failureAt) {
            complete();
          }
        },
      },
      {
        watch: (() => {
          queueMicrotask(() => watcher.emit('ready'));
          return watcher;
        }) as unknown as typeof chokidar.watch,
        applyCommitPlan() {
          publications++;
          if (publications === failureAt) {
            throw new Error('disk publication failed');
          }
        },
      },
    );
    await Promise.race([finished, engine]);
    expect(events.filter(event => event.kind === 'build-failed')).toHaveLength(
      1,
    );
    expect(
      events.filter(event => event.kind === 'build-succeeded'),
    ).toHaveLength(failureAt);
    expect(builds[failureAt].snapshot).toBeUndefined();
    if (failureAt === 2) {
      expect(builds[1].snapshot).toBe(initialSnapshot);
      expect(builds[2].batch?.changes).toEqual([
        { path: '/sources/first', kind: 'change' },
        { path: '/sources/second', kind: 'change' },
      ]);
    }
  }, 1000);
}
