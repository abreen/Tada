import path from 'path';
import {
  renderCodePageAsset,
  renderCopiedContentAsset,
  renderLiterateJavaPageAsset,
  renderPlainTextPageAsset,
  toPosix,
} from './util';
import type {
  Asset,
  OutputContent,
  HtmlOutputAnalysis,
  RenderDependencyCollector,
  SiteVariables,
  TraceToolAvailability,
} from './types';
import type { TadaProjectScan } from './source-model';

import type { TraceCache } from './build-types';

export interface TadaSourceRecord {
  sourcePath: string;
  kind: 'content' | 'public';
  outputs: Map<string, OutputContent>;
  htmlAnalysisByOutputPath?: Map<string, HtmlOutputAnalysis>;
  partialDeps: Set<string>;
  traceDeps: Set<string>;
  internalTargets: Set<string>;
  authorKey?: string;
}

function createDependencyCollector(): {
  collector: RenderDependencyCollector;
  partials: Set<string>;
  traceFiles: Set<string>;
  internalTargets: Set<string>;
  traceOutputs: Map<string, string>;
  authorKey: string | undefined;
} {
  const partials = new Set<string>();
  const traceFiles = new Set<string>();
  const internalTargets = new Set<string>();
  const traceOutputs = new Map<string, string>();
  let authorKey: string | undefined;

  return {
    collector: {
      partials,
      traceFiles,
      internalTargets,
      traceOutputs,
      setAuthorKey(value: string) {
        authorKey = value;
      },
    },
    partials,
    traceFiles,
    internalTargets,
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
  isWatchMode,
  traceCache,
  traceToolAvailability,
  skipLiterateJavaExecution,
}: {
  filePath: string;
  siteVariables: SiteVariables;
  scan: TadaProjectScan;
  assetFiles: string[];
  isWatchMode: boolean;
  traceCache?: TraceCache;
  traceToolAvailability?: TraceToolAvailability;
  skipLiterateJavaExecution?: boolean;
}): TadaSourceRecord {
  const renderKind = scan.sources.get(filePath)?.renderKind ?? 'skip';
  if (renderKind === 'skip' || renderKind === 'public-copy') {
    return createEmptyContentRecord(filePath);
  }

  const deps = createDependencyCollector();
  const assets: Asset[] = [];
  const pageOptions = {
    filePath,
    contentDir: scan.contentDir,
    siteVariables,
    assetFiles,
    isWatchMode,
    validInternalTargets: scan.validTargets,
    generatedPageTargets: scan.generatedPageTargets,
    codePageSourceTargets: scan.codePageSourceTargets,
    literateJavaOutputPaths: scan.literateJavaOutputPaths,
    dependencyCollector: deps.collector,
  };

  switch (renderKind) {
    case 'literate-java':
      assets.push(
        ...renderLiterateJavaPageAsset({
          ...pageOptions,
          skipExecution: skipLiterateJavaExecution,
        }),
      );
      break;
    case 'plain-text-page':
      assets.push(
        ...renderPlainTextPageAsset({
          ...pageOptions,
          traceCache,
          traceToolAvailability,
        }),
      );
      break;
    case 'code-page':
      assets.push(...renderCodePageAsset(pageOptions));
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
    outputs: collectSourceOutputs(assets, deps.traceOutputs),
    htmlAnalysisByOutputPath: collectSourceHtmlAnalysis(assets),
    partialDeps: deps.partials,
    traceDeps: deps.traceFiles,
    internalTargets: deps.internalTargets,
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
  };
}

export function collectSourceOutputs(
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

export function collectSourceHtmlAnalysis(
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
