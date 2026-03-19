const fs = require('fs');
const path = require('path');
const {
  getContentDir,
  getContentFiles,
  getBuildContentFiles,
} = require('./util');
const { setWatchState } = require('./build-state');
const {
  compileTemplates,
  getHtmlTemplatesDir,
  getJsonDataDir,
  JSON_DATA_FILES,
} = require('./templates');
const { getProjectDir } = require('./utils/paths');
const { B } = require('./colors');
const { makeLogger } = require('./log');

const log = makeLogger(__filename);
let _needsRestart = false;

class ContentWatchPlugin {
  constructor(siteVariables) {
    this.siteVariables = siteVariables;
    this.siteConfigPath = path.resolve(getProjectDir(), 'site.dev.json');
  }

  apply(compiler) {
    let lastSig = null;

    // Abort all asset generation if templates failed to compile.
    // This intercept wraps every processAssets handler registered after it,
    // so ContentWatchPlugin must be first in the plugins array.
    compiler.hooks.thisCompilation.tap('ContentWatchPlugin', compilation => {
      compilation.hooks.processAssets.intercept({
        register: tapInfo => {
          const originalFn = tapInfo.fn;
          if (tapInfo.type === 'promise') {
            tapInfo.fn = (...args) => {
              if (compilation._templateError) {
                return Promise.resolve();
              }
              return originalFn(...args);
            };
          } else if (tapInfo.type === 'async') {
            tapInfo.fn = (...args) => {
              const callback = args[args.length - 1];
              if (compilation._templateError) {
                return callback();
              }
              return originalFn(...args);
            };
          } else {
            tapInfo.fn = (...args) => {
              if (compilation._templateError) {
                return;
              }
              return originalFn(...args);
            };
          }
          return tapInfo;
        },
      });
    });

    compiler.hooks.make.tap('ContentWatchPlugin', compilation => {
      const htmlTemplatesDir = getHtmlTemplatesDir();
      const jsonDataDir = getJsonDataDir();

      // Refresh templates cache from disk
      let templateError = null;
      try {
        compileTemplates(this.siteVariables);
      } catch (err) {
        templateError = err;
      }

      for (const fileName of fs.readdirSync(htmlTemplatesDir)) {
        compilation.fileDependencies.add(path.join(htmlTemplatesDir, fileName));
      }
      for (const dataFile of JSON_DATA_FILES) {
        const dataPath = path.join(jsonDataDir, dataFile);
        if (fs.existsSync(dataPath)) {
          compilation.fileDependencies.add(dataPath);
        }
      }

      if (templateError) {
        compilation._templateError = templateError;
        compilation.errors.push(templateError);
        return;
      }

      const contentDir = getContentDir();
      const modifiedFiles = new Set(
        [...(compiler.modifiedFiles || [])].map(filePath =>
          path.resolve(filePath),
        ),
      );
      const normalizedContentDir = path.resolve(contentDir) + path.sep;
      const normalizedHtmlDir = path.resolve(htmlTemplatesDir) + path.sep;
      const contentFiles = getContentFiles(
        contentDir,
        Object.keys(this.siteVariables.codeLanguages),
      );
      const buildContentFiles = getBuildContentFiles(
        contentDir,
        Object.keys(this.siteVariables.codeLanguages),
      );

      // Detect structural changes (files added or deleted) that require a
      // fresh compiler with updated content asset caches
      const sig = buildContentFiles.slice().sort().join('\0');
      let structureChanged = false;
      if (lastSig !== null && sig !== lastSig) {
        _needsRestart = true;
        structureChanged = true;
      }
      lastSig = sig;

      const changedContentFiles = new Set(
        [...modifiedFiles].filter(filePath =>
          filePath.startsWith(normalizedContentDir),
        ),
      );

      // Check if any HTML template or JSON data file changed
      const jsonDataPaths = JSON_DATA_FILES.map(f =>
        path.resolve(jsonDataDir, f),
      );
      const changedTemplatePaths = [...modifiedFiles].filter(
        filePath =>
          filePath === path.resolve(htmlTemplatesDir) ||
          filePath.startsWith(normalizedHtmlDir) ||
          jsonDataPaths.includes(filePath),
      );
      const templatesChanged = changedTemplatePaths.length > 0;

      for (const filePath of changedTemplatePaths) {
        log.event`${B`${path.basename(filePath)}`} changed, rebuilding all content...`;
      }

      setWatchState(compiler, {
        contentFiles,
        buildContentFiles,
        changedContentFiles,
        templatesChanged,
        structureChanged,
      });

      // Tell webpack to watch all content files
      for (const filePath of contentFiles) {
        compilation.fileDependencies.add(filePath);
      }

      // Watch content directories so webpack detects newly added files
      function addDirs(dir) {
        compilation.contextDependencies.add(dir);
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
          if (entry.isDirectory()) {
            addDirs(path.join(dir, entry.name));
          }
        }
      }
      addDirs(contentDir);

      // Watch HTML template files from the package
      for (const fileName of fs.readdirSync(htmlTemplatesDir)) {
        compilation.fileDependencies.add(path.join(htmlTemplatesDir, fileName));
      }

      // Watch JSON data files from the project config
      for (const dataFile of JSON_DATA_FILES) {
        const dataPath = path.join(jsonDataDir, dataFile);
        if (fs.existsSync(dataPath)) {
          compilation.fileDependencies.add(dataPath);
        }
      }

      // Watch the site config file and restart when it changes
      compilation.fileDependencies.add(this.siteConfigPath);
      const siteConfigChanged = modifiedFiles.has(
        path.resolve(this.siteConfigPath),
      );
      if (siteConfigChanged) {
        _needsRestart = true;
      }
    });
  }
}

ContentWatchPlugin.needsRestart = () => _needsRestart;
ContentWatchPlugin.clearRestart = () => {
  _needsRestart = false;
};

module.exports = ContentWatchPlugin;
