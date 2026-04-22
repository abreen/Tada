import fs from 'fs';
import path from 'path';
import { makeLogger } from './log';
import {
  getExtensionToShikiLanguage,
  getRuntimeBundledShikiLanguages,
} from './site-variables';
import { validateConfigLinks } from './validate-config-links';
import { json } from './templates';
import { initHighlighter } from './utils/shiki-highlighter';
import {
  getBuildContentFiles,
  getContentDir,
  getValidInternalTargets,
  renderCodePageAsset,
  renderCopiedContentAsset,
  renderLiterateJavaPageAsset,
  renderPlainTextPageAsset,
} from './util';
import { isLiterateJava } from './utils/file-types';
import { checkTraceToolAvailability, isTraceSourceFile } from './utils/trace';
import { toPosix } from './utils/paths';
import type {
  SiteVariables,
  Asset,
  ContentRenderOptions,
  ContentRenderResult,
  HtmlOutputAnalysis,
  TraceToolAvailability,
  WatchState,
} from './types';

const log = makeLogger(import.meta.url);

function cloneHtmlOutputAnalysis(
  analysis: HtmlOutputAnalysis,
): HtmlOutputAnalysis {
  return { outgoingTargets: new Set(analysis.outgoingTargets) };
}

export class ContentRenderer {
  private siteVariables: SiteVariables;
  private sourceFileCache: Map<string, Asset[]>;
  private lastBuildFiles: Set<string>;
  private javacAvailable: boolean | undefined;
  private traceToolAvailability: TraceToolAvailability | undefined;
  private traceCache: Map<
    string,
    {
      manifestUrl: string;
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

  private getCachedAssets(filePath: string): Asset[] {
    return this.sourceFileCache.get(filePath) ?? [];
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

  isCopiedAssetSource(filePath: string): boolean {
    const ext = path.extname(filePath).toLowerCase();
    const codeExtensions = getExtensionToShikiLanguage(this.siteVariables);
    return Object.prototype.hasOwnProperty.call(codeExtensions, ext.slice(1));
  }

  renderSourceAssets(
    filePath: string,
    contentDir: string,
    distDir: string,
    validInternalTargets: Set<string>,
    assetFiles: string[],
    literateJavaOutputPaths: Set<string>,
  ): Asset[] {
    const ext = path.extname(filePath).toLowerCase();
    const assets: Asset[] = [];

    if (isLiterateJava(filePath)) {
      assets.push(
        ...renderLiterateJavaPageAsset({
          filePath,
          contentDir,
          distDir,
          siteVariables: this.siteVariables,
          assetFiles,
          skipExecution: !this.javacAvailable,
          validInternalTargets,
          literateJavaOutputPaths,
        }),
      );
      return assets;
    }

    if (ext === '.html' || ext === '.md' || ext === '.markdown') {
      assets.push(
        ...renderPlainTextPageAsset({
          filePath,
          contentDir,
          distDir,
          siteVariables: this.siteVariables,
          validInternalTargets,
          assetFiles,
          literateJavaOutputPaths,
          traceCache: this.traceCache,
          traceToolAvailability: this.traceToolAvailability,
        }),
      );
      return assets;
    }

    const codeExtensions = getExtensionToShikiLanguage(this.siteVariables);
    if (ext.slice(1) in codeExtensions) {
      assets.push(
        ...renderCodePageAsset({
          filePath,
          contentDir,
          distDir,
          siteVariables: this.siteVariables,
          validInternalTargets,
          assetFiles,
          literateJavaOutputPaths,
        }),
      );
    }

    return assets;
  }

  renderCopiedSourceAssets(filePath: string, contentDir: string): Asset[] {
    if (!this.isCopiedAssetSource(filePath)) {
      return [];
    }

    return renderCopiedContentAsset({
      filePath,
      contentDir,
      siteVariables: this.siteVariables,
    });
  }

  updateSourceCache(
    filePath: string,
    assets: Asset[],
    changedOutputRelPaths: Set<string>,
    removedOutputRelPaths: Set<string>,
    changedHtmlAssetPaths: Set<string>,
    removedHtmlAssetPaths: Set<string>,
  ): void {
    const previousAssets = this.getCachedAssets(filePath);
    const nextAssetPaths = new Set(assets.map(asset => asset.assetPath));

    for (const asset of previousAssets) {
      if (nextAssetPaths.has(asset.assetPath)) {
        continue;
      }
      removedOutputRelPaths.add(asset.assetPath);
      if (asset.assetPath.endsWith('.html')) {
        removedHtmlAssetPaths.add(asset.assetPath);
      }
    }

    for (const asset of assets) {
      changedOutputRelPaths.add(asset.assetPath);
      if (asset.assetPath.endsWith('.html')) {
        changedHtmlAssetPaths.add(asset.assetPath);
      }
    }

    this.sourceFileCache.set(filePath, assets);
  }

  writeCachedAssets(distDir: string, buildContentFiles: string[]): void {
    for (const filePath of buildContentFiles) {
      const assets = this.getCachedAssets(filePath);
      for (const asset of assets) {
        const outPath = path.join(distDir, asset.assetPath);
        fs.mkdirSync(path.dirname(outPath), { recursive: true });
        fs.writeFileSync(outPath, asset.content);
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

      const previousAssets = this.getCachedAssets(filePath);
      for (const asset of previousAssets) {
        removedOutputRelPaths.add(asset.assetPath);
        if (asset.assetPath.endsWith('.html')) {
          removedHtmlAssetPaths.add(asset.assetPath);
        }
      }
      this.sourceFileCache.delete(filePath);
    }
  }

  processContent({
    distDir,
    assetFiles,
    watchState,
  }: ContentRenderOptions): ContentRenderResult {
    const contentDir: string = getContentDir();
    const buildContentFiles: string[] = getBuildContentFiles(
      contentDir,
      Object.keys(getExtensionToShikiLanguage(this.siteVariables)),
    );
    const buildFileSet = new Set<string>(buildContentFiles);
    const dirtySourceFiles = this.getDirtySourceFiles(
      buildContentFiles,
      watchState,
    );
    const changedOutputRelPaths = new Set<string>();
    const removedOutputRelPaths = new Set<string>();
    const changedHtmlAssetPaths = new Set<string>();
    const removedHtmlAssetPaths = new Set<string>();
    const validInternalTargets = getValidInternalTargets(
      contentDir,
      buildContentFiles,
      Object.keys(getExtensionToShikiLanguage(this.siteVariables)),
    );
    const literateJavaOutputPaths = new Set<string>();
    for (const filePath of buildContentFiles) {
      if (isLiterateJava(filePath)) {
        const parsed = path.parse(path.relative(contentDir, filePath));
        const javaPath = toPosix(path.join(parsed.dir, parsed.name));
        literateJavaOutputPaths.add(`/${javaPath}`);
      }
    }

    const errors: Error[] = [];

    const configLinkErrors = validateConfigLinks(
      validInternalTargets,
      json('nav.json'),
      json('authors.json'),
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
      let assets: Asset[];
      try {
        assets = [
          ...this.renderSourceAssets(
            filePath,
            contentDir,
            distDir,
            validInternalTargets,
            assetFiles,
            literateJavaOutputPaths,
          ),
          ...this.renderCopiedSourceAssets(filePath, contentDir),
        ];
      } catch (err) {
        errors.push(err as Error);
        continue;
      }
      this.updateSourceCache(
        filePath,
        assets,
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
      const assets = this.getCachedAssets(filePath);
      for (const asset of assets) {
        if (asset.assetPath.endsWith('.html')) {
          htmlAssetsByPath.set(asset.assetPath, asset.content as string);
          if (asset.htmlAnalysis) {
            htmlAnalysisByPath.set(
              asset.assetPath,
              cloneHtmlOutputAnalysis(asset.htmlAnalysis),
            );
          }
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
