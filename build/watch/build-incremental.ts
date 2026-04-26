import { compileTemplates, config } from '../templates';
import { getDistDir } from '../util';
import type { CompilerBuildResult } from './types';
import type { TraceCache, WatchTraceOptions } from './compiler-types';
import type { TadaIncrementalWatchPlan } from './planner';
import { createSnapshot, type TadaSnapshot } from './snapshot';
import {
  copyExistingBuildAssets,
  ensureHighlighter,
  makeTempBuildDir,
  removeDirIfExists,
} from './assets';
import { computeMutations } from './mutations';
import { validateConfig, validateProjectConfigLinks } from './validation';
import { buildFailedFromError, buildSucceeded } from './build-result';
import {
  buildFailedWithDiagnostics,
  renderContentRecord,
  renderPublicRecord,
} from './build-helpers';

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
    const configDiagnostics = validateConfig(plan.scan);
    if (configDiagnostics.length > 0) {
      return buildFailedWithDiagnostics(outputDir, configDiagnostics);
    }

    compileTemplates(siteVariables);
    await ensureHighlighter(siteVariables);
    copyExistingBuildAssets(distDir, outputDir, snapshot.assetFiles);

    const nextContentRecords = new Map(snapshot.contentRecords);
    const nextPublicRecords = new Map(snapshot.publicRecords);

    for (const sourcePath of plan.contentToRemove) {
      nextContentRecords.delete(sourcePath);
    }
    for (const sourcePath of plan.publicToRemove) {
      nextPublicRecords.delete(sourcePath);
    }

    for (const sourcePath of plan.contentToRender) {
      nextContentRecords.delete(sourcePath);
      const record = renderContentRecord({
        filePath: sourcePath,
        siteVariables,
        scan: plan.scan,
        assetFiles: snapshot.assetFiles,
        outputDir,
        traceCache,
        traceOptions,
        cachedTraceSourceDir: distDir,
      });
      if (record) {
        nextContentRecords.set(sourcePath, record);
      }
    }

    for (const sourcePath of plan.publicToRender) {
      nextPublicRecords.delete(sourcePath);
      const record = renderPublicRecord({
        filePath: sourcePath,
        publicDir: plan.scan.publicDir,
      });
      nextPublicRecords.set(sourcePath, record);
    }

    const nextSnapshot = createSnapshot({
      siteVariables,
      assetFiles: snapshot.assetFiles,
      navData: config('nav'),
      authorsData: config('authors'),
      scan: plan.scan,
      contentRecords: nextContentRecords,
      publicRecords: nextPublicRecords,
    });

    const linkDiagnostics = validateProjectConfigLinks(
      nextSnapshot.scan.validTargets,
    );
    if (linkDiagnostics.length > 0) {
      return buildFailedWithDiagnostics(outputDir, linkDiagnostics);
    }

    const forceSourcePaths = new Set([
      ...plan.contentToRender,
      ...plan.publicToRender,
    ]);
    const mutations = computeMutations(
      snapshot,
      nextSnapshot,
      forceSourcePaths,
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
