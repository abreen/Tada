import { compileTemplates, config } from './templates';
import { toDisplayPath } from './utils/paths';
import { makeLogger } from './log';
import { getRuntimeBundledShikiLanguages } from './site-variables';
import { initHighlighter } from './utils/shiki-highlighter';
import { generateSiteAssets } from './site-assets';
import {
  proofreadRecord,
  startProofreader,
  type Proofreader,
} from './proofread';
import { getPdfSources } from './pagefind';
import { checkTraceToolAvailability } from './utils/trace';
import {
  getScriptEntries,
  scanProject,
  sourcePaths,
  type TadaProjectScan,
} from './source-model';
import { bundleAuthorScripts, type AuthorScripts } from './author-scripts';
import { addRenderers, bundleAuthorRenderers } from './author-renderers';
import { BundleError } from './bundle';
import { getProjectDir, getSrcDir } from './utils/paths';
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
import { loadDocumentIndex, type DocumentIndex } from './document-index';
import { readPageTitle, retainPageTitles } from './utils/render';
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
  /** Files Tada generates itself, not including author scripts */
  generatedOutputs: ReadonlyMap<string, OutputContent>;
  authorScripts: AuthorScripts;
  authorsData: unknown;
  documentIndex: DocumentIndex;
  records: ReadonlyMap<string, TadaSourceRecord>;
  outputs: ReadonlyMap<string, OutputFile>;
  fileDependents: ReadonlyMap<string, ReadonlySet<string>>;
  targetDependents: ReadonlyMap<string, ReadonlySet<string>>;
  /** Pages by the titles their wikilinks look up */
  titleDependents: ReadonlyMap<string, ReadonlySet<string>>;
  authorDependents: ReadonlyMap<string, ReadonlySet<string>>;
  scan: TadaProjectScan;
}

type SnapshotInputs = Pick<
  TadaSnapshot,
  | 'siteVariables'
  | 'assetFiles'
  | 'authorScripts'
  | 'authorsData'
  | 'records'
  | 'scan'
> & {
  generatedOutputs?: ReadonlyMap<string, OutputContent>;
  documentIndex: DocumentIndex;
};

export type SiteBuildResult =
  | { ok: true; snapshot: TadaSnapshot }
  | { ok: false; diagnostics: BuildDiagnostic[] };

export interface RenderContext {
  siteVariables: SiteVariables;
  scan: TadaProjectScan;
  assetFiles: string[];
  authorScripts: AuthorScripts;
  isWatchMode: boolean;
  traceCache: TraceCache;
  traceToolAvailability: TraceToolAvailability;
  documentIndex: DocumentIndex;
  /** Watch mode's proofreader, which checks each page as soon as it renders */
  proofreader?: Proofreader | null;
}

export function createSnapshot(inputs: SnapshotInputs): TadaSnapshot {
  const generatedOutputs = inputs.generatedOutputs ?? new Map();
  const outputs = new Map<string, OutputFile>();
  for (const [outputPath, content] of [
    ...generatedOutputs,
    ...inputs.authorScripts.outputs,
  ]) {
    outputs.set(outputPath, { sourcePath: GENERATED_SOURCE, content });
  }
  const fileDependents = new Map<string, Set<string>>();
  const targetDependents = new Map<string, Set<string>>();
  const titleDependents = new Map<string, Set<string>>();
  const authorDependents = new Map<string, Set<string>>();
  for (const record of inputs.records.values()) {
    for (const [outputPath, content] of record.outputs) {
      outputs.set(outputPath, { sourcePath: record.sourcePath, content });
    }
    for (const [index, keys] of [
      [fileDependents, [...record.partialDeps, ...record.traceDeps]],
      [targetDependents, record.internalTargets],
      [titleDependents, record.wikiTitles],
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
    titleDependents,
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
): {
  records: Map<string, TadaSourceRecord>;
  diagnostics: BuildDiagnostic[];
  /** Settles once every rendered page is proofread */
  proofreading: Promise<unknown>;
} {
  const records = new Map<string, TadaSourceRecord>();
  const diagnostics: BuildDiagnostic[] = [];
  const proofreading: Promise<void>[] = [];
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
              authorScripts: context.authorScripts,
              isWatchMode: context.isWatchMode,
              traceCache: context.traceCache,
              traceToolAvailability: context.traceToolAvailability,
              skipLiterateJavaExecution: !context.traceToolAvailability.java,
              documentIndex: context.documentIndex,
            });
      if (record.outputs.size > 0) {
        records.set(filePath, record);
        if (context.proofreader) {
          proofreading.push(
            ...proofreadRecord(record, context.proofreader.check),
          );
        }
      }
    } catch (error) {
      const { message } = diagnosticFromError(error);
      // Every page error names its file.
      const relPath = toDisplayPath(filePath);
      diagnostics.push({
        message:
          message.includes(filePath) || message.includes(relPath)
            ? message
            : `${filePath}: ${message}`,
      });
    }
  }
  if (proofreading.length > 0) {
    log.info`Proofreading ${proofreading.length} ${proofreading.length === 1 ? 'page' : 'pages'}`;
  }
  return { records, diagnostics, proofreading: Promise.all(proofreading) };
}

