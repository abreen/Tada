import { compileTemplates, config } from '../templates';
import { getDevSiteVariables } from '../site-variables';
import { getDistDir } from '../util';
import type { CompilerBuildResult } from './types';
import { createSnapshot, type TadaSourceRecord } from './snapshot';
import { scanProject } from '../source-model';
import type { TraceCache, WatchTraceOptions } from './compiler-types';
import {
  bundleWatchAssets,
  ensureHighlighter,
  makeTempBuildDir,
  populateStaticAssets,
  removeDirIfExists,
} from './assets';
import { validateConfig, validateProjectConfigLinks } from './validation';
import { buildFailedFromError, buildSucceeded } from './build-result';
import {
  buildFailedWithDiagnostics,
  renderContentRecord,
  renderPublicRecord,
} from './build-helpers';

export async function buildFull({
  traceCache,
  traceOptions,
}: {
  traceCache: TraceCache;
  traceOptions: WatchTraceOptions;
}): Promise<CompilerBuildResult> {
  const distDir = getDistDir();
  const outputDir = makeTempBuildDir(distDir);
  try {
    const siteVariables = getDevSiteVariables();
    const scan = scanProject(siteVariables);
    const configDiagnostics = validateConfig(scan);
    if (configDiagnostics.length > 0) {
      return buildFailedWithDiagnostics(outputDir, configDiagnostics);
    }

    compileTemplates(siteVariables);
    await ensureHighlighter(siteVariables);

    const assetFiles = await bundleWatchAssets(outputDir, siteVariables);
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
        traceOptions,
        cachedTraceSourceDir: distDir,
      });
      if (record) {
        contentRecords.set(filePath, record);
      }
    }

    const publicRecords = new Map<string, TadaSourceRecord>();
    for (const filePath of scan.publicFiles) {
      const record = renderPublicRecord({
        filePath,
        publicDir: scan.publicDir,
        outputDir,
      });
      publicRecords.set(filePath, record);
    }

    const linkDiagnostics = validateProjectConfigLinks(scan.validTargets);
    if (linkDiagnostics.length > 0) {
      return buildFailedWithDiagnostics(outputDir, linkDiagnostics);
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

    return buildSucceeded(nextSnapshot, {
      kind: 'replace-root',
      stagedPath: outputDir,
      targetPath: distDir,
    });
  } catch (error) {
    removeDirIfExists(outputDir);
    return buildFailedFromError(error);
  }
}
