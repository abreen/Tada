import chokidar from 'chokidar';
import { applyCommitPlan } from './fs-commit';
import type {
  ChangeBatch,
  CompilerBuildResult,
  WatchEngineOptions,
  WatchEventKind,
  WatchLifecycleEvent,
} from './types';
import type { TadaSnapshot } from './snapshot';

function normalizeBatch(changes: Map<string, WatchEventKind>): ChangeBatch {
  return {
    changes: [...changes.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([path, kind]) => ({ path, kind })),
  };
}

function mapBatch(batch: ChangeBatch): Map<string, WatchEventKind> {
  return new Map(batch.changes.map(change => [change.path, change.kind]));
}

function mergeChangeKind(
  previous: WatchEventKind | undefined,
  next: WatchEventKind,
): WatchEventKind {
  if (!previous) {
    return next;
  }
  if (previous === 'add' && next === 'unlink') {
    return 'change';
  }
  if (previous === 'unlink' && next === 'add') {
    return 'change';
  }
  if (previous === 'add' || next === 'add') {
    return 'add';
  }
  if (previous === 'unlink' || next === 'unlink') {
    return 'unlink';
  }
  return 'change';
}

function toDiagnostics(error: unknown): { message: string }[] {
  if (error instanceof Error) {
    return [{ message: error.message }];
  }
  return [{ message: String(error) }];
}

export async function runWatchEngine(
  options: WatchEngineOptions,
): Promise<void> {
  const debounceMs = options.debounceMs ?? 300;
  let snapshot: TadaSnapshot | undefined;
  let uncommitted = new Map<string, WatchEventKind>();
  let pending = new Map<string, WatchEventKind>();
  let timer: ReturnType<typeof setTimeout> | null = null;
  let running = false;

  async function emit(event: WatchLifecycleEvent): Promise<void> {
    await options.onEvent?.(event);
  }

  async function waitForQuietPeriod(): Promise<void> {
    await new Promise(resolve => setTimeout(resolve, debounceMs));
  }

  async function runBuild(batch?: ChangeBatch): Promise<CompilerBuildResult> {
    await emit({ kind: 'build-started', batch });
    try {
      return await options.compiler.build(snapshot, batch);
    } catch (error) {
      return { ok: false, diagnostics: toDiagnostics(error) };
    }
  }

  async function flush(): Promise<void> {
    if (running) {
      return;
    }
    running = true;
    try {
      let finalSuccess:
        | {
            batch?: ChangeBatch;
            result: Extract<CompilerBuildResult, { ok: true }>;
          }
        | undefined;

      while (pending.size > 0) {
        const changes = new Map(uncommitted);
        for (const [filePath, kind] of pending) {
          changes.set(filePath, mergeChangeKind(changes.get(filePath), kind));
        }

        const batch = normalizeBatch(changes);
        pending = new Map();
        const outcome = await runBuild(batch);

        if (!outcome.ok) {
          uncommitted = mapBatch(batch);
          await emit({
            kind: 'build-failed',
            batch,
            diagnostics: outcome.diagnostics,
          });
          return;
        }

        applyCommitPlan(outcome.commit);
        snapshot = outcome.snapshot;
        uncommitted = new Map();
        finalSuccess = { batch, result: outcome };

        if (pending.size === 0) {
          await waitForQuietPeriod();
        }
      }

      if (finalSuccess) {
        await emit({
          kind: 'build-succeeded',
          batch: finalSuccess.batch,
          meta: finalSuccess.result.meta,
        });
      }
    } finally {
      running = false;
      if (pending.size > 0) {
        schedule();
      }
    }
  }

  function schedule(): void {
    if (timer) {
      clearTimeout(timer);
    }
    timer = setTimeout(() => {
      timer = null;
      void flush();
    }, debounceMs);
  }

  function onFileChange(filePath: string, kind: WatchEventKind): void {
    pending.set(filePath, mergeChangeKind(pending.get(filePath), kind));
    schedule();
  }

  const startupOutcome = await runBuild();
  if (!startupOutcome.ok) {
    await emit({
      kind: 'build-failed',
      diagnostics: startupOutcome.diagnostics,
    });
  } else {
    applyCommitPlan(startupOutcome.commit);
    snapshot = startupOutcome.snapshot;
    await emit({ kind: 'build-succeeded', meta: startupOutcome.meta });
  }

  const watcherEntries = options.compiler
    .getWatchTargets()
    .map(target => ({
      target,
      watcher: chokidar.watch(target.path, {
        ignoreInitial: true,
        atomic: true,
        awaitWriteFinish: { stabilityThreshold: 100 },
        ...target.chokidar,
      }),
    }));

  let readyCount = 0;
  const readyGoal = watcherEntries.length;
  const onReady = async () => {
    readyCount += 1;
    if (readyCount === readyGoal) {
      await emit({ kind: 'watching' });
    }
  };

  for (const { watcher, target } of watcherEntries) {
    const emitIfIncluded = (filePath: string, kind: WatchEventKind) => {
      if (!target.filter || target.filter(filePath)) {
        onFileChange(filePath, kind);
      }
    };
    watcher.on('add', filePath => emitIfIncluded(filePath, 'add'));
    watcher.on('change', filePath => emitIfIncluded(filePath, 'change'));
    watcher.on('unlink', filePath => emitIfIncluded(filePath, 'unlink'));
    watcher.on('ready', () => void onReady());
  }

  return new Promise(() => {});
}
