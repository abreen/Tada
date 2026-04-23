import { compileTemplates, json } from '../templates';
import { getDistDir } from '../util';
import { createContentRecord, createPublicRecord } from '../source-records';
import type { CompilerBuildResult } from '../../watch/types';
import type {
  TadaBuildMeta,
  TraceCache,
  WatchTraceOptions,
} from './compiler-types';
import type { TadaWatchPlan } from './planner';
import {
  collectHtmlAnalysisByPath,
  collectHtmlAssetsByPath,
  createSnapshot,
  type TadaSnapshot,
} from './snapshot';
import {
  copyExistingBuildAssets,
  ensureHighlighter,
  makeTempBuildDir,
  removeDirIfExists,
  writeAssets,
} from './assets';
import { computeMutations } from './mutations';
import {
  diagnosticsFromMessages,
  validateConfig,
  validateJsonLinks,
} from './validation';

export async function buildIncremental({
  plan,
  snapshot,
  traceCache,
  traceOptions,
}: {
  plan: TadaWatchPlan;
  snapshot: TadaSnapshot;
  traceCache: TraceCache;
  traceOptions: WatchTraceOptions;
}): Promise<CompilerBuildResult<TadaSnapshot, TadaBuildMeta>> {
  const outputDir = makeTempBuildDir(plan.scan.distDir);
  try {
    const siteVariables = snapshot.siteVariables;
    const configDiagnostics = validateConfig(plan.scan);
    if (configDiagnostics.length > 0) {
      removeDirIfExists(outputDir);
      return { ok: false, diagnostics: configDiagnostics };
    }

    compileTemplates(siteVariables);
    await ensureHighlighter(siteVariables);
    copyExistingBuildAssets(getDistDir(), outputDir, snapshot.assetFiles);

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
      const record = createContentRecord({
        filePath: sourcePath,
        siteVariables,
        scan: plan.scan,
        assetFiles: snapshot.assetFiles,
        outputDir,
        traceCache,
        traceToolAvailability: traceOptions.toolAvailability,
        cachedTraceSourceDir: getDistDir(),
      });
      if (record.outputs.size > 0) {
        writeAssets(outputDir, record.outputs);
        nextContentRecords.set(sourcePath, record);
      }
    }

    for (const sourcePath of plan.publicToRender) {
      nextPublicRecords.delete(sourcePath);
      const record = createPublicRecord(sourcePath, plan.scan.publicDir);
      nextPublicRecords.set(sourcePath, record);
    }

    const nextSnapshot = createSnapshot({
      siteVariables,
      assetFiles: snapshot.assetFiles,
      navData: json('nav.json'),
      authorsData: json('authors.json'),
      scan: plan.scan,
      contentRecords: nextContentRecords,
      publicRecords: nextPublicRecords,
    });

    const linkDiagnostics = validateJsonLinks(nextSnapshot.validTargets);
    if (linkDiagnostics.length > 0) {
      removeDirIfExists(outputDir);
      return { ok: false, diagnostics: linkDiagnostics };
    }

    const forceSourcePaths = new Set([
      ...plan.contentToRender,
      ...plan.publicToRender,
    ]);
    const mutations = computeMutations(
      snapshot,
      nextSnapshot,
      forceSourcePaths,
    ).map(mutation =>
      mutation.kind === 'write'
        ? {
            kind: 'write' as const,
            path: mutation.path,
            content: mutation.content!,
          }
        : { kind: 'delete' as const, path: mutation.path },
    );
    removeDirIfExists(outputDir);
    return {
      ok: true,
      snapshot: nextSnapshot,
      commit: { kind: 'apply-mutations', rootDir: getDistDir(), mutations },
      meta: {
        htmlAssetsByPath: collectHtmlAssetsByPath(nextSnapshot.contentRecords),
        htmlAnalysisByPath: collectHtmlAnalysisByPath(
          nextSnapshot.contentRecords,
        ),
        siteVariables,
      },
    };
  } catch (error) {
    removeDirIfExists(outputDir);
    return {
      ok: false,
      diagnostics: diagnosticsFromMessages([
        error instanceof Error ? error.message : String(error),
      ]),
    };
  }
}
