const fs = require('fs');
const path = require('path');
const {
  getContentDir,
  getContentFiles,
  getBuildContentFiles,
} = require('./util');
const { setWatchState } = require('./build-state');
const { compileTemplates, getTemplatesDir } = require('./templates');

let _needsRestart = false;

class ContentWatchPlugin {
  constructor(siteVariables) {
    this.siteVariables = siteVariables;
  }

  apply(compiler) {
    let lastSig = null;

    compiler.hooks.make.tap('ContentWatchPlugin', compilation => {
      // Refresh templates cache from disk
      try {
        compileTemplates(this.siteVariables);
      } catch (err) {
        compilation.errors.push(err);
        const templatesDir = getTemplatesDir();
        for (const fileName of fs.readdirSync(templatesDir)) {
          compilation.fileDependencies.add(path.join(templatesDir, fileName));
        }
        return;
      }

      const contentDir = getContentDir();
      const templatesDir = getTemplatesDir();
      const modifiedFiles = new Set(
        [...(compiler.modifiedFiles || [])].map(filePath =>
          path.resolve(filePath),
        ),
      );
      const normalizedContentDir = path.resolve(contentDir) + path.sep;
      const normalizedTemplatesDir = path.resolve(templatesDir) + path.sep;
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
      const templatesChanged = [...modifiedFiles].some(
        filePath =>
          filePath === path.resolve(templatesDir) ||
          filePath.startsWith(normalizedTemplatesDir),
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

      // Tell webpack to watch all template files
      for (const fileName of fs.readdirSync(templatesDir)) {
        compilation.fileDependencies.add(path.join(templatesDir, fileName));
      }
    });
  }
}

ContentWatchPlugin.needsRestart = () => _needsRestart;
ContentWatchPlugin.clearRestart = () => {
  _needsRestart = false;
};

module.exports = ContentWatchPlugin;
