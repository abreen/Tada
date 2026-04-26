import chokidar from 'chokidar';
import { applyCommitPlan } from './fs-commit';
import { emitWatchEvent } from './events';
import type {
  ChangeBatch,
  CompilerBuildResult,
  CompilerPlanResult,
  WatchEngineOptions,
  WatchEventKind,
} from './types';

function normalizeBatch(changes: Map<string, WatchEventKind>): ChangeBatch {
  return {
    changes: [...changes.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([path, kind]) => ({ path, kind })),
  };
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

function isNoopCommit(commit: {
  kind: string;
  mutations?: unknown[];
}): boolean {
  return (
    commit.kind === 'apply-mutations' && (commit.mutations?.length ?? 0) === 0
  );
}

type BuildAttemptOutcome<Snapshot, Meta> =
  | { kind: 'skipped'; batch: ChangeBatch; initial: boolean }
  | {
      kind: 'succeeded';
      batch?: ChangeBatch;
      initial: boolean;
      result: Extract<CompilerBuildResult<Snapshot, Meta>, { ok: true }>;
    }
  | {
      kind: 'failed';
      batch?: ChangeBatch;
      initial: boolean;
      diagnostics: { message: string }[];
      meta?: Meta;
    };

export async function runWatchEngine<Snapshot, Plan, Meta>(
  options: WatchEngineOptions<Snapshot, Plan, Meta>,
): Promise<void> {
  const debounceMs = options.debounceMs ?? 300;
  let snapshot: Snapshot | undefined;
  let pending = new Map<string, WatchEventKind>();
  let blocked = new Map<string, WatchEventKind>();
  let timer: ReturnType<typeof setTimeout> | null = null;
  let running = false;

  async function waitForQuietPeriod(): Promise<void> {
    await new Promise(resolve => setTimeout(resolve, debounceMs));
  }

  async function runBuild(
    batch?: ChangeBatch,
    initial: boolean = false,
  ): Promise<BuildAttemptOutcome<Snapshot, Meta>> {
    await emitWatchEvent(options, { kind: 'build-started', batch, initial });
    try {
      let result: CompilerBuildResult<Snapshot, Meta> | null = null;
      if (initial) {
        result = await options.compiler.buildInitial();
      } else if (batch) {
        const nextPlan: CompilerPlanResult<Plan> = await options.compiler.plan(
          snapshot,
          batch,
        );
        if (nextPlan.kind === 'skip') {
          return { kind: 'skipped', batch, initial };
        }
        result = await options.compiler.run(nextPlan.plan, snapshot);
      }
      if (!result) {
        return { kind: 'skipped', batch: batch!, initial };
      }

      if (result.ok) {
        return { kind: 'succeeded', batch, initial, result };
      }

      return {
        kind: 'failed',
        batch,
        initial,
        diagnostics: result.diagnostics,
        meta: result.meta,
      };
    } catch (error) {
      return {
        kind: 'failed',
        batch,
        initial,
        diagnostics: toDiagnostics(error),
      };
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
            initial: boolean;
            result: Extract<CompilerBuildResult<Snapshot, Meta>, { ok: true }>;
            changed: boolean;
          }
        | undefined;

      while (pending.size > 0) {
        const batch = normalizeBatch(pending);
        pending = new Map();
        const outcome = await runBuild(batch, false);

        if (outcome.kind === 'skipped') {
          if (pending.size === 0 && !finalSuccess) {
            await emitWatchEvent(options, {
              kind: 'build-skipped',
              batch: outcome.batch,
            });
          }
          continue;
        }

        if (outcome.kind === 'failed') {
          await emitWatchEvent(options, {
            kind: 'build-failed',
            initial: outcome.initial,
            batch: outcome.batch,
            diagnostics: outcome.diagnostics,
            meta: outcome.meta,
          });
          if (outcome.batch) {
            for (const change of outcome.batch.changes) {
              blocked.set(
                change.path,
                mergeChangeKind(blocked.get(change.path), change.kind),
              );
            }
          }
          return;
        }

        const changed = !isNoopCommit(outcome.result.commit);
        if (changed) {
          applyCommitPlan(outcome.result.commit);
        }
        snapshot = outcome.result.snapshot;
        finalSuccess = {
          batch: outcome.batch,
          initial: outcome.initial,
          result: outcome.result,
          changed: (finalSuccess?.changed ?? false) || changed,
        };

        if (pending.size === 0) {
          await waitForQuietPeriod();
        }
      }

      if (finalSuccess) {
        await emitWatchEvent(options, {
          kind: 'build-succeeded',
          initial: finalSuccess.initial,
          batch: finalSuccess.batch,
          changed: finalSuccess.changed,
          snapshot: finalSuccess.result.snapshot,
          meta: finalSuccess.result.meta,
          diagnostics: finalSuccess.result.diagnostics || [],
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
    if (blocked.size > 0) {
      for (const [blockedPath, blockedKind] of blocked) {
        pending.set(
          blockedPath,
          mergeChangeKind(pending.get(blockedPath), blockedKind),
        );
      }
      blocked = new Map();
    }
    pending.set(filePath, mergeChangeKind(pending.get(filePath), kind));
    schedule();
  }

  const initialOutcome = await runBuild(undefined, true);
  if (initialOutcome.kind === 'failed') {
    await emitWatchEvent(options, {
      kind: 'build-failed',
      initial: true,
      diagnostics: initialOutcome.diagnostics,
      meta: initialOutcome.meta,
    });
  } else if (initialOutcome.kind === 'succeeded') {
    applyCommitPlan(initialOutcome.result.commit);
    snapshot = initialOutcome.result.snapshot;
    await emitWatchEvent(options, {
      kind: 'build-succeeded',
      initial: true,
      changed: !isNoopCommit(initialOutcome.result.commit),
      snapshot: initialOutcome.result.snapshot,
      meta: initialOutcome.result.meta,
      diagnostics: initialOutcome.result.diagnostics || [],
    });
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
      await emitWatchEvent(options, { kind: 'watching' });
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
