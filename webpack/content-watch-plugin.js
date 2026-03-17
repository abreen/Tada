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

let _needsRestart = false;

class ContentWatchPlugin {
  constructor(siteVariables) {
    this.siteVariables = siteVariables;
  }

  apply(compiler) {
    let lastSig = null;

    compiler.hooks.make.tap('ContentWatchPlugin', compilation => {
      const htmlTemplatesDir = getHtmlTemplatesDir();
      const jsonDataDir = getJsonDataDir();

      // Refresh templates cache from disk
      try {
        compileTemplates(this.siteVariables);
      } catch (err) {
        compilation.errors.push(err);
        for (const fileName of fs.readdirSync(htmlTemplatesDir)) {
          compilation.fileDependencies.add(
            path.join(htmlTemplatesDir, fileName),
          );
        }
        for (const dataFile of JSON_DATA_FILES) {
          const dataPath = path.join(jsonDataDir, dataFile);
          if (fs.existsSync(dataPath)) {
            compilation.fileDependencies.add(dataPath);
          }
        }
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
      const templatesChanged = [...modifiedFiles].some(
        filePath =>
          filePath === path.resolve(htmlTemplatesDir) ||
          filePath.startsWith(normalizedHtmlDir) ||
          jsonDataPaths.includes(filePath),
      );

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
    });
  }
}

ContentWatchPlugin.needsRestart = () => _needsRestart;
ContentWatchPlugin.clearRestart = () => {
  _needsRestart = false;
};

module.exports = ContentWatchPlugin;
