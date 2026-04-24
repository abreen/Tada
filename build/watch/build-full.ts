import { compileTemplates, config } from '../templates';
import { getDevSiteVariables } from '../site-variables';
import { createContentRecord, createPublicRecord } from '../source-records';
import { getDistDir } from '../util';
import type { CompilerBuildResult } from '../../watch/types';
import {
  collectHtmlAnalysisByPath,
  collectHtmlAssetsByPath,
  createSnapshot,
  type TadaSourceRecord,
  type TadaSnapshot,
} from './snapshot';
import { scanProject } from '../source-model';
import type {
  TadaBuildMeta,
  TraceCache,
  WatchTraceOptions,
} from './compiler-types';
import {
  bundleWatchAssets,
  ensureHighlighter,
  makeTempBuildDir,
  populateStaticAssets,
  removeDirIfExists,
  writeAssets,
} from './assets';
import {
  diagnosticsFromMessages,
  validateConfig,
  validateProjectConfigLinks,
} from './validation';

export async function buildFull({
  traceCache,
  traceOptions,
}: {
  traceCache: TraceCache;
  traceOptions: WatchTraceOptions;
}): Promise<CompilerBuildResult<TadaSnapshot, TadaBuildMeta>> {
  const distDir = getDistDir();
  const outputDir = makeTempBuildDir(distDir);
  try {
    const siteVariables = getDevSiteVariables();
    const scan = scanProject(siteVariables);
    const configDiagnostics = validateConfig(scan);
    if (configDiagnostics.length > 0) {
      removeDirIfExists(outputDir);
      return { ok: false, diagnostics: configDiagnostics };
    }

    compileTemplates(siteVariables);
    await ensureHighlighter(siteVariables);

    const assetFiles = await bundleWatchAssets(outputDir, siteVariables);
    await populateStaticAssets(outputDir, siteVariables);

    const contentRecords = new Map<string, TadaSourceRecord>();
    for (const filePath of scan.contentFiles) {
      const record = createContentRecord({
        filePath,
        siteVariables,
        scan,
        assetFiles,
        outputDir,
        traceCache,
        traceToolAvailability: traceOptions.toolAvailability,
        cachedTraceSourceDir: distDir,
      });
      if (record.outputs.size > 0) {
        writeAssets(outputDir, record.outputs);
        contentRecords.set(filePath, record);
      }
    }

    const publicRecords = new Map<string, TadaSourceRecord>();
    for (const filePath of scan.publicFiles) {
      const record = createPublicRecord(filePath, scan.publicDir);
      writeAssets(outputDir, record.outputs);
      publicRecords.set(filePath, record);
    }

    const linkDiagnostics = validateProjectConfigLinks(scan.validTargets);
    if (linkDiagnostics.length > 0) {
      removeDirIfExists(outputDir);
      return { ok: false, diagnostics: linkDiagnostics };
    }

    const nextSnapshot = createSnapshot({
      siteVariables,
      assetFiles,
      navData: config('nav'),
      authorsData: config('authors'),
      scan,
      contentRecords,
      publicRecords,
    });

    return {
      ok: true,
      snapshot: nextSnapshot,
      commit: {
        kind: 'replace-root',
        stagedPath: outputDir,
        targetPath: distDir,
      },
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
