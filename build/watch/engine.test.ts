import { expect, test } from 'bun:test';
import { EventEmitter } from 'events';
import path from 'path';
import type chokidar from 'chokidar';
import { runWatchEngine } from './engine';
import type {
  WatchClock,
  WatchEngineOptions,
  WatchLifecycleEvent,
} from './types';

async function settle() {
  for (let i = 0; i < 30; i++) {
    await Promise.resolve();
  }
}

function harness(
  overrides: Partial<WatchEngineOptions<number>> = {},
  targets = 1,
) {
  let now = 0;
  let nextTimer = 0;
  const timers = new Map<number, { at: number; run: () => void }>();
  const watchers: (EventEmitter & { close: () => Promise<void> })[] = [];
  let closes = 0;
  const added: string[] = [];
  const existingFiles = new Set<string>();
  const builds: (ReadonlySet<string> | undefined)[] = [];
  const events: WatchLifecycleEvent<number>[] = [];
  const clock: WatchClock = {
    setTimeout: ((run: () => void, delay: number) => {
      const id = ++nextTimer;
      timers.set(id, { at: now + delay, run });
      return id;
    }) as unknown as typeof setTimeout,
    clearTimeout: ((id: number) => {
      timers.delete(id);
    }) as unknown as typeof clearTimeout,
  };
  const handle = runWatchEngine(
    {
      targets: Array.from({ length: targets }, (_, i) => ({
        path: `/sources/${i}`,
      })),
      debounceMs: 10,
      async build(paths) {
        builds.push(paths);
        return { ok: true, meta: builds.length };
      },
      onEvent(event) {
        events.push(event);
      },
      ...overrides,
    },
    {
      clock,
      stat: filePath =>
        existingFiles.has(filePath) ? { isFile: () => true } : undefined,
      watch: (() => {
        const watcher = Object.assign(new EventEmitter(), {
          async close() {
            closes++;
          },
          add(filePath: string) {
            added.push(filePath);
            return this;
          },
        });
        watchers.push(watcher);
        return watcher;
      }) as unknown as typeof chokidar.watch,
    },
  );
  void handle.done.catch(() => {});
  async function advance(ms = 25) {
    const end = now + ms;
    await settle();
    while (true) {
      const next = [...timers]
        .filter(([, timer]) => timer.at <= end)
        .sort((a, b) => a[1].at - b[1].at)[0];
      if (!next) {
        break;
      }
      now = next[1].at;
      timers.delete(next[0]);
      next[1].run();
      await settle();
    }
    now = end;
  }
  async function ready() {
    await settle();
    for (const watcher of watchers) {
      watcher.emit('ready');
    }
    await settle();
  }
  return {
    handle,
    builds,
    events,
    watchers,
    timers,
    ready,
    advance,
    added,
    existingFiles,
    closes: () => closes,
  };
}

test('subscribes before startup and buffers changes until every watcher is ready', async () => {
  const h = harness({}, 2);
  await settle();
  h.watchers[0].emit('change', '/sources/a');
  h.watchers[0].emit('ready');
  await settle();
  expect(h.builds).toHaveLength(0);
  h.watchers[1].emit('ready');
  await h.advance();
  expect(h.builds).toEqual([undefined, new Set([path.resolve('/sources/a')])]);
  await h.handle.close();
  expect(h.closes()).toBe(2);
});

test('deduplicates normalized paths and resets the debounce window', async () => {
  const h = harness();
  await h.ready();
  h.watchers[0].emit('add', '/sources/a');
  await h.advance(5);
  h.watchers[0].emit('unlink', '/sources/./a');
  await h.advance(9);
  expect(h.builds).toHaveLength(1);
  await h.advance();
  expect(h.builds[1]).toEqual(new Set([path.resolve('/sources/a')]));
  expect(
    h.events.filter(event => event.kind === 'build-succeeded'),
  ).toHaveLength(2);
  await h.handle.close();
});

test('startup and active builds buffer changes without overlap and coalesce success', async () => {
  const gate = Promise.withResolvers<void>();
  let calls = 0,
    active = 0,
    maxActive = 0;
  const paths: (ReadonlySet<string> | undefined)[] = [];
  const h = harness({
    async build(batch) {
      paths.push(batch);
      calls++;
      active++;
      maxActive = Math.max(active, maxActive);
      if (calls === 1) {
        await gate.promise;
      }
      if (calls === 2) {
        h.watchers[0].emit('change', '/sources/b');
      }
      active--;
      return { ok: true, meta: calls };
    },
  });
  await h.ready();
  h.watchers[0].emit('change', '/sources/a');
  await h.advance(100);
  expect(calls).toBe(1);
  gate.resolve();
  await h.advance(30);
  expect(paths).toEqual([
    undefined,
    new Set([path.resolve('/sources/a')]),
    new Set([path.resolve('/sources/b')]),
  ]);
  expect(maxActive).toBe(1);
  expect(
    h.events.filter(event => event.kind === 'build-succeeded'),
  ).toHaveLength(2);
  await h.handle.close();
});

