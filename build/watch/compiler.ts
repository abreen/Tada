import path from 'path';
import { getProjectConfigDir } from '../templates';
import { getContentDir, getPublicDir } from '../util';
import type {
  ChangeBatch,
  CompilerBuildResult,
  WatchCompiler,
  WatchTarget,
} from './types';
import { buildFull } from './build-full';
import { buildIncremental } from './build-incremental';
import type { TraceCache, WatchTraceOptions } from './compiler-types';
import { checkTraceToolAvailability, isTraceSourceFile } from '../utils/trace';
import { createTadaWatchPlan } from './planner';
import { updateProjectScan } from '../source-model';
import type { TadaSnapshot } from './snapshot';
import { getWatchConfigFilePaths } from './config-paths';

export function invalidateTraceCacheForBatch(
  traceCache: TraceCache,
  batch: ChangeBatch,
): void {
  for (const change of batch.changes) {
    const sourcePath = path.resolve(change.path);
    if (isTraceSourceFile(sourcePath)) {
      for (const [cacheKey, entry] of traceCache) {
        if (sourcePath in entry.sourceMtims) {
          traceCache.delete(cacheKey);
        }
      }
    }
  }
}

export class TadaWatchCompiler implements WatchCompiler {
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

  async build(
    snapshot: TadaSnapshot | undefined,
    batch?: ChangeBatch,
  ): Promise<CompilerBuildResult> {
    if (batch) {
      invalidateTraceCacheForBatch(this.traceCache, batch);
    }

    if (!snapshot || !batch) {
      return buildFull({
        traceCache: this.traceCache,
        traceOptions: this.traceOptions,
      });
    }

    const scan = updateProjectScan(snapshot.scan, batch);
    const plan = createTadaWatchPlan({ snapshot, batch, scan });
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
