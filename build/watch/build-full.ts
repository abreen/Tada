import { compileTemplates, json } from '../templates';
import { getDevSiteVariables } from '../site-variables';
import { getDistDir } from '../util';
import type { CompilerBuildResult } from '../../watch/types';
import {
  collectHtmlAssetsByPath,
  createSnapshot,
  scanProject,
  type TadaSourceRecord,
  type TadaSnapshot,
} from './snapshot';
import type { TadaBuildMeta, TraceCache } from './compiler-types';
import {
  bundleWatchAssets,
  ensureHighlighter,
  makeTempBuildDir,
  populateStaticAssets,
  removeDirIfExists,
  writeAssets,
} from './assets';
import { createPublicRecord, renderContentRecord } from './records';
import {
  diagnosticsFromMessages,
  validateConfig,
  validateJsonLinks,
} from './validation';

export async function buildFull({
  wsPort,
  traceCache,
}: {
  wsPort: number;
  traceCache: TraceCache;
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

    const assetFiles = await bundleWatchAssets(
      outputDir,
      siteVariables,
      wsPort,
    );
    await populateStaticAssets(outputDir, siteVariables);

    const contentRecords = new Map<string, TadaSourceRecord>();
    for (const filePath of scan.contentFiles) {
      const record = renderContentRecord({
        filePath,
        siteVariables,
        scan,
        assetFiles,
        outputDir,
        traceCache,
        cachedTraceSourceDir: distDir,
      });
      if (record.outputs.size > 0) {
        contentRecords.set(filePath, record);
      }
    }

    const publicRecords = new Map<string, TadaSourceRecord>();
    for (const filePath of scan.publicFiles) {
      const record = createPublicRecord(filePath, scan.publicDir);
      writeAssets(outputDir, record.outputs);
      publicRecords.set(filePath, record);
    }

    const linkDiagnostics = validateJsonLinks(scan.validTargets);
    if (linkDiagnostics.length > 0) {
      removeDirIfExists(outputDir);
      return { ok: false, diagnostics: linkDiagnostics };
    }

    const nextSnapshot = createSnapshot({
      siteVariables,
      assetFiles,
      navData: json('nav.json'),
      authorsData: json('authors.json'),
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
