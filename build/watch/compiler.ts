import path from 'path';
import {
  getProjectConfigBaseName,
  getSiteConfigBaseName,
  getSupportedConfigFilePaths,
} from '../config-files';
import { getDevSiteVariables } from '../site-variables';
import { getProjectConfigDir } from '../templates';
import { getContentDir, getPublicDir } from '../util';
import type {
  ChangeBatch,
  CompilerBuildResult,
  CompilerPlanResult,
  WatchCompiler,
  WatchTarget,
} from '../../watch/types';
import { buildFull } from './build-full';
import { buildIncremental } from './build-incremental';
import type {
  TadaBuildMeta,
  TraceCache,
  WatchTraceOptions,
} from './compiler-types';
import { checkTraceToolAvailability, isTraceSourceFile } from '../utils/trace';
import { createTadaWatchPlan, type TadaWatchPlan } from './planner';
import { scanProject, updateProjectScan } from '../source-model';
import type { TadaSnapshot } from './snapshot';

export function invalidateTraceCacheForBatch(
  traceCache: TraceCache,
  batch: ChangeBatch,
): void {
  for (const change of batch.changes) {
    const sourcePath = path.resolve(change.path);
    if (isTraceSourceFile(sourcePath)) {
      traceCache.delete(sourcePath);
    }
  }
}

export class TadaWatchCompiler implements WatchCompiler<
  TadaSnapshot,
  TadaWatchPlan,
  TadaBuildMeta
> {
  private traceCache: TraceCache;
  private traceOptions: WatchTraceOptions;

  constructor() {
    this.traceCache = new Map();
    this.traceOptions = { toolAvailability: checkTraceToolAvailability() };
  }

  getWatchTargets(): WatchTarget[] {
    const contentDir = getContentDir();
    const publicDir = getPublicDir();
    const projectConfigDir = path.resolve(getProjectConfigDir());
    const configFilePaths = new Set([
      ...getSupportedConfigFilePaths('.', getSiteConfigBaseName('dev')).map(
        filePath => path.resolve(filePath),
      ),
      ...getSupportedConfigFilePaths(
        projectConfigDir,
        getProjectConfigBaseName('nav'),
      ).map(filePath => path.resolve(filePath)),
      ...getSupportedConfigFilePaths(
        projectConfigDir,
        getProjectConfigBaseName('authors'),
      ).map(filePath => path.resolve(filePath)),
    ]);

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

  async buildInitial(): Promise<
    CompilerBuildResult<TadaSnapshot, TadaBuildMeta>
  > {
    return buildFull({
      traceCache: this.traceCache,
      traceOptions: this.traceOptions,
    });
  }

  async plan(
    snapshot: TadaSnapshot | undefined,
    batch: ChangeBatch,
  ): Promise<CompilerPlanResult<TadaWatchPlan>> {
    invalidateTraceCacheForBatch(this.traceCache, batch);
    const scan = snapshot
      ? updateProjectScan(snapshot, batch)
      : scanProject(getDevSiteVariables());
    return {
      kind: 'build',
      plan: createTadaWatchPlan({ snapshot, batch, scan }),
    };
  }

  async run(
    plan: TadaWatchPlan,
    snapshot: TadaSnapshot | undefined,
  ): Promise<CompilerBuildResult<TadaSnapshot, TadaBuildMeta>> {
    if (plan.kind === 'full' || !snapshot) {
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
