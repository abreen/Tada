import path from 'path';
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
import type { TadaBuildMeta, TraceCache } from './compiler-types';
import { createTadaWatchPlan, type TadaWatchPlan } from './planner';
import { scanProject, type TadaSnapshot, updateProjectScan } from './snapshot';

export class TadaWatchCompiler
  implements WatchCompiler<TadaSnapshot, TadaWatchPlan, TadaBuildMeta>
{
  private wsPort: number;
  private traceCache: TraceCache;

  constructor({ wsPort }: { wsPort: number }) {
    this.wsPort = wsPort;
    this.traceCache = new Map();
  }

  getWatchTargets(): WatchTarget[] {
    const contentDir = getContentDir();
    const publicDir = getPublicDir();
    const jsonDataDir = path.resolve(getJsonDataDir());
    const configFilePaths = new Set([
      path.resolve('site.dev.json'),
      path.resolve(jsonDataDir, 'nav.json'),
      path.resolve(jsonDataDir, 'authors.json'),
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
    return buildFull({ wsPort: this.wsPort, traceCache: this.traceCache });
  }

  async plan(
    snapshot: TadaSnapshot | undefined,
    batch: ChangeBatch,
  ): Promise<CompilerPlanResult<TadaWatchPlan>> {
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
      return buildFull({ wsPort: this.wsPort, traceCache: this.traceCache });
    }

    return buildIncremental({ plan, snapshot, traceCache: this.traceCache });
  }
}
