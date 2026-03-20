const {
  extensionIsMarkdown,
  getBuildContentFiles,
  getContentFiles,
  getFilesByExtensions,
  getValidInternalTargets,
  shouldSkipContentFile,
} = require('./utils/content-files');
const { createMarkdown } = require('./utils/markdown');
const {
  createApplyBasePath,
  getContentDir,
  getDistDir,
  getPackageDir,
  getProjectDir,
  getPublicDir,
  normalizeOutputPath,
} = require('./utils/paths');
const {
  injectAssetTags,
  renderCodePageAsset,
  renderCopiedContentAsset,
  renderLiterateJavaPageAsset,
  renderPlainTextPageAsset,
} = require('./utils/render');
const { parseFrontMatter } = require('./utils/front-matter');

module.exports = {
  createMarkdown,
  getContentDir,
  getDistDir,
  getPackageDir,
  getProjectDir,
  getPublicDir,
  getContentFiles,
  getFilesByExtensions,
  getBuildContentFiles,
  getValidInternalTargets,
  shouldSkipContentFile,
  extensionIsMarkdown,
  parseFrontMatter,
  createApplyBasePath,
  injectAssetTags,
  normalizeOutputPath,
  renderCodePageAsset,
  renderCopiedContentAsset,
  renderLiterateJavaPageAsset,
  renderPlainTextPageAsset,
};
