import fs from 'fs';
import path from 'path';
import { getExtensionToShikiLanguage } from '../site-variables';
import {
  renderCodePageAsset,
  renderCopiedContentAsset,
  renderLiterateJavaPageAsset,
  renderPlainTextPageAsset,
  toPosix,
} from '../util';
import { extensionIsMarkdown, isLiterateJava } from '../utils/file-types';
import type {
  Asset,
  RenderDependencyCollector,
  SiteVariables,
  TraceToolAvailability,
} from '../types';
import {
  collectSourceOutputs,
  type TadaProjectScan,
  type TadaSourceRecord,
} from './snapshot';
import type { TraceCache } from './compiler-types';
import { writeAssets } from './assets';

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

function createRawContentAsset(filePath: string, contentDir: string): Asset[] {
  return [
    {
      assetPath: toPosix(path.relative(contentDir, filePath)),
      content: fs.readFileSync(filePath),
    },
  ];
}

export function renderContentRecord({
  filePath,
  siteVariables,
  scan,
  assetFiles,
  outputDir,
  traceCache,
  traceToolAvailability,
  cachedTraceSourceDir,
  persistOutputs = true,
}: {
  filePath: string;
  siteVariables: SiteVariables;
  scan: TadaProjectScan;
  assetFiles: string[];
  outputDir: string;
  traceCache: TraceCache;
  traceToolAvailability: TraceToolAvailability;
  cachedTraceSourceDir?: string;
  persistOutputs?: boolean;
}): TadaSourceRecord {
  const deps = createDependencyCollector();
  const codeExtensions = Object.keys(
    getExtensionToShikiLanguage(siteVariables),
  ).map(ext => ext.toLowerCase());
  const ext = path.extname(filePath).slice(1).toLowerCase();
  const assets: Asset[] = [];

  if (isLiterateJava(filePath)) {
    assets.push(
      ...renderLiterateJavaPageAsset({
        filePath,
        contentDir: scan.contentDir,
        distDir: outputDir,
        siteVariables,
        assetFiles,
        validInternalTargets: scan.validTargets,
        literateJavaOutputPaths: scan.literateJavaOutputPaths,
        dependencyCollector: deps.collector,
      }),
    );
  } else if (scan.buildContentFiles.has(filePath)) {
    if (
      extensionIsMarkdown(path.extname(filePath).toLowerCase()) ||
      path.extname(filePath).toLowerCase() === '.html'
    ) {
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
    } else if (codeExtensions.includes(ext)) {
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
    }
  } else if (!scan.processedExts.has(ext)) {
    assets.push(...createRawContentAsset(filePath, scan.contentDir));
  }

  const outputs = collectSourceOutputs(
    assets,
    deps.generatedOutputPaths,
    outputDir,
  );
  if (persistOutputs) {
    writeAssets(outputDir, outputs);
  }

  return {
    sourcePath: filePath,
    kind: 'content',
    outputs,
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
    partialDeps: new Set(),
    traceDeps: new Set(),
    internalTargets: new Set(),
    generatedOutputPaths: new Set(),
  };
}
