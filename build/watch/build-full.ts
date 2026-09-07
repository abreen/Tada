import { compileTemplates, config } from '../templates';
import { getDevSiteVariables } from '../site-variables';
import { getDistDir } from '../util';
import type { CompilerBuildResult } from './snapshot';
import { createSnapshot } from './snapshot';
import type { TadaSourceRecord } from '../source-records';
import { scanProject } from '../source-model';
import type { TraceCache, WatchTraceOptions } from '../build-types';
import {
  bundleWatchAssets,
  ensureHighlighter,
  makeTempBuildDir,
  populateStaticAssets,
  removeDirIfExists,
} from './assets';
import {
  validateConfig,
  validateProjectConfigLinks,
} from '../build-validation';
import { buildFailedFromError, buildSucceeded } from './build-result';
import { buildFailedWithDiagnostics, renderSource } from './build-helpers';

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
    const configDiagnostics = validateConfig(scan, siteVariables);
    if (configDiagnostics.length > 0) {
      return buildFailedWithDiagnostics(outputDir, configDiagnostics);
    }

    compileTemplates(siteVariables);
    await ensureHighlighter(siteVariables);

    const assetFiles = await bundleWatchAssets(outputDir, siteVariables);
    await populateStaticAssets(outputDir, siteVariables);

    const records = new Map<string, TadaSourceRecord>();
    for (const filePath of scan.sources.keys()) {
      const record = renderSource({
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
        records.set(filePath, record);
      }
    }

    const linkDiagnostics = validateProjectConfigLinks(scan.validTargets);
    if (linkDiagnostics.length > 0) {
      return buildFailedWithDiagnostics(outputDir, linkDiagnostics);
    }

    const nextSnapshot = createSnapshot({
      siteVariables,
      assetFiles,
      authorsData: config('authors'),
      scan,
      records,
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
