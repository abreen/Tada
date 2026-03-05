const path = require('path');

function getContentDir() {
  return path.resolve(__dirname, '..', '..', 'content');
}

function getDistDir() {
  return path.resolve(__dirname, '..', '..', 'dist');
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
  getContentDir,
  getDistDir,
  normalizeOutputPath,
};