/** Validates rendered records and assembles the snapshot of a build. */
export function finishBuild({
  siteVariables,
  scan,
  assetFiles,
  generatedOutputs,
  authorScripts,
  documentIndex,
  records,
  diagnostics,
}: {
  siteVariables: SiteVariables;
  scan: TadaProjectScan;
  assetFiles: string[];
  generatedOutputs: ReadonlyMap<string, OutputContent>;
  authorScripts: AuthorScripts;
  documentIndex: DocumentIndex;
  records: ReadonlyMap<string, TadaSourceRecord>;
  diagnostics: BuildDiagnostic[];
}): SiteBuildResult {
  const allDiagnostics = [
    ...diagnostics,
    ...validateProjectConfigLinks(scan.validTargets),
    ...findOutputConflicts(
      scan,
      siteVariables,
      new Map([...generatedOutputs, ...authorScripts.outputs]),
      records,
    ),
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
      authorScripts,
      authorsData: config('authors'),
      documentIndex,
      scan,
      records,
    }),
  };
}

/** Reads the scan's document index files and the titles of the pages they list */
export function buildDocumentIndexForScan(
  scan: TadaProjectScan,
  siteVariables: SiteVariables,
): ReturnType<typeof loadDocumentIndex> {
  const result = loadDocumentIndex(scan, siteVariables, sourcePath =>
    readPageTitle(sourcePath, scan.sources.get(sourcePath)!, siteVariables),
  );
  if (result.ok) {
    retainPageTitles(siteVariables, new Set(result.value.keys()));
  }
  return result;
}

/**
 * Compiles the scripts in `src/` and packages that the site config and pages
 * list, as returned by getScriptEntries, and loads their renderer modules
 */
export async function buildAuthorScripts(
  entries: string[],
  siteVariables: SiteVariables,
  mode: 'development' | 'production',
): Promise<
  | { ok: true; value: AuthorScripts }
  | { ok: false; diagnostics: BuildDiagnostic[] }
> {
  if (entries.length > 0) {
    log.info`Compiling ${entries.length} ${entries.length === 1 ? 'script' : 'scripts'}`;
  }
  try {
    const [authorScripts, renderers] = await Promise.all([
      bundleAuthorScripts(
        entries,
        getSrcDir(),
        getProjectDir(),
        mode,
        siteVariables.basePath,
      ),
      bundleAuthorRenderers(entries, getSrcDir(), getProjectDir()),
    ]);
    return { ok: true, value: addRenderers(authorScripts, renderers) };
  } catch (error) {
    return {
      ok: false,
      diagnostics:
        error instanceof BundleError
          ? error.messages.map(message => ({ message }))
          : [diagnosticFromError(error)],
    };
  }
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

  // Harper loads in a worker while scripts compile and pages render
  const proofreader = isWatchMode ? startProofreader(siteVariables) : null;
  compileTemplates(siteVariables);
  await ensureHighlighter(siteVariables);
  const documentIndex = buildDocumentIndexForScan(scan, siteVariables);
  if (!documentIndex.ok) {
    return documentIndex;
  }
  // Independent bundles, so they build at the same time
  const [assets, authorScripts] = await Promise.all([
    generateSiteAssets(siteVariables, { mode, isWatchMode }),
    buildAuthorScripts(
      getScriptEntries(scan, siteVariables),
      siteVariables,
      mode,
    ),
  ]);
  if (!authorScripts.ok) {
    return { ok: false, diagnostics: authorScripts.diagnostics };
  }

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
  const { records, diagnostics, proofreading } = renderSources(
    scan.sources.keys(),
    {
      siteVariables,
      scan,
      assetFiles: assets.assetFiles,
      authorScripts: authorScripts.value,
      isWatchMode,
      traceCache,
      traceToolAvailability,
      documentIndex: documentIndex.value,
      proofreader,
    },
  );
  await proofreading;
  return finishBuild({
    siteVariables,
    scan,
    assetFiles: assets.assetFiles,
    generatedOutputs: assets.outputs,
    authorScripts: authorScripts.value,
    documentIndex: documentIndex.value,
    records,
    diagnostics,
  });
}
