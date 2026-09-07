import path from 'path';
import { getProjectConfigDir } from '../templates';
import { getContentDir, getPublicDir } from '../util';
import type { WatchTarget, WatchBuildResult } from './types';
import type { CompilerBuildResult } from './snapshot';
import type { TadaBuildMeta } from '../build-types';
import { applyCommitPlan } from '../output-publication';
import { loadProjectConfig } from '../config-loader';
import { buildFull } from './build-full';
import { buildIncremental } from './build-incremental';
import type { TraceCache, WatchTraceOptions } from '../build-types';
import { checkTraceToolAvailability, isTraceSourceFile } from '../utils/trace';
import { createTadaWatchPlan, diffAuthorKeys } from './planner';
import { updateProjectScan } from '../source-model';
import type { TadaSnapshot } from './snapshot';
import {
  getWatchConfigFilePaths,
  classifyWatchConfigPath,
} from './config-paths';

export function invalidateTraceCacheForBatch(
  traceCache: TraceCache,
  paths: ReadonlySet<string>,
): void {
  for (const sourcePath of paths) {
    if (isTraceSourceFile(sourcePath)) {
      for (const [cacheKey, entry] of traceCache) {
        if (sourcePath in entry.sourceMtims) {
          traceCache.delete(cacheKey);
        }
      }
    }
  }
}

export class TadaWatchCompiler {
  private traceCache: TraceCache;
  private traceOptions: WatchTraceOptions;

  readonly build = createBuildSession((snapshot, paths) =>
    this.compile(snapshot, paths),
  );

  constructor() {
    this.traceCache = new Map();
    this.traceOptions = { toolAvailability: checkTraceToolAvailability() };
  }

  getWatchTargets(): WatchTarget[] {
    const contentDir = getContentDir();
    const publicDir = getPublicDir();
    const projectConfigDir = path.resolve(getProjectConfigDir());
    const configFilePaths = getWatchConfigFilePaths();

    return [
      { path: contentDir, chokidar: { usePolling: true } },
      { path: publicDir, chokidar: { usePolling: true } },
      {
        path: projectConfigDir,
        chokidar: { depth: 0 },
        filter: filePath => configFilePaths.has(path.resolve(filePath)),
      },
    ];
  }

  private async compile(
    snapshot: TadaSnapshot | undefined,
    paths?: ReadonlySet<string>,
  ): Promise<CompilerBuildResult> {
    if (paths) {
      invalidateTraceCacheForBatch(this.traceCache, paths);
    }
    const configKinds = new Set(
      [...(paths ?? [])].map(classifyWatchConfigPath),
    );
    if (
      !snapshot ||
      !paths ||
      configKinds.has('site') ||
      configKinds.has('nav')
    ) {
      return buildFull({
        traceCache: this.traceCache,
        traceOptions: this.traceOptions,
      });
    }

    const authorsChanged = configKinds.has('authors');
    const nextAuthors = authorsChanged
      ? loadProjectConfig(
          getProjectConfigDir(),
          'authors',
          snapshot.siteVariables,
        )?.value
      : snapshot.authorsData;
    const full =
      authorsChanged &&
      (snapshot.authorsData === undefined || nextAuthors === undefined);
    const scan = full ? snapshot.scan : updateProjectScan(snapshot.scan, paths);
    const plan = createTadaWatchPlan({
      snapshot,
      paths,
      scan,
      full,
      changedAuthors: authorsChanged
        ? diffAuthorKeys(snapshot.authorsData, nextAuthors)
        : new Set(),
    });
    if (plan.kind === 'full') {
      return buildFull({
        traceCache: this.traceCache,
        traceOptions: this.traceOptions,
      });
    }

    return buildIncremental({
      plan,
      snapshot,
      traceCache: this.traceCache,
      traceOptions: this.traceOptions,
    });
  }
}

export function createBuildSession(
  compile: (
    snapshot: TadaSnapshot | undefined,
    paths?: ReadonlySet<string>,
  ) => Promise<CompilerBuildResult>,
  publish = applyCommitPlan,
): (paths?: ReadonlySet<string>) => Promise<WatchBuildResult<TadaBuildMeta>> {
  let snapshot: TadaSnapshot | undefined;
  return async (
    paths?: ReadonlySet<string>,
  ): Promise<WatchBuildResult<TadaBuildMeta>> => {
    const outcome = await compile(snapshot, paths);
    if (outcome.ok) {
      try {
        publish(outcome.commit);
      } catch (error) {
        snapshot = undefined;
        const message = error instanceof Error ? error.message : String(error);
        return {
          ok: false,
          diagnostics: [
            { message: `Failed to publish build output: ${message}` },
          ],
        };
      }
      snapshot = outcome.snapshot;
    }
    return outcome;
  };
}
