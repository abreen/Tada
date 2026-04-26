import { createContentRecord, createPublicRecord } from '../source-records';
import type { SiteVariables } from '../types';
import type { TadaProjectScan, TadaSourceRecord } from './snapshot';
import type { CompilerBuildResult, WatchDiagnostic } from './types';
import type { TraceCache, WatchTraceOptions } from './compiler-types';
import { removeDirIfExists, writeAssets } from './assets';

export function buildFailedWithDiagnostics(
  outputDir: string,
  diagnostics: WatchDiagnostic[],
): CompilerBuildResult {
  removeDirIfExists(outputDir);
  return { ok: false, diagnostics };
}

export function renderContentRecord({
  filePath,
  siteVariables,
  scan,
  assetFiles,
  outputDir,
  traceCache,
  traceOptions,
  cachedTraceSourceDir,
}: {
  filePath: string;
  siteVariables: SiteVariables;
  scan: TadaProjectScan;
  assetFiles: string[];
  outputDir: string;
  traceCache: TraceCache;
  traceOptions: WatchTraceOptions;
  cachedTraceSourceDir: string;
}): TadaSourceRecord | undefined {
  const record = createContentRecord({
    filePath,
    siteVariables,
    scan,
    assetFiles,
    outputDir,
    traceCache,
    traceToolAvailability: traceOptions.toolAvailability,
    cachedTraceSourceDir,
  });
  if (record.outputs.size === 0) {
    return undefined;
  }
  writeAssets(outputDir, record.outputs);
  return record;
}

export function renderPublicRecord({
  filePath,
  publicDir,
  outputDir,
}: {
  filePath: string;
  publicDir: string;
  outputDir?: string;
}): TadaSourceRecord {
  const record = createPublicRecord(filePath, publicDir);
  if (outputDir) {
    writeAssets(outputDir, record.outputs);
  }
  return record;
}
