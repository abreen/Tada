import { compileTemplates, config } from '../templates';
import { getDistDir } from '../util';
import type { CompilerBuildResult } from './snapshot';
import type { TraceCache, WatchTraceOptions } from '../build-types';
import type { TadaIncrementalWatchPlan } from './planner';
import { createSnapshot, type TadaSnapshot } from './snapshot';
import { ensureHighlighter } from './assets';
import { computeMutations } from './mutations';
import {
  validateConfig,
  validateProjectConfigLinks,
} from '../build-validation';
import { buildFailedFromError, buildSucceeded } from './build-result';
import { renderSource } from './build-helpers';

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
  try {
    const siteVariables = snapshot.siteVariables;
    const configDiagnostics = validateConfig(plan.scan, siteVariables);
    if (configDiagnostics.length > 0) {
      return { ok: false, diagnostics: configDiagnostics };
    }

    compileTemplates(siteVariables);
    await ensureHighlighter(siteVariables);

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
        traceCache,
        traceOptions,
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
      return { ok: false, diagnostics: linkDiagnostics };
    }

    const mutations = computeMutations(
      snapshot,
      nextSnapshot,
      plan.renderSources,
    );
    return buildSucceeded(nextSnapshot, {
      kind: 'apply-mutations',
      rootDir: distDir,
      mutations,
    });
  } catch (error) {
    return buildFailedFromError(error);
  }
}
