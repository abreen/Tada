import path from 'path';
import {
  renderCodePageAsset,
  renderCopiedContentAsset,
  renderLiterateJavaPageAsset,
  renderPlainTextPageAsset,
  toPosix,
} from './util';
import { readSourceFile } from './variables';
import type {
  Asset,
  OutputContent,
  HtmlOutputAnalysis,
  RenderDependencyCollector,
  SiteVariables,
  TraceToolAvailability,
} from './types';
import type { TadaProjectScan } from './source-model';
import type { AuthorScripts } from './author-scripts';
import type { DocumentIndex } from './document-index';

import type { TraceCache } from './build-types';

export interface TadaSourceRecord {
  sourcePath: string;
  kind: 'content' | 'public';
  outputs: Map<string, OutputContent>;
  htmlAnalysisByOutputPath?: Map<string, HtmlOutputAnalysis>;
  partialDeps: Set<string>;
  traceDeps: Set<string>;
  internalTargets: Set<string>;
  /** Titles the page's wikilinks look up */
  wikiTitles: Set<string>;
  authorKey?: string;
}

function createDependencyCollector(): {
  collector: RenderDependencyCollector;
  partials: Set<string>;
  traceFiles: Set<string>;
  internalTargets: Set<string>;
  wikiTitles: Set<string>;
  traceOutputs: Map<string, string>;
  authorKey: string | undefined;
} {
  const partials = new Set<string>();
  const traceFiles = new Set<string>();
  const internalTargets = new Set<string>();
  const wikiTitles = new Set<string>();
  const traceOutputs = new Map<string, string>();
  let authorKey: string | undefined;

  return {
    collector: {
      partials,
      traceFiles,
      internalTargets,
      wikiTitles,
      traceOutputs,
      setAuthorKey(value: string) {
        authorKey = value;
      },
    },
    partials,
    traceFiles,
    internalTargets,
    wikiTitles,
    traceOutputs,
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
    wikiTitles: new Set(),
  };
}

function createRawContentAsset(filePath: string, contentDir: string): Asset[] {
  return [
    {
      assetPath: toPosix(path.relative(contentDir, filePath)),
      content: { copyFrom: filePath },
    },
  ];
}

export function createContentRecord({
  filePath,
  siteVariables,
  scan,
  assetFiles,
  authorScripts,
  isWatchMode,
  traceCache,
  traceToolAvailability,
  skipLiterateJavaExecution,
  documentIndex,
}: {
  filePath: string;
  siteVariables: SiteVariables;
  scan: TadaProjectScan;
  assetFiles: string[];
  authorScripts: AuthorScripts;
  isWatchMode: boolean;
  traceCache?: TraceCache;
  traceToolAvailability?: TraceToolAvailability;
  skipLiterateJavaExecution?: boolean;
  documentIndex?: DocumentIndex;
}): TadaSourceRecord {
  const renderKind = scan.sources.get(filePath)?.renderKind ?? 'skip';
  if (
    renderKind === 'skip' ||
    renderKind === 'public-copy' ||
    renderKind === 'document-index'
  ) {
    return createEmptyContentRecord(filePath);
  }
  const documentNavigation = documentIndex?.get(filePath);

  const deps = createDependencyCollector();
  const assets: Asset[] = [];

  switch (renderKind) {
    case 'literate-java':
      assets.push(
        ...renderLiterateJavaPageAsset({
          filePath,
          contentDir: scan.contentDir,
          siteVariables,
          assetFiles,
          authorScripts,
          isWatchMode,
          skipExecution: skipLiterateJavaExecution,
          validInternalTargets: scan.validTargets,
          generatedPageTargets: scan.generatedPageTargets,
          codePageSourceTargets: scan.codePageSourceTargets,
          literateJavaOutputPaths: scan.literateJavaOutputPaths,
          dependencyCollector: deps.collector,
          documentNavigation,
          pageTitles: scan.pageTitles,
        }),
      );
      break;
    case 'plain-text-page':
      assets.push(
        ...renderPlainTextPageAsset({
          filePath,
          contentDir: scan.contentDir,
          siteVariables,
          validInternalTargets: scan.validTargets,
          generatedPageTargets: scan.generatedPageTargets,
          codePageSourceTargets: scan.codePageSourceTargets,
          assetFiles,
          authorScripts,
          isWatchMode,
          literateJavaOutputPaths: scan.literateJavaOutputPaths,
          dependencyCollector: deps.collector,
          documentNavigation,
          traceCache,
          traceToolAvailability,
          pageTitles: scan.pageTitles,
        }),
      );
      break;
    case 'code-page': {
      // Shared so the code page and the copied file substitute variables once
      const source = readSourceFile(filePath, scan.contentDir, siteVariables);
      assets.push(
        ...renderCodePageAsset({
          filePath,
          source,
          contentDir: scan.contentDir,
          siteVariables,
          validInternalTargets: scan.validTargets,
          generatedPageTargets: scan.generatedPageTargets,
          codePageSourceTargets: scan.codePageSourceTargets,
          assetFiles,
          authorScripts,
          isWatchMode,
          literateJavaOutputPaths: scan.literateJavaOutputPaths,
          dependencyCollector: deps.collector,
          documentNavigation,
        }),
      );
      assets.push(
        ...renderCopiedContentAsset({
          filePath,
          source,
          contentDir: scan.contentDir,
          siteVariables,
        }),
      );
      break;
    }
    case 'content-copy':
      assets.push(...createRawContentAsset(filePath, scan.contentDir));
      break;
  }

  return {
    sourcePath: filePath,
    kind: 'content',
    outputs: collectSourceOutputs(assets, deps.traceOutputs),
    htmlAnalysisByOutputPath: collectSourceHtmlAnalysis(assets),
    partialDeps: deps.partials,
    traceDeps: deps.traceFiles,
    internalTargets: deps.internalTargets,
    wikiTitles: deps.wikiTitles,
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
    outputs: new Map([[relPath, { copyFrom: filePath }]]),
    htmlAnalysisByOutputPath: new Map(),
    partialDeps: new Set(),
    traceDeps: new Set(),
    internalTargets: new Set(),
    wikiTitles: new Set(),
  };
}

function collectSourceOutputs(
  assets: Asset[],
  traceOutputs: ReadonlyMap<string, string>,
): Map<string, OutputContent> {
  const outputs = new Map<string, OutputContent>();
  for (const asset of assets) {
    outputs.set(asset.assetPath, asset.content);
  }
  for (const [outputPath, content] of traceOutputs) {
    outputs.set(outputPath, content);
  }
  return outputs;
}

function cloneHtmlOutputAnalysis(
  analysis: HtmlOutputAnalysis,
): HtmlOutputAnalysis {
  return { outgoingTargets: new Set(analysis.outgoingTargets) };
}

function collectSourceHtmlAnalysis(
  assets: Asset[],
): Map<string, HtmlOutputAnalysis> {
  const htmlAnalysisByOutputPath = new Map<string, HtmlOutputAnalysis>();
  for (const asset of assets) {
    if (!asset.assetPath.endsWith('.html') || !asset.htmlAnalysis) {
      continue;
    }
    htmlAnalysisByOutputPath.set(
      asset.assetPath,
      cloneHtmlOutputAnalysis(asset.htmlAnalysis),
    );
  }
  return htmlAnalysisByOutputPath;
}
