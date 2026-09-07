import { compileTemplates, config } from '../templates';
import { getDistDir } from '../util';
import type { CompilerBuildResult } from './snapshot';
import type { TraceCache, WatchTraceOptions } from '../build-types';
import type { TadaIncrementalWatchPlan } from './planner';
import { createSnapshot, type TadaSnapshot } from './snapshot';
import {
  copyExistingBuildAssets,
  ensureHighlighter,
  makeTempBuildDir,
  removeDirIfExists,
} from './assets';
import { computeMutations } from './mutations';
import {
  validateConfig,
  validateProjectConfigLinks,
} from '../build-validation';
import { buildFailedFromError, buildSucceeded } from './build-result';
import { buildFailedWithDiagnostics, renderSource } from './build-helpers';

export async function buildIncremental({
  plan,
  snapshot,
  traceCache,
  traceOptions,
}: {
  plan: TadaIncrementalWatchPlan;
  snapshot: TadaSnapshot;
  traceCache: TraceCache;
  traceOptions: WatchTraceOptions;
}): Promise<CompilerBuildResult> {
  const distDir = getDistDir();
  const outputDir = makeTempBuildDir(distDir);
  try {
    const siteVariables = snapshot.siteVariables;
    const configDiagnostics = validateConfig(plan.scan, siteVariables);
    if (configDiagnostics.length > 0) {
      return buildFailedWithDiagnostics(outputDir, configDiagnostics);
    }

    compileTemplates(siteVariables);
    await ensureHighlighter(siteVariables);
    copyExistingBuildAssets(distDir, outputDir, snapshot.assetFiles);

    const records = new Map(snapshot.records);
    for (const source of plan.removeSources) {
      records.delete(source);
    }
    for (const filePath of plan.renderSources) {
      records.delete(filePath);
      const record = renderSource({
        filePath,
        siteVariables,
        scan: plan.scan,
        assetFiles: snapshot.assetFiles,
        outputDir,
        traceCache,
        traceOptions,
        cachedTraceSourceDir: distDir,
      });
      if (record) {
        records.set(filePath, record);
      }
    }

    const nextSnapshot = createSnapshot({
      siteVariables,
      assetFiles: snapshot.assetFiles,
      authorsData: config('authors'),
      scan: plan.scan,
      records,
    });

    const linkDiagnostics = validateProjectConfigLinks(
      nextSnapshot.scan.validTargets,
    );
    if (linkDiagnostics.length > 0) {
      return buildFailedWithDiagnostics(outputDir, linkDiagnostics);
    }

    const mutations = computeMutations(
      snapshot,
      nextSnapshot,
      plan.renderSources,
    );
    removeDirIfExists(outputDir);
    return buildSucceeded(nextSnapshot, {
      kind: 'apply-mutations',
      rootDir: distDir,
      mutations,
    });
  } catch (error) {
    removeDirIfExists(outputDir);
    return buildFailedFromError(error);
  }
}
