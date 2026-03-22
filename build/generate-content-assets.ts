import fs from 'fs';
import path from 'path';
import { makeLogger } from './log';
import { isFeatureEnabled } from './features';
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
import { checkJavac } from './utils/literate-java';
import type {
  SiteVariables,
  Asset,
  ContentRenderOptions,
  ContentRenderResult,
  WatchState,
} from './types';

const log = makeLogger(__filename);

export class ContentRenderer {
  private siteVariables: SiteVariables;
  private loggedCodeDisabled: boolean;
  private sourceFileCache: Map<string, Asset[]>;
  private lastBuildFiles: Set<string>;
  private javacAvailable: boolean | undefined;

  constructor(siteVariables: SiteVariables) {
    this.siteVariables = siteVariables || {};
    this.loggedCodeDisabled = false;
    this.sourceFileCache = new Map();
    this.lastBuildFiles = new Set();
  }

  async initHighlighter(): Promise<void> {
    const langs = [
      ...new Set([
        'plaintext',
        'text',
        ...Object.values(this.siteVariables.codeLanguages || {}),
      ]),
    ];
    await initHighlighter(langs);
  }

  getDirtySourceFiles(
    buildContentFiles: string[],
    { changedContentFiles, templatesChanged }: WatchState = {},
  ): Set<string> {
    if (
      this.lastBuildFiles.size === 0 ||
      !changedContentFiles ||
      templatesChanged
    ) {
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
    const codeExtensions = this.siteVariables.codeLanguages || {};
    return Object.prototype.hasOwnProperty.call(codeExtensions, ext.slice(1));
  }

  getDirtyCopiedSourceFiles(
    buildContentFiles: string[],
    { changedContentFiles }: WatchState = {},
  ): string[] {
    if (this.lastBuildFiles.size === 0 || !changedContentFiles) {
      return buildContentFiles.filter(filePath =>
        this.isCopiedAssetSource(filePath),
      );
    }

    const buildFileSet = new Set(buildContentFiles);
    const dirtyCopiedSourceFiles: string[] = [];
    for (const filePath of changedContentFiles) {
      if (!buildFileSet.has(filePath) || !this.isCopiedAssetSource(filePath)) {
        continue;
      }
      dirtyCopiedSourceFiles.push(filePath);
    }

    return dirtyCopiedSourceFiles;
  }

  renderSourceAssets(
    filePath: string,
    contentDir: string,
    validInternalTargets: Set<string>,
    assetFiles: string[],
  ): Asset[] {
    const ext = path.extname(filePath).toLowerCase();
    const assets: Asset[] = [];

    if (isLiterateJava(filePath)) {
      assets.push(
        ...renderLiterateJavaPageAsset({
          filePath,
          contentDir,
          siteVariables: this.siteVariables,
          assetFiles,
          skipExecution: !this.javacAvailable,
        }),
      );
      return assets;
    }

    if (ext === '.html' || ext === '.md' || ext === '.markdown') {
      assets.push(
        ...renderPlainTextPageAsset({
          filePath,
          contentDir,
          siteVariables: this.siteVariables,
          validInternalTargets,
          assetFiles,
        }),
      );
      return assets;
    }

    const codeExtensions = this.siteVariables.codeLanguages || {};
    if (ext.slice(1) in codeExtensions) {
      if (isFeatureEnabled(this.siteVariables, 'code')) {
        assets.push(
          ...renderCodePageAsset({
            filePath,
            contentDir,
            siteVariables: this.siteVariables,
            assetFiles,
          }),
        );
      } else if (!this.loggedCodeDisabled) {
        log.info`Not generating source code pages due to site.features.code = false`;
        this.loggedCodeDisabled = true;
      }
    }

    return assets;
  }

  writeUncachedAssets(
    distDir: string,
    copiedSourceFiles: string[],
    contentDir: string,
  ): void {
    for (const filePath of copiedSourceFiles) {
      for (const asset of renderCopiedContentAsset({ filePath, contentDir })) {
        const outPath = path.join(distDir, asset.assetPath);
        fs.mkdirSync(path.dirname(outPath), { recursive: true });
        fs.writeFileSync(outPath, asset.content);
      }
    }
  }

  updateSourceCache(
    filePath: string,
    assets: Asset[],
    changedHtmlAssetPaths: Set<string>,
    removedHtmlAssetPaths: Set<string>,
  ): void {
    const previousAssets = this.sourceFileCache.get(filePath) || [];
    const nextAssetPaths = new Set(assets.map(asset => asset.assetPath));

    for (const asset of previousAssets) {
      if (nextAssetPaths.has(asset.assetPath)) {
        continue;
      }
      if (asset.assetPath.endsWith('.html')) {
        removedHtmlAssetPaths.add(asset.assetPath);
      }
    }

    for (const asset of assets) {
      if (asset.assetPath.endsWith('.html')) {
        changedHtmlAssetPaths.add(asset.assetPath);
      }
    }

    this.sourceFileCache.set(filePath, assets);
  }

  writeCachedAssets(distDir: string, buildContentFiles: string[]): void {
    for (const filePath of buildContentFiles) {
      const assets = this.sourceFileCache.get(filePath) || [];
      for (const asset of assets) {
        const outPath = path.join(distDir, asset.assetPath);
        fs.mkdirSync(path.dirname(outPath), { recursive: true });
        fs.writeFileSync(outPath, asset.content);
      }
    }
  }

  pruneRemovedSources(
    buildFileSet: Set<string>,
    removedHtmlAssetPaths: Set<string>,
  ): void {
    for (const filePath of [...this.lastBuildFiles]) {
      if (buildFileSet.has(filePath)) {
        continue;
      }

      const previousAssets = this.sourceFileCache.get(filePath) || [];
      for (const asset of previousAssets) {
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
      Object.keys(this.siteVariables.codeLanguages || {}),
    );
    const buildFileSet = new Set<string>(buildContentFiles);
    const dirtySourceFiles = this.getDirtySourceFiles(
      buildContentFiles,
      watchState,
    );
    const dirtyCopiedSourceFiles = this.getDirtyCopiedSourceFiles(
      buildContentFiles,
      watchState,
    );
    const changedHtmlAssetPaths = new Set<string>();
    const removedHtmlAssetPaths = new Set<string>();
    const validInternalTargets = getValidInternalTargets(
      contentDir,
      buildContentFiles,
      Object.keys(this.siteVariables.codeLanguages || {}),
    );
    const errors: Error[] = [];

    this.pruneRemovedSources(buildFileSet, removedHtmlAssetPaths);

    if (dirtySourceFiles.size > 0) {
      const noun = dirtySourceFiles.size === 1 ? 'file' : 'files';
      log.info`Processing ${dirtySourceFiles.size} content ${noun}`;
    }

    const hasLiterateJava = [...dirtySourceFiles].some(isLiterateJava);
    if (hasLiterateJava && this.javacAvailable === undefined) {
      this.javacAvailable = checkJavac();
      if (!this.javacAvailable) {
        log.warn`javac was not found; literate Java pages will not include execution output`;
      }
    }

    for (const filePath of dirtySourceFiles) {
      let assets: Asset[];
      try {
        assets = this.renderSourceAssets(
          filePath,
          contentDir,
          validInternalTargets,
          assetFiles,
        );
      } catch (err) {
        errors.push(err as Error);
        continue;
      }
      this.updateSourceCache(
        filePath,
        assets,
        changedHtmlAssetPaths,
        removedHtmlAssetPaths,
      );
    }

    this.writeCachedAssets(distDir, buildContentFiles);
    this.writeUncachedAssets(distDir, dirtyCopiedSourceFiles, contentDir);
    this.lastBuildFiles = buildFileSet;

    // Collect HTML asset content for Pagefind
    const htmlAssetsByPath = new Map<string, string>();
    for (const filePath of buildContentFiles) {
      const assets = this.sourceFileCache.get(filePath) || [];
      for (const asset of assets) {
        if (asset.assetPath.endsWith('.html')) {
          htmlAssetsByPath.set(asset.assetPath, asset.content as string);
        }
      }
    }

    return {
      errors,
      changedHtmlAssetPaths,
      removedHtmlAssetPaths,
      htmlAssetsByPath,
      buildContentFiles,
    };
  }
}
