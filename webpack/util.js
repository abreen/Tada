const {
  extensionIsMarkdown,
  getBuildContentFiles,
  getContentFiles,
  getValidInternalTargets,
  shouldSkipContentFile,
} = require('./utils/content-files');
const { createDefinePlugin } = require('./utils/define-plugin');
const { createMarkdown } = require('./utils/markdown');
const {
  createApplyBasePath,
  getContentDir,
  getDistDir,
  normalizeOutputPath,
} = require('./utils/paths');
const {
  injectWebpackAssets,
  renderCodePageAsset,
  renderCopiedContentAsset,
  renderPlainTextPageAsset,
} = require('./utils/render');
const { parseFrontMatter } = require('./utils/front-matter');

module.exports = {
  createMarkdown,
  getContentDir,
  getDistDir,
  getContentFiles,
  getBuildContentFiles,
  getValidInternalTargets,
  shouldSkipContentFile,
  extensionIsMarkdown,
  parseFrontMatter,
  createDefinePlugin,
  createApplyBasePath,
  injectWebpackAssets,
  normalizeOutputPath,
  renderCodePageAsset,
  renderCopiedContentAsset,
  renderPlainTextPageAsset,
};
