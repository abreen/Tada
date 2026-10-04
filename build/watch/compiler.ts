import path from 'path';
import { getProjectConfigDir } from '../templates';
import { getContentDir, getDistDir, getPublicDir } from '../utils/paths';
import type { CompileOutcome, WatchTarget, WatchBuildResult } from './types';
import type { TadaBuildMeta, TraceCache } from '../build-types';
import type { TraceToolAvailability } from '../types';
import {
  applyMutations,
  computeMutations,
  planFullWrite,
} from '../output-publication';
import { loadProjectConfig } from '../config-loader';
import { getKeptOutputPrefixes } from '../pagefind';
import { getDevSiteVariables } from '../site-variables';
import { scanProject } from '../source-model';
import { buildSite, createBuildMeta, type TadaSnapshot } from '../site-build';
import { buildIncremental } from './build-incremental';
import type { TadaSourceRecord } from '../source-records';
import { checkTraceToolAvailability, isTraceSourceFile } from '../utils/trace';
import { createTadaWatchPlan, diffAuthorKeys } from './planner';
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

/** Drops cached traces whose source files no page in the build traces. */
export function pruneTraceCache(
  traceCache: TraceCache,
  records: ReadonlyMap<string, TadaSourceRecord>,
): void {
  const traced = new Set<string>();
  for (const record of records.values()) {
    for (const sourcePath of record.traceDeps) {
      traced.add(sourcePath);
    }
  }
  for (const [cacheKey, entry] of traceCache) {
    if (!Object.keys(entry.sourceMtims).every(file => traced.has(file))) {
      traceCache.delete(cacheKey);
    }
  }
}

export class TadaWatchCompiler {
  private traceCache: TraceCache;
  private traceToolAvailability: TraceToolAvailability;

  readonly build = createBuildSession(async (snapshot, paths) => {
    const outcome = await this.compile(snapshot, paths);
    if (outcome.ok) {
      pruneTraceCache(this.traceCache, outcome.snapshot.records);
    }
    return outcome;
  });

  constructor() {
    this.traceCache = new Map();
    this.traceToolAvailability = checkTraceToolAvailability();
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

  private async buildFull(
    reuse?: Pick<TadaSnapshot, 'siteVariables' | 'scan'>,
  ): Promise<CompileOutcome> {
    const result = await buildSite({
      siteVariables: reuse?.siteVariables ?? getDevSiteVariables(),
      scan: reuse?.scan,
      mode: 'development',
      isWatchMode: true,
      traceCache: this.traceCache,
      traceToolAvailability: this.traceToolAvailability,
    });
    return result.ok ? { ...result, full: true } : result;
  }

  private async compile(
    snapshot: TadaSnapshot | undefined,
    paths?: ReadonlySet<string>,
  ): Promise<CompileOutcome> {
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
      return this.buildFull();
    }

    const authorsChanged = configKinds.has('authors');
    const nextAuthors = authorsChanged
      ? loadProjectConfig(
          getProjectConfigDir(),
          'authors',
          snapshot.siteVariables,
        )?.value
      : snapshot.authorsData;
    // Every build rescans the source directories instead of reconciling
    // individual file and directory events.
    const scan = scanProject(snapshot.siteVariables);
    const plan = createTadaWatchPlan({
      snapshot,
      paths,
      scan,
      full:
        authorsChanged &&
        (snapshot.authorsData === undefined || nextAuthors === undefined),
      changedAuthors: authorsChanged
        ? diffAuthorKeys(snapshot.authorsData, nextAuthors)
        : new Set(),
    });
    if (plan.kind === 'full') {
      // Only the authors file changed, so the site config and scan still hold.
      return this.buildFull({ siteVariables: snapshot.siteVariables, scan });
    }

    return buildIncremental({
      plan,
      snapshot,
      traceCache: this.traceCache,
      traceToolAvailability: this.traceToolAvailability,
    });
  }
}

/**
 * Writes a successful build into `dist/` in place. Full builds compare
 * against the files on disk; incremental builds against the previous build.
 */
function writeBuild(
  outcome: Extract<CompileOutcome, { ok: true }>,
  previous: TadaSnapshot | undefined,
  distDir: string = getDistDir(),
): void {
  const keep = getKeptOutputPrefixes(outcome.snapshot.siteVariables);
  applyMutations(
    distDir,
    outcome.full || !previous
      ? planFullWrite(distDir, outcome.snapshot.outputs, keep)
      : computeMutations(
          previous.outputs,
          outcome.snapshot.outputs,
          outcome.forceSourcePaths,
        ),
  );
}

export function createBuildSession(
  compile: (
    snapshot: TadaSnapshot | undefined,
    paths?: ReadonlySet<string>,
  ) => Promise<CompileOutcome>,
  write: typeof writeBuild = writeBuild,
): (paths?: ReadonlySet<string>) => Promise<WatchBuildResult<TadaBuildMeta>> {
  let snapshot: TadaSnapshot | undefined;
  return async (
    paths?: ReadonlySet<string>,
  ): Promise<WatchBuildResult<TadaBuildMeta>> => {
    const outcome = await compile(snapshot, paths);
    if (!outcome.ok) {
      return outcome;
    }
    try {
      write(outcome, snapshot);
    } catch (error) {
      // The next change rebuilds everything against what is on disk.
      snapshot = undefined;
      const message = error instanceof Error ? error.message : String(error);
      return {
        ok: false,
        diagnostics: [{ message: `Failed to write output: ${message}` }],
      };
    }
    snapshot = outcome.snapshot;
    return { ok: true, meta: createBuildMeta(outcome.snapshot) };
  };
}
