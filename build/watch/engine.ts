import path from 'path';
import fs from 'fs';
import chokidar from 'chokidar';
import type {
  WatchBuildResult,
  WatchClock,
  WatchEngineOptions,
  WatchHandle,
  WatchLifecycleEvent,
} from './types';

export function runWatchEngine<Meta>(
  options: WatchEngineOptions<Meta>,
  dependencies = {
    watch: chokidar.watch,
    stat: (filePath: string): Pick<fs.Stats, 'isFile'> | undefined =>
      fs.statSync(filePath, { throwIfNoEntry: false }),
    clock: { setTimeout, clearTimeout } as WatchClock,
  },
): WatchHandle {
  const { clock } = dependencies;
  const debounceMs = options.debounceMs ?? 300;
  const watchers: ReturnType<typeof chokidar.watch>[] = [];
  const pending = new Set<string>();
  let uncommitted = new Set<string>();
  let closed = false;
  let fatal: { error: unknown } | undefined;
  let closing: Promise<PromiseSettledResult<void>[]> | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let wake: (() => void) | undefined;
  const stopped = Promise.withResolvers<void>();

  function stop(): void {
    closed = true;
    pending.clear();
    if (timer !== undefined) {
      clock.clearTimeout(timer);
    }
    timer = undefined;
    wake?.();
    stopped.resolve();
    closing ??= Promise.allSettled(
      watchers.map(async watcher => watcher.close()),
    );
  }

  function fail(error: unknown): void {
    fatal ??= { error };
    stop();
  }

  function wait(quiet = false): Promise<void> {
    if (closed) {
      return Promise.resolve();
    }
    return new Promise(resolve => {
      wake = () => {
        wake = undefined;
        timer = undefined;
        resolve();
      };
      if (quiet) {
        timer = clock.setTimeout(() => wake?.(), debounceMs);
      }
    });
  }

  function changed(filePath: string): void {
    if (closed) {
      return;
    }
    pending.add(path.resolve(filePath));
    if (timer !== undefined) {
      clock.clearTimeout(timer);
      timer = clock.setTimeout(() => wake?.(), debounceMs);
    } else {
      wake?.();
    }
  }

  async function emit(event: WatchLifecycleEvent<Meta>): Promise<void> {
    if (!closed) {
      await options.onEvent?.(event);
    }
  }

  async function build(
    paths?: ReadonlySet<string>,
  ): Promise<WatchBuildResult<Meta> | undefined> {
    await emit({ kind: 'build-started', paths });
    if (closed) {
      return;
    }
    let outcome: WatchBuildResult<Meta>;
    try {
      outcome = await options.build(paths);
    } catch (error) {
      outcome = {
        ok: false,
        diagnostics: [
          { message: error instanceof Error ? error.message : String(error) },
        ],
      };
    }
    if (!outcome.ok) {
      await emit({
        kind: 'build-failed',
        paths,
        diagnostics: outcome.diagnostics,
      });
    }
    return outcome;
  }

  async function run(): Promise<void> {
    if (closed) {
      return;
    }
    const ready = options.targets.map(target => {
      if (closed) {
        return Promise.resolve();
      }
      const watcher = dependencies.watch(target.path, {
        ignoreInitial: true,
        atomic: true,
        awaitWriteFinish: { stabilityThreshold: 100 },
        ...target.chokidar,
      });
      watchers.push(watcher);
      const included = (filePath: string) => {
        if (closed) {
          return;
        }
        try {
          if (!target.filter || target.filter(filePath)) {
            changed(filePath);
          }
        } catch (error) {
          fail(error);
        }
      };
      watcher.on('add', included).on('unlink', included);
      watcher.on('change', (filePath, stats) => {
        if (closed) {
          return;
        }
        // A polling file subscription does not become recursive on its own.
        try {
          if (stats?.isDirectory()) {
            watcher.add(filePath);
          }
          included(filePath);
        } catch (error) {
          fail(error);
        }
      });
      watcher.on('addDir', included);
      watcher.on('unlinkDir', filePath => {
        included(filePath);
        // Wait until Chokidar finishes closing the old directory subscription.
        queueMicrotask(() => {
          if (closed) {
            return;
          }
          try {
            if (dependencies.stat(filePath)?.isFile()) {
              watcher.add(filePath);
            }
          } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'ENOTDIR') {
              fail(error);
            }
          }
        });
      });
      watcher.on('error', fail);
      return new Promise<void>(resolve => watcher.once('ready', resolve));
    });
    await Promise.race([Promise.all(ready), stopped.promise]);
    if (closed) {
      return;
    }
    const startup = await build();
    if (startup?.ok) {
      await emit({ kind: 'build-succeeded', meta: startup.meta });
    }
    await emit({ kind: 'watching' });
    while (!closed) {
      if (!pending.size) {
        await wait();
      }
      if (closed) {
        break;
      }
      await wait(true);
      let success: { paths: ReadonlySet<string>; meta: Meta } | undefined;
      while (!closed && pending.size) {
        const paths = new Set([...uncommitted, ...pending]);
        pending.clear();
        const outcome = await build(paths);
        if (!outcome?.ok) {
          uncommitted = paths;
          success = undefined;
          break;
        }
        uncommitted.clear();
        success = { paths, meta: outcome.meta };
        if (!pending.size) {
          await wait(true);
        }
      }
      if (success) {
        await emit({ kind: 'build-succeeded', ...success });
      }
    }
  }

  const done = (async () => {
    // Defer setup so callers can install their completion handler first.
    await Promise.resolve();
    try {
      await run();
    } catch (error) {
      fatal ??= { error };
    } finally {
      stop();
      const results = await closing!;
      const failure = results.find(result => result.status === 'rejected');
      if (failure?.status === 'rejected') {
        fatal ??= { error: failure.reason };
      }
    }
    if (fatal) {
      throw fatal.error;
    }
  })();
  return {
    done,
    close: () => {
      stop();
      return done;
    },
  };
}
