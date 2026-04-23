import fs from 'fs';
import path from 'path';
import { getExtensionToShikiLanguage } from './site-variables';
import {
  renderCodePageAsset,
  renderCopiedContentAsset,
  renderLiterateJavaPageAsset,
  renderPlainTextPageAsset,
  toPosix,
} from './util';
import { extensionIsMarkdown, isLiterateJava } from './utils/file-types';
import type {
  Asset,
  RenderDependencyCollector,
  SiteVariables,
  TraceToolAvailability,
} from './types';
import type { TadaProjectScan } from './source-model';
import {
  collectSourceHtmlAnalysis,
  collectSourceOutputs,
  type TadaSourceRecord,
} from './watch/snapshot';
import type { TraceCache } from './watch/compiler-types';

export type TadaSourceRenderKind =
  | 'skip'
  | 'plain-text-page'
  | 'literate-java'
  | 'code-page'
  | 'content-copy'
  | 'public-copy';

function createDependencyCollector(): {
  collector: RenderDependencyCollector;
  partials: Set<string>;
  traceFiles: Set<string>;
  internalTargets: Set<string>;
  generatedOutputPaths: Set<string>;
  authorKey: string | undefined;
} {
  const partials = new Set<string>();
  const traceFiles = new Set<string>();
  const internalTargets = new Set<string>();
  const generatedOutputPaths = new Set<string>();
  let authorKey: string | undefined;

  return {
    collector: {
      partials,
      traceFiles,
      internalTargets,
      generatedOutputPaths,
      setAuthorKey(value: string) {
        authorKey = value;
      },
    },
    partials,
    traceFiles,
    internalTargets,
    generatedOutputPaths,
    get authorKey() {
      return authorKey;
    },
  };
}

function createEmptyContentRecord(filePath: string): TadaSourceRecord {
  return {
    sourcePath: filePath,
    kind: 'content',
    outputs: new Map(),
    htmlAnalysisByOutputPath: new Map(),
    partialDeps: new Set(),
    traceDeps: new Set(),
    internalTargets: new Set(),
    generatedOutputPaths: new Set(),
  };
}

function createRawContentAsset(filePath: string, contentDir: string): Asset[] {
  return [
    {
      assetPath: toPosix(path.relative(contentDir, filePath)),
      content: fs.readFileSync(filePath),
    },
  ];
}

export function classifySourceRenderKind({
  filePath,
  scan,
  siteVariables,
}: {
  filePath: string;
  scan: TadaProjectScan;
  siteVariables: SiteVariables;
}): TadaSourceRenderKind {
  if (scan.publicFiles.has(filePath)) {
    return 'public-copy';
  }

  if (!scan.contentFiles.has(filePath)) {
    return 'skip';
  }

  const ext = path.extname(filePath).slice(1).toLowerCase();
  const lowerExt = path.extname(filePath).toLowerCase();
  if (!scan.processedExts.has(ext)) {
    return 'content-copy';
  }

  if (!scan.buildContentFiles.has(filePath)) {
    return 'skip';
  }

  if (isLiterateJava(filePath)) {
    return 'literate-java';
  }

  if (extensionIsMarkdown(lowerExt) || lowerExt === '.html') {
    return 'plain-text-page';
  }

  if (Object.hasOwn(getExtensionToShikiLanguage(siteVariables), ext)) {
    return 'code-page';
  }

  return 'skip';
}

export function createContentRecord({
  filePath,
  siteVariables,
  scan,
  assetFiles,
  outputDir,
  traceCache,
  traceToolAvailability,
  cachedTraceSourceDir,
  skipLiterateJavaExecution,
}: {
  filePath: string;
  siteVariables: SiteVariables;
  scan: TadaProjectScan;
  assetFiles: string[];
  outputDir: string;
  traceCache?: TraceCache;
  traceToolAvailability?: TraceToolAvailability;
  cachedTraceSourceDir?: string;
  skipLiterateJavaExecution?: boolean;
}): TadaSourceRecord {
  const renderKind = classifySourceRenderKind({
    filePath,
    scan,
    siteVariables,
  });
  if (renderKind === 'skip' || renderKind === 'public-copy') {
    return createEmptyContentRecord(filePath);
  }

  const deps = createDependencyCollector();
  const assets: Asset[] = [];

  switch (renderKind) {
    case 'literate-java':
      assets.push(
        ...renderLiterateJavaPageAsset({
          filePath,
          contentDir: scan.contentDir,
          distDir: outputDir,
          siteVariables,
          assetFiles,
          skipExecution: skipLiterateJavaExecution,
          validInternalTargets: scan.validTargets,
          literateJavaOutputPaths: scan.literateJavaOutputPaths,
          dependencyCollector: deps.collector,
        }),
      );
      break;
    case 'plain-text-page':
      assets.push(
        ...renderPlainTextPageAsset({
          filePath,
          contentDir: scan.contentDir,
          distDir: outputDir,
          siteVariables,
          validInternalTargets: scan.validTargets,
          assetFiles,
          literateJavaOutputPaths: scan.literateJavaOutputPaths,
          dependencyCollector: deps.collector,
          cachedTraceSourceDir,
          traceCache,
          traceToolAvailability,
        }),
      );
      break;
    case 'code-page':
      assets.push(
        ...renderCodePageAsset({
          filePath,
          contentDir: scan.contentDir,
          distDir: outputDir,
          siteVariables,
          validInternalTargets: scan.validTargets,
          assetFiles,
          literateJavaOutputPaths: scan.literateJavaOutputPaths,
          dependencyCollector: deps.collector,
        }),
      );
      assets.push(
        ...renderCopiedContentAsset({
          filePath,
          contentDir: scan.contentDir,
          siteVariables,
        }),
      );
      break;
    case 'content-copy':
      assets.push(...createRawContentAsset(filePath, scan.contentDir));
      break;
  }

  return {
    sourcePath: filePath,
    kind: 'content',
    outputs: collectSourceOutputs(assets, deps.generatedOutputPaths, outputDir),
    htmlAnalysisByOutputPath: collectSourceHtmlAnalysis(assets),
    partialDeps: deps.partials,
    traceDeps: deps.traceFiles,
    internalTargets: deps.internalTargets,
    generatedOutputPaths: deps.generatedOutputPaths,
    authorKey: deps.authorKey,
  };
}

export function createPublicRecord(
  filePath: string,
  publicDir: string,
): TadaSourceRecord {
  const relPath = toPosix(path.relative(publicDir, filePath));
  return {
    sourcePath: filePath,
    kind: 'public',
    outputs: new Map([[relPath, fs.readFileSync(filePath)]]),
    htmlAnalysisByOutputPath: new Map(),
    partialDeps: new Set(),
    traceDeps: new Set(),
    internalTargets: new Set(),
    generatedOutputPaths: new Set(),
  };
}
