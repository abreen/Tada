import fs from 'fs';
import path from 'path';
import { makeLogger } from './log';
import { getRuntimeBundledShikiLanguages } from './site-variables';
import { createContentRecord } from './source-records';
import { validateConfigLinks } from './validate-config-links';
import { config, getConfigFileName } from './templates';
import { initHighlighter } from './utils/shiki-highlighter';
import { checkTraceToolAvailability, isTraceSourceFile } from './utils/trace';
import type {
  SiteVariables,
  ContentRenderOptions,
  ContentRenderResult,
  HtmlOutputAnalysis,
  TraceToolAvailability,
  WatchState,
} from './types';
import type { TadaSourceRecord } from './watch/snapshot';

const log = makeLogger(import.meta.url);

function cloneHtmlOutputAnalysis(
  analysis: HtmlOutputAnalysis,
): HtmlOutputAnalysis {
  return { outgoingTargets: new Set(analysis.outgoingTargets) };
}

export class ContentRenderer {
  private siteVariables: SiteVariables;
  private sourceFileCache: Map<string, TadaSourceRecord>;
  private lastBuildFiles: Set<string>;
  private javacAvailable: boolean | undefined;
  private traceToolAvailability: TraceToolAvailability | undefined;
  private traceCache: Map<
    string,
    {
      manifestUrl: string;
      artifactId: string;
      highlightedSource: string;
      totalSteps: number;
      mtime: number;
    }
  > = new Map();

  constructor(siteVariables: SiteVariables) {
    this.siteVariables = siteVariables;
    this.sourceFileCache = new Map();
    this.lastBuildFiles = new Set();
  }

  private getCachedRecord(filePath: string): TadaSourceRecord | undefined {
    return this.sourceFileCache.get(filePath);
  }

  async initHighlighter(): Promise<void> {
    await initHighlighter(getRuntimeBundledShikiLanguages(this.siteVariables));
  }

  getDirtySourceFiles(
    buildContentFiles: string[],
    { changedContentFiles, jsonDataChanged, partialsChanged }: WatchState = {},
  ): Set<string> {
    if (
      this.lastBuildFiles.size === 0 ||
      !changedContentFiles ||
      jsonDataChanged ||
      partialsChanged
    ) {
      return new Set(buildContentFiles);
    }

    // If any trace source changed, the trace cache will be stale, so rebuild
    // all content pages to pick up the new trace output.
    const traceFileChanged = [...changedContentFiles].some(isTraceSourceFile);
    if (traceFileChanged) {
      return new Set(buildContentFiles);
    }

    const buildFileSet = new Set(buildContentFiles);
    const dirtySourceFiles = new Set<string>();
    for (const filePath of changedContentFiles) {
      if (buildFileSet.has(filePath)) {
        dirtySourceFiles.add(filePath);
      }
    }
    return dirtySourceFiles;
  }

  updateSourceCache(
    filePath: string,
    record: TadaSourceRecord,
    changedOutputRelPaths: Set<string>,
    removedOutputRelPaths: Set<string>,
    changedHtmlAssetPaths: Set<string>,
    removedHtmlAssetPaths: Set<string>,
  ): void {
    const previousRecord = this.getCachedRecord(filePath);
    const nextOutputPaths = new Set(record.outputs.keys());

    for (const outputPath of previousRecord?.outputs.keys() ?? []) {
      if (nextOutputPaths.has(outputPath)) {
        continue;
      }
      removedOutputRelPaths.add(outputPath);
      if (outputPath.endsWith('.html')) {
        removedHtmlAssetPaths.add(outputPath);
      }
    }

    for (const outputPath of record.outputs.keys()) {
      changedOutputRelPaths.add(outputPath);
      if (outputPath.endsWith('.html')) {
        changedHtmlAssetPaths.add(outputPath);
      }
    }

    this.sourceFileCache.set(filePath, record);
  }

  writeCachedAssets(distDir: string, buildContentFiles: string[]): void {
    for (const filePath of buildContentFiles) {
      const record = this.getCachedRecord(filePath);
      if (!record) {
        continue;
      }
      for (const [outputPath, content] of record.outputs) {
        const outPath = path.join(distDir, outputPath);
        fs.mkdirSync(path.dirname(outPath), { recursive: true });
        fs.writeFileSync(outPath, content);
      }
    }
  }

