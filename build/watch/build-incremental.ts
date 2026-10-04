import { compileTemplates } from '../templates';
import { validateConfig } from '../build-validation';
import {
  ensureHighlighter,
  finishBuild,
  renderSources,
  type TadaSnapshot,
} from '../site-build';
import type { TraceCache } from '../build-types';
import type { TraceToolAvailability } from '../types';
import type { TadaIncrementalWatchPlan } from './planner';
import type { CompileOutcome } from './types';

export async function buildIncremental({
  plan,
  snapshot,
  traceCache,
  traceToolAvailability,
}: {
  plan: TadaIncrementalWatchPlan;
  snapshot: TadaSnapshot;
  traceCache: TraceCache;
  traceToolAvailability: TraceToolAvailability;
}): Promise<CompileOutcome> {
  const { siteVariables } = snapshot;
  const configDiagnostics = validateConfig(plan.scan, siteVariables);
  if (configDiagnostics.length > 0) {
    return { ok: false, diagnostics: configDiagnostics };
  }

  compileTemplates(siteVariables);
  await ensureHighlighter(siteVariables);

  const records = new Map(snapshot.records);
  for (const source of [...plan.removeSources, ...plan.renderSources]) {
    records.delete(source);
  }
  const rendered = renderSources(plan.renderSources, {
    siteVariables,
    scan: plan.scan,
    assetFiles: snapshot.assetFiles,
    isWatchMode: true,
    traceCache,
    traceToolAvailability,
  });
  for (const [source, record] of rendered.records) {
    records.set(source, record);
  }

  const result = finishBuild({
    siteVariables,
    scan: plan.scan,
    assetFiles: snapshot.assetFiles,
    generatedOutputs: snapshot.generatedOutputs,
    records,
    diagnostics: rendered.diagnostics,
  });
  return result.ok
    ? { ...result, full: false, forceSourcePaths: plan.renderSources }
    : result;
}
