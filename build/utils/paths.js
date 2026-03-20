const path = require('path');

function getPackageDir() {
  return path.resolve(__dirname, '..', '..');
}

function getProjectDir() {
  return process.cwd();
}

function getContentDir() {
  return path.resolve(getProjectDir(), 'content');
}

function getDistDir() {
  return path.resolve(getProjectDir(), 'dist');
}

function getPublicDir() {
  return path.resolve(getProjectDir(), 'public');
}

function getFontCacheDir() {
  return path.resolve(getProjectDir(), '.font-cache');
}

function getConfigDir() {
  return getProjectDir();
}

function createApplyBasePath(siteVariables) {
  return function applyBasePath(subPath) {
    if (!subPath.startsWith('/')) {
      throw new Error('invalid internal path, must start with "/": ' + subPath);
    }

    let path = siteVariables.basePath || '/';
    if (path.endsWith('/')) {
      path = path.slice(0, -1);
    }
    return path + subPath;
  };
}

function normalizeOutputPath(outputPath) {
  const normalized = path.posix.normalize(outputPath);
  if (normalized === '.' || normalized === '') {
    return '/';
  }
  return normalized.startsWith('/') ? normalized : `/${normalized}`;
}

module.exports = {
  createApplyBasePath,
  getConfigDir,
  getContentDir,
  getDistDir,
  getFontCacheDir,
  getPackageDir,
  getProjectDir,
  getPublicDir,
  normalizeOutputPath,
};
