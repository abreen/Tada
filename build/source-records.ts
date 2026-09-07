import fs from 'fs';
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
  outputs: Map<string, string | Buffer>;
  htmlAnalysisByOutputPath?: Map<string, HtmlOutputAnalysis>;
  partialDeps: Set<string>;
  traceDeps: Set<string>;
  internalTargets: Set<string>;
  generatedOutputPaths: Set<string>;
  authorKey?: string;
}

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
  const renderKind = scan.sources.get(filePath)?.renderKind ?? 'skip';
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

export function collectSourceOutputs(
  assets: Asset[],
  generatedOutputPaths: Set<string>,
  stageDir: string,
): Map<string, string | Buffer> {
  const outputs = new Map<string, string | Buffer>();
  for (const asset of assets) {
    outputs.set(asset.assetPath, asset.content);
  }
  for (const outputPath of generatedOutputPaths) {
    outputs.set(outputPath, fs.readFileSync(path.join(stageDir, outputPath)));
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