test('failed changes accumulate and retry only when another change arrives', async () => {
  let calls = 0;
  const batches: (ReadonlySet<string> | undefined)[] = [];
  const h = harness({
    async build(paths) {
      batches.push(paths);
      calls++;
      if (calls === 2) {
        throw new Error('compile failed');
      }
      return { ok: true, meta: calls };
    },
  });
  await h.ready();
  h.watchers[0].emit('change', '/sources/a');
  await h.advance(100);
  expect(calls).toBe(2);
  h.watchers[0].emit('change', '/sources/b');
  await h.advance();
  expect(batches[2]).toEqual(
    new Set([path.resolve('/sources/a'), path.resolve('/sources/b')]),
  );
  expect(h.events.filter(event => event.kind === 'build-failed')).toHaveLength(
    1,
  );
  await h.handle.close();
});

test('close waits for active work, drops pending work and suppresses reload', async () => {
  const gate = Promise.withResolvers<void>();
  const h = harness({
    async build() {
      await gate.promise;
      return { ok: true, meta: 1 };
    },
  });
  await h.ready();
  h.watchers[0].emit('change', '/sources/a');
  const closed = h.handle.close();
  expect(h.handle.close()).toBe(closed);
  let finished = false;
  void closed.then(() => {
    finished = true;
  });
  await settle();
  expect(finished).toBe(false);
  expect(h.closes()).toBe(1);
  gate.resolve();
  await closed;
  expect(
    h.events.filter(event => event.kind === 'build-succeeded'),
  ).toHaveLength(0);
  expect(h.timers.size).toBe(0);
  expect(h.closes()).toBe(1);
});

test.each(['readiness', 'debounce'])(
  'close releases resources during %s',
  async phase => {
    const h = harness();
    if (phase === 'debounce') {
      await h.ready();
      h.watchers[0].emit('change', '/sources/a');
    }
    await settle();
    await h.handle.close();
    expect(h.timers.size).toBe(0);
    expect(h.closes()).toBe(1);
  },
);

test('zero targets perform startup and can close', async () => {
  const h = harness({}, 0);
  await settle();
  expect(h.builds).toEqual([undefined]);
  await h.handle.close();
});

test.each(['watcher', 'callback'])(
  '%s errors reject completion after cleanup',
  async kind => {
    const h = harness(
      kind === 'callback'
        ? {
            async onEvent() {
              throw new Error('fatal');
            },
          }
        : {},
    );
    if (kind === 'watcher') {
      await settle();
      h.watchers[0].emit('error', new Error('fatal'));
    } else {
      await h.ready();
    }
    await expect(h.handle.done).rejects.toThrow('fatal');
    expect(h.closes()).toBe(1);
    expect(h.timers.size).toBe(0);
  },
);

test('directory events reconcile paths that have changed between directories and files', async () => {
  const h = harness();
  await h.ready();
  h.watchers[0].emit('unlinkDir', '/sources/item');
  h.watchers[0].emit('addDir', '/sources/other');
  await h.advance();
  expect(h.builds[1]).toEqual(
    new Set([path.resolve('/sources/item'), path.resolve('/sources/other')]),
  );
  await h.handle.close();
});

test('a polling file that becomes a directory gains a recursive subscription', async () => {
  const h = harness();
  await h.ready();
  h.watchers[0].emit('change', '/sources/item', { isDirectory: () => true });
  await h.advance();
  expect(h.added).toEqual(['/sources/item']);
  expect(h.builds[1]).toEqual(new Set([path.resolve('/sources/item')]));
  await h.handle.close();
  h.watchers[0].emit('change', '/sources/item', { isDirectory: () => true });
  expect(h.added).toHaveLength(1);
});

test('a removed directory replaced by a file gains a file subscription', async () => {
  const h = harness();
  await h.ready();
  h.existingFiles.add('/sources/item');
  h.watchers[0].emit('unlinkDir', '/sources/item');
  h.watchers[0].emit('unlinkDir', '/sources/missing');
  await h.advance();
  expect(h.added).toEqual(['/sources/item']);
  await h.handle.close();
});