  pruneRemovedSources(
    buildFileSet: Set<string>,
    removedOutputRelPaths: Set<string>,
    removedHtmlAssetPaths: Set<string>,
  ): void {
    for (const filePath of [...this.lastBuildFiles]) {
      if (buildFileSet.has(filePath)) {
        continue;
      }

      const previousRecord = this.getCachedRecord(filePath);
      for (const outputPath of previousRecord?.outputs.keys() ?? []) {
        removedOutputRelPaths.add(outputPath);
        if (outputPath.endsWith('.html')) {
          removedHtmlAssetPaths.add(outputPath);
        }
      }
      this.sourceFileCache.delete(filePath);
    }
  }

  processContent({
    distDir,
    assetFiles,
    scan,
    watchState,
  }: ContentRenderOptions): ContentRenderResult {
    const buildContentFiles = [...scan.buildContentFiles];
    const buildFileSet = new Set<string>(buildContentFiles);
    const dirtySourceFiles = this.getDirtySourceFiles(
      buildContentFiles,
      watchState,
    );
    const changedOutputRelPaths = new Set<string>();
    const removedOutputRelPaths = new Set<string>();
    const changedHtmlAssetPaths = new Set<string>();
    const removedHtmlAssetPaths = new Set<string>();
    const validInternalTargets = scan.validTargets;

    const errors: Error[] = [];

    const configLinkErrors = validateConfigLinks(
      validInternalTargets,
      config('nav'),
      config('authors'),
      {
        navFileName: getConfigFileName('nav'),
        authorsFileName: getConfigFileName('authors'),
      },
    );
    for (const msg of configLinkErrors) {
      errors.push(new Error(msg));
    }

    this.pruneRemovedSources(
      buildFileSet,
      removedOutputRelPaths,
      removedHtmlAssetPaths,
    );

    if (dirtySourceFiles.size > 0) {
      const noun = dirtySourceFiles.size === 1 ? 'file' : 'files';
      log.info`Processing ${dirtySourceFiles.size} content ${noun}`;
    }

    if (this.javacAvailable === undefined && dirtySourceFiles.size > 0) {
      this.traceToolAvailability = checkTraceToolAvailability();
      this.javacAvailable = this.traceToolAvailability.java;
      if (!this.javacAvailable) {
        log.warn`javac was not found; literate Java pages will not include execution output`;
      }
    }

    for (const filePath of dirtySourceFiles) {
      let record: TadaSourceRecord;
      try {
        record = createContentRecord({
          filePath,
          siteVariables: this.siteVariables,
          scan,
          assetFiles,
          outputDir: distDir,
          traceCache: this.traceCache,
          traceToolAvailability: this.traceToolAvailability,
          skipLiterateJavaExecution: !this.javacAvailable,
        });
      } catch (err) {
        errors.push(err as Error);
        continue;
      }
      this.updateSourceCache(
        filePath,
        record,
        changedOutputRelPaths,
        removedOutputRelPaths,
        changedHtmlAssetPaths,
        removedHtmlAssetPaths,
      );
    }

    this.writeCachedAssets(distDir, buildContentFiles);
    this.lastBuildFiles = buildFileSet;

    // Collect HTML asset content and analysis for Pagefind
    const htmlAssetsByPath = new Map<string, string>();
    const htmlAnalysisByPath = new Map<string, HtmlOutputAnalysis>();
    for (const filePath of buildContentFiles) {
      const record = this.getCachedRecord(filePath);
      if (!record) {
        continue;
      }
      for (const [outputPath, content] of record.outputs) {
        if (!outputPath.endsWith('.html') || typeof content !== 'string') {
          continue;
        }
        htmlAssetsByPath.set(outputPath, content);
        const analysis = record.htmlAnalysisByOutputPath?.get(outputPath);
        if (analysis) {
          htmlAnalysisByPath.set(outputPath, cloneHtmlOutputAnalysis(analysis));
        }
      }
    }

    return {
      errors,
      changedHtmlAssetPaths,
      removedHtmlAssetPaths,
      removedOutputRelPaths,
      htmlAssetsByPath,
      htmlAnalysisByPath,
      buildContentFiles,
    };
  }
}
