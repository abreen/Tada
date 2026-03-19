const path = require('path');
const { RawSource } = require('webpack').sources;
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
const { getWatchState, setBuildDelta } = require('./build-state');

const log = makeLogger(__filename);

function normalizePaths(paths) {
  return [...paths];
}

class GenerateContentAssetsPlugin {
  constructor(siteVariables) {
    this.siteVariables = siteVariables || {};
    this.loggedCodeDisabled = false;
    this.sourceFileCache = new Map();
    this.lastBuildFiles = new Set();
  }

  getBuildContentFiles(compiler) {
    const watchState = getWatchState(compiler);
    if (watchState?.buildContentFiles?.size) {
      return normalizePaths(watchState.buildContentFiles);
    }

    return getBuildContentFiles(
      getContentDir(),
      Object.keys(this.siteVariables.codeLanguages || {}),
    );
  }

  getDirtySourceFiles(compiler, buildContentFiles) {
    const watchState = getWatchState(compiler);
    const isWatch = !!compiler.watching;

    if (
      !isWatch ||
      this.lastBuildFiles.size === 0 ||
      !watchState ||
      watchState.templatesChanged
    ) {
      return new Set(buildContentFiles);
    }

    const buildFileSet = new Set(buildContentFiles);
    const dirtySourceFiles = new Set();
    for (const filePath of watchState.changedContentFiles) {
      if (buildFileSet.has(filePath)) {
        dirtySourceFiles.add(filePath);
      }
    }
    return dirtySourceFiles;
  }

  isCopiedAssetSource(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    const codeExtensions = this.siteVariables.codeLanguages || {};
    return (
      ext === '.pdf' ||
      Object.prototype.hasOwnProperty.call(codeExtensions, ext.slice(1))
    );
  }

  getDirtyCopiedSourceFiles(compiler, buildContentFiles) {
    const watchState = getWatchState(compiler);
    const isWatch = !!compiler.watching;

    if (!isWatch || this.lastBuildFiles.size === 0 || !watchState) {
      return buildContentFiles.filter(filePath =>
        this.isCopiedAssetSource(filePath),
      );
    }

    const buildFileSet = new Set(buildContentFiles);
    const dirtyCopiedSourceFiles = [];
    for (const filePath of watchState.changedContentFiles) {
      if (!buildFileSet.has(filePath) || !this.isCopiedAssetSource(filePath)) {
        continue;
      }
      dirtyCopiedSourceFiles.push(filePath);
    }

    return dirtyCopiedSourceFiles;
  }

  renderSourceAssets(filePath, contentDir, validInternalTargets, compilation) {
    const ext = path.extname(filePath).toLowerCase();
    const assets = [];

    if (isLiterateJava(filePath)) {
      if (isFeatureEnabled(this.siteVariables, 'literateJava')) {
        assets.push(
          ...renderLiterateJavaPageAsset({
            filePath,
            contentDir,
            siteVariables: this.siteVariables,
            compilation,
          }),
        );
      }
      return assets;
    }

    if (ext === '.html' || ext === '.md' || ext === '.markdown') {
      assets.push(
        ...renderPlainTextPageAsset({
          filePath,
          contentDir,
          siteVariables: this.siteVariables,
          validInternalTargets,
          compilation,
        }),
      );
      return assets;
    }

    if (ext === '.pdf') {
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
            compilation,
          }),
        );
      } else if (!this.loggedCodeDisabled) {
        log.info`Not generating source code pages due to site.features.code = false`;
        this.loggedCodeDisabled = true;
      }
    }

    return assets;
  }

  emitUncachedAssets(compilation, copiedSourceFiles, contentDir) {
    for (const filePath of copiedSourceFiles) {
      for (const asset of renderCopiedContentAsset({ filePath, contentDir })) {
        const source = new RawSource(asset.content);
        if (compilation.getAsset(asset.assetPath)) {
          compilation.updateAsset(asset.assetPath, source);
        } else {
          compilation.emitAsset(asset.assetPath, source);
        }
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

  emitCachedAssets(compilation, buildContentFiles) {
    for (const filePath of buildContentFiles) {
      const assets = this.sourceFileCache.get(filePath) || [];
      for (const asset of assets) {
        const source = new RawSource(asset.content);
        if (compilation.getAsset(asset.assetPath)) {
          compilation.updateAsset(asset.assetPath, source);
        } else {
          compilation.emitAsset(asset.assetPath, source);
        }
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

  apply(compiler) {
    const pluginName = 'GenerateContentAssetsPlugin';

    compiler.hooks.beforeCompile.tapPromise(pluginName, async () => {
      const langs = [
        ...new Set([
          'plaintext',
          'text',
          ...Object.values(this.siteVariables.codeLanguages || {}),
        ]),
      ];
      await initHighlighter(langs);
    });

    compiler.hooks.thisCompilation.tap(pluginName, compilation => {
      compilation.hooks.processAssets.tap(
        {
          name: pluginName,
          stage: compiler.webpack.Compilation.PROCESS_ASSETS_STAGE_ADDITIONAL,
        },
        () => {
          const contentDir = getContentDir();
          const buildContentFiles = this.getBuildContentFiles(compiler);
          const buildFileSet = new Set(buildContentFiles);
          const dirtySourceFiles = this.getDirtySourceFiles(
            compiler,
            buildContentFiles,
          );
          const dirtyCopiedSourceFiles = this.getDirtyCopiedSourceFiles(
            compiler,
            buildContentFiles,
          );
          const changedHtmlAssetPaths = new Set();
          const removedHtmlAssetPaths = new Set();
          const validInternalTargets = getValidInternalTargets(
            contentDir,
            buildContentFiles,
            Object.keys(this.siteVariables.codeLanguages || {}),
          );
          const watchState = getWatchState(compiler);

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
                compilation,
              );
            } catch (err) {
              compilation.errors.push(err);
              continue;
            }
            this.updateSourceCache(
              filePath,
              assets,
              changedHtmlAssetPaths,
              removedHtmlAssetPaths,
            );
          }

          this.emitCachedAssets(compilation, buildContentFiles);
          this.emitUncachedAssets(
            compilation,
            dirtyCopiedSourceFiles,
            contentDir,
          );
          this.lastBuildFiles = buildFileSet;

          setBuildDelta(compiler, {
            changedSourceFiles: dirtySourceFiles,
            changedHtmlAssetPaths,
            removedHtmlAssetPaths,
            templatesChanged: Boolean(watchState?.templatesChanged),
          });
        },
      );
    });
  }
}

module.exports = GenerateContentAssetsPlugin;
