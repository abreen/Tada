import path from 'path';
import {
  AUTHORS_JSON_FILE,
  NAV_JSON_FILE,
  getProjectDataFilePath,
  getSiteConfigPath,
} from '../config-files';
import { getDevSiteVariables } from '../site-variables';
import { getJsonDataDir } from '../templates';
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
  private wsPort: number;
  private traceCache: TraceCache;
  private traceOptions: WatchTraceOptions;

  constructor({ wsPort }: { wsPort: number }) {
    this.wsPort = wsPort;
    this.traceCache = new Map();
    this.traceOptions = { toolAvailability: checkTraceToolAvailability() };
  }

  getWatchTargets(): WatchTarget[] {
    const contentDir = getContentDir();
    const publicDir = getPublicDir();
    const jsonDataDir = path.resolve(getJsonDataDir());
    const configFilePaths = new Set([
      path.resolve(getSiteConfigPath('.', 'dev')),
      path.resolve(getProjectDataFilePath(jsonDataDir, NAV_JSON_FILE)),
      path.resolve(getProjectDataFilePath(jsonDataDir, AUTHORS_JSON_FILE)),
    ]);

    return [
      { path: contentDir },
      { path: publicDir },
      {
        path: jsonDataDir,
        chokidar: { depth: 0 },
        filter: filePath => configFilePaths.has(path.resolve(filePath)),
      },
    ];
  }

  async buildInitial(): Promise<
    CompilerBuildResult<TadaSnapshot, TadaBuildMeta>
  > {
    return buildFull({
      wsPort: this.wsPort,
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
        wsPort: this.wsPort,
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
