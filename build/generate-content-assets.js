const fs = require('fs');
const path = require('path');
const { makeLogger } = require('./log');
const { isFeatureEnabled } = require('./features');
const { initHighlighter } = require('./utils/shiki-highlighter');
const {
  getBuildContentFiles,
  getContentDir,
  getValidInternalTargets,
  renderCodePageAsset,
  renderCopiedContentAsset,
  renderLiterateJavaPageAsset,
  renderPlainTextPageAsset,
} = require('./util');
const { isLiterateJava } = require('./utils/file-types');

const log = makeLogger(__filename);

class ContentRenderer {
  constructor(siteVariables) {
    this.siteVariables = siteVariables || {};
    this.loggedCodeDisabled = false;
    this.sourceFileCache = new Map();
    this.lastBuildFiles = new Set();
  }

  async initHighlighter() {
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
    buildContentFiles,
    { changedContentFiles, templatesChanged } = {},
  ) {
    if (
      this.lastBuildFiles.size === 0 ||
      !changedContentFiles ||
      templatesChanged
    ) {
      return new Set(buildContentFiles);
    }

    const buildFileSet = new Set(buildContentFiles);
    const dirtySourceFiles = new Set();
    for (const filePath of changedContentFiles) {
      if (buildFileSet.has(filePath)) {
        dirtySourceFiles.add(filePath);
      }
    }
    return dirtySourceFiles;
  }

  isCopiedAssetSource(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    const codeExtensions = this.siteVariables.codeLanguages || {};
    return Object.prototype.hasOwnProperty.call(codeExtensions, ext.slice(1));
  }

  getDirtyCopiedSourceFiles(buildContentFiles, { changedContentFiles } = {}) {
    if (this.lastBuildFiles.size === 0 || !changedContentFiles) {
      return buildContentFiles.filter(filePath =>
        this.isCopiedAssetSource(filePath),
      );
    }

    const buildFileSet = new Set(buildContentFiles);
    const dirtyCopiedSourceFiles = [];
    for (const filePath of changedContentFiles) {
      if (!buildFileSet.has(filePath) || !this.isCopiedAssetSource(filePath)) {
        continue;
      }
      dirtyCopiedSourceFiles.push(filePath);
    }

    return dirtyCopiedSourceFiles;
  }

  renderSourceAssets(filePath, contentDir, validInternalTargets, assetFiles) {
    const ext = path.extname(filePath).toLowerCase();
    const assets = [];

    if (isLiterateJava(filePath)) {
      assets.push(
        ...renderLiterateJavaPageAsset({
          filePath,
          contentDir,
          siteVariables: this.siteVariables,
          assetFiles,
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

  writeUncachedAssets(distDir, copiedSourceFiles, contentDir) {
    for (const filePath of copiedSourceFiles) {
      for (const asset of renderCopiedContentAsset({ filePath, contentDir })) {
        const outPath = path.join(distDir, asset.assetPath);
        fs.mkdirSync(path.dirname(outPath), { recursive: true });
        fs.writeFileSync(outPath, asset.content);
      }
    }
  }

  updateSourceCache(
    filePath,
    assets,
    changedHtmlAssetPaths,
    removedHtmlAssetPaths,
  ) {
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

  writeCachedAssets(distDir, buildContentFiles) {
    for (const filePath of buildContentFiles) {
      const assets = this.sourceFileCache.get(filePath) || [];
      for (const asset of assets) {
        const outPath = path.join(distDir, asset.assetPath);
        fs.mkdirSync(path.dirname(outPath), { recursive: true });
        fs.writeFileSync(outPath, asset.content);
      }
    }
  }

  pruneRemovedSources(buildFileSet, removedHtmlAssetPaths) {
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

  processContent({ distDir, assetFiles, watchState } = {}) {
    const contentDir = getContentDir();
    const buildContentFiles = getBuildContentFiles(
      contentDir,
      Object.keys(this.siteVariables.codeLanguages || {}),
    );
    const buildFileSet = new Set(buildContentFiles);
    const dirtySourceFiles = this.getDirtySourceFiles(
      buildContentFiles,
      watchState,
    );
    const dirtyCopiedSourceFiles = this.getDirtyCopiedSourceFiles(
      buildContentFiles,
      watchState,
    );
    const changedHtmlAssetPaths = new Set();
    const removedHtmlAssetPaths = new Set();
    const validInternalTargets = getValidInternalTargets(
      contentDir,
      buildContentFiles,
      Object.keys(this.siteVariables.codeLanguages || {}),
    );
    const errors = [];

    this.pruneRemovedSources(buildFileSet, removedHtmlAssetPaths);

    if (dirtySourceFiles.size > 0) {
      const noun = dirtySourceFiles.size === 1 ? 'file' : 'files';
      log.info`Processing ${dirtySourceFiles.size} content ${noun}`;
    }

    for (const filePath of dirtySourceFiles) {
      let assets;
      try {
        assets = this.renderSourceAssets(
          filePath,
          contentDir,
          validInternalTargets,
          assetFiles,
        );
      } catch (err) {
        errors.push(err);
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
    const htmlAssetsByPath = new Map();
    for (const filePath of buildContentFiles) {
      const assets = this.sourceFileCache.get(filePath) || [];
      for (const asset of assets) {
        if (asset.assetPath.endsWith('.html')) {
          htmlAssetsByPath.set(asset.assetPath, asset.content);
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

module.exports = { ContentRenderer };
