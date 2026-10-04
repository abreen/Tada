import path from 'path';
import { compileTemplates, config } from './templates';
import { getProjectDir, toPosix } from './utils/paths';
import { makeLogger } from './log';
import { getRuntimeBundledShikiLanguages } from './site-variables';
import { initHighlighter } from './utils/shiki-highlighter';
import { generateSiteAssets } from './site-assets';
import { getPdfSources } from './pagefind';
import { checkTraceToolAvailability } from './utils/trace';
import { scanProject, sourcePaths, type TadaProjectScan } from './source-model';
import {
  createContentRecord,
  createPublicRecord,
  type TadaSourceRecord,
} from './source-records';
import {
  diagnosticFromError,
  findOutputConflicts,
  validateConfig,
  validateProjectConfigLinks,
} from './build-validation';
import type { OutputFile } from './output-publication';
import type {
  OutputContent,
  SiteVariables,
  TraceToolAvailability,
} from './types';
import type { BuildDiagnostic, TadaBuildMeta, TraceCache } from './build-types';

const log = makeLogger(import.meta.url);

/** The `sourcePath` recorded for files Tada generates itself */
export const GENERATED_SOURCE = 'tada';

/** Everything one successful build produced, kept by watch mode */
export interface TadaSnapshot {
  siteVariables: SiteVariables;
  assetFiles: string[];
  generatedOutputs: ReadonlyMap<string, OutputContent>;
  authorsData: unknown;
  records: ReadonlyMap<string, TadaSourceRecord>;
  outputs: ReadonlyMap<string, OutputFile>;
  fileDependents: ReadonlyMap<string, ReadonlySet<string>>;
  targetDependents: ReadonlyMap<string, ReadonlySet<string>>;
  authorDependents: ReadonlyMap<string, ReadonlySet<string>>;
  scan: TadaProjectScan;
}

type SnapshotInputs = Pick<
  TadaSnapshot,
  'siteVariables' | 'assetFiles' | 'authorsData' | 'records' | 'scan'
> & { generatedOutputs?: ReadonlyMap<string, OutputContent> };

export type SiteBuildResult =
  | { ok: true; snapshot: TadaSnapshot }
  | { ok: false; diagnostics: BuildDiagnostic[] };

export interface RenderContext {
  siteVariables: SiteVariables;
  scan: TadaProjectScan;
  assetFiles: string[];
  isWatchMode: boolean;
  traceCache: TraceCache;
  traceToolAvailability: TraceToolAvailability;
}

export function createSnapshot(inputs: SnapshotInputs): TadaSnapshot {
  const generatedOutputs = inputs.generatedOutputs ?? new Map();
  const outputs = new Map<string, OutputFile>();
  for (const [outputPath, content] of generatedOutputs) {
    outputs.set(outputPath, { sourcePath: GENERATED_SOURCE, content });
  }
  const fileDependents = new Map<string, Set<string>>();
  const targetDependents = new Map<string, Set<string>>();
  const authorDependents = new Map<string, Set<string>>();
  for (const record of inputs.records.values()) {
    for (const [outputPath, content] of record.outputs) {
      outputs.set(outputPath, { sourcePath: record.sourcePath, content });
    }
    for (const [index, keys] of [
      [fileDependents, [...record.partialDeps, ...record.traceDeps]],
      [targetDependents, record.internalTargets],
      [authorDependents, record.authorKey ? [record.authorKey] : []],
    ] as const) {
      for (const key of keys) {
        if (!index.has(key)) {
          index.set(key, new Set());
        }
        index.get(key)!.add(record.sourcePath);
      }
    }
  }
  return {
    ...inputs,
    generatedOutputs,
    outputs,
    fileDependents,
    targetDependents,
    authorDependents,
  };
}

export function createBuildMeta(snapshot: TadaSnapshot): TadaBuildMeta {
  const htmlAssetsByPath = new Map<string, string>();
  const htmlAnalysisByPath: TadaBuildMeta['htmlAnalysisByPath'] = new Map();
  for (const record of snapshot.records.values()) {
    if (record.kind !== 'content') {
      continue;
    }
    for (const [outputPath, content] of record.outputs) {
      if (outputPath.endsWith('.html') && typeof content === 'string') {
        htmlAssetsByPath.set(outputPath, content);
      }
    }
    for (const [outputPath, analysis] of record.htmlAnalysisByOutputPath ??
      []) {
      htmlAnalysisByPath.set(outputPath, analysis);
    }
  }
  return {
    htmlAssetsByPath,
    htmlAnalysisByPath,
    pdfSourceByOutputPath: getPdfSources(snapshot.scan),
    siteVariables: snapshot.siteVariables,
  };
}

export async function ensureHighlighter(
  siteVariables: SiteVariables,
): Promise<void> {
  await initHighlighter(getRuntimeBundledShikiLanguages(siteVariables));
}

/**
 * Renders each source into a record. A source that fails to render becomes a
 * diagnostic, and rendering continues so every page error is reported.
 */
export function renderSources(
  filePaths: Iterable<string>,
  context: RenderContext,
): { records: Map<string, TadaSourceRecord>; diagnostics: BuildDiagnostic[] } {
  const records = new Map<string, TadaSourceRecord>();
  const diagnostics: BuildDiagnostic[] = [];
  for (const filePath of filePaths) {
    try {
      const record =
        context.scan.sources.get(filePath)?.kind === 'public'
          ? createPublicRecord(filePath, context.scan.publicDir)
          : createContentRecord({
              filePath,
              siteVariables: context.siteVariables,
              scan: context.scan,
              assetFiles: context.assetFiles,
              isWatchMode: context.isWatchMode,
              traceCache: context.traceCache,
              traceToolAvailability: context.traceToolAvailability,
              skipLiterateJavaExecution: !context.traceToolAvailability.java,
            });
      if (record.outputs.size > 0) {
        records.set(filePath, record);
      }
    } catch (error) {
      const { message } = diagnosticFromError(error);
      // Every page error names its file.
      const relPath = toPosix(path.relative(getProjectDir(), filePath));
      diagnostics.push({
        message:
          message.includes(filePath) || message.includes(relPath)
            ? message
            : `${filePath}: ${message}`,
      });
    }
  }
  return { records, diagnostics };
}

/** Validates rendered records and assembles the snapshot of a build. */
export function finishBuild({
  siteVariables,
  scan,
  assetFiles,
  generatedOutputs,
  records,
  diagnostics,
}: {
  siteVariables: SiteVariables;
  scan: TadaProjectScan;
  assetFiles: string[];
  generatedOutputs: ReadonlyMap<string, OutputContent>;
  records: ReadonlyMap<string, TadaSourceRecord>;
  diagnostics: BuildDiagnostic[];
}): SiteBuildResult {
  const allDiagnostics = [
    ...diagnostics,
    ...validateProjectConfigLinks(scan.validTargets),
    ...findOutputConflicts(scan, siteVariables, generatedOutputs, records),
  ];
  if (allDiagnostics.length > 0) {
    return { ok: false, diagnostics: allDiagnostics };
  }
  return {
    ok: true,
    snapshot: createSnapshot({
      siteVariables,
      assetFiles,
      generatedOutputs,
      authorsData: config('authors'),
      scan,
      records,
    }),
  };
}

/** Builds every source and generated file in memory. Nothing is written. */
export async function buildSite({
  siteVariables,
  mode,
  isWatchMode,
  traceCache,
  traceToolAvailability,
  scan = scanProject(siteVariables),
}: {
  siteVariables: SiteVariables;
  mode: 'development' | 'production';
  isWatchMode: boolean;
  traceCache: TraceCache;
  /** Probed only if omitted and the site has content pages */
  traceToolAvailability?: TraceToolAvailability;
  /** A scan the caller already made with the same site variables */
  scan?: TadaProjectScan;
}): Promise<SiteBuildResult> {
  const configDiagnostics = validateConfig(scan, siteVariables);
  if (configDiagnostics.length > 0) {
    return { ok: false, diagnostics: configDiagnostics };
  }

  compileTemplates(siteVariables);
  await ensureHighlighter(siteVariables);
  const assets = await generateSiteAssets(siteVariables, { mode, isWatchMode });

  const pageCount = [...sourcePaths(scan, 'content', true)].length;
  if (pageCount > 0) {
    log.info`Processing ${pageCount} content ${pageCount === 1 ? 'file' : 'files'}`;
  }
  if (!traceToolAvailability) {
    traceToolAvailability = pageCount > 0 ? checkTraceToolAvailability() : {};
    if (pageCount > 0 && !traceToolAvailability.java) {
      log.warn`javac was not found; literate Java pages will not include execution output`;
    }
  }
  const { records, diagnostics } = renderSources(scan.sources.keys(), {
    siteVariables,
    scan,
    assetFiles: assets.assetFiles,
    isWatchMode,
    traceCache,
    traceToolAvailability,
  });
  return finishBuild({
    siteVariables,
    scan,
    assetFiles: assets.assetFiles,
    generatedOutputs: assets.outputs,
    records,
    diagnostics,
  });
}
