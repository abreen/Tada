const fs = require('fs');
const path = require('path');
const { makeLogger } = require('./log');
const { B } = require('./colors');

const log = makeLogger(__filename);

function collectFiles(dir) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true, recursive: true });
  } catch {
    return [];
  }
  return entries
    .filter(entry => entry.isFile())
    .map(entry => {
      const abs = path.join(entry.parentPath, entry.name);
      const rel = path.relative(dir, abs);
      return { abs, rel: rel.split(path.sep).join(path.posix.sep) };
    });
}

function copyPublicFiles(publicDir, distDir) {
  const files = collectFiles(publicDir);
  const publicRelPaths = new Set();
  for (const { abs, rel } of files) {
    const dest = path.join(distDir, rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(abs, dest);
    publicRelPaths.add(rel);
    log.info`Copying public file ${B`${rel}`}`;
  }
  return publicRelPaths;
}

function copyContentAssets(
  contentDir,
  distDir,
  processedExtensions,
  publicRelPaths,
) {
  const processedExtSet = new Set(processedExtensions);
  const files = collectFiles(contentDir);
  const contentAssetRelPaths = new Set();
  const conflicts = [];
  for (const { abs, rel } of files) {
    const ext = path.extname(abs).slice(1).toLowerCase();
    if (processedExtSet.has(ext)) {
      continue;
    }
    contentAssetRelPaths.add(rel);
    if (publicRelPaths && publicRelPaths.has(rel)) {
      conflicts.push(rel);
    }
    const dest = path.join(distDir, rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(abs, dest);
  }
  if (conflicts.length > 0) {
    for (const rel of conflicts) {
      log.error`content/${B`${rel}`} conflicts with public/${B`${rel}`}`;
    }
    const noun = conflicts.length === 1 ? 'file' : 'files';
    throw new Error(
      `${conflicts.length} ${noun} in content/ and public/ have the same path`,
    );
  }
  return contentAssetRelPaths;
}

function copyPublicFile(publicDir, distDir, filePath, contentAssetRelPaths) {
  const rel = path
    .relative(publicDir, filePath)
    .split(path.sep)
    .join(path.posix.sep);
  if (contentAssetRelPaths && contentAssetRelPaths.has(rel)) {
    log.error`public/${B`${rel}`} conflicts with content/${B`${rel}`}`;
    throw new Error(`public/${rel} and content/${rel} have the same path`);
  }
  const dest = path.join(distDir, rel);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(filePath, dest);
  log.info`Copying public file ${B`${rel}`}`;
}

function copyContentFile(contentDir, distDir, filePath, publicRelPaths) {
  const rel = path
    .relative(contentDir, filePath)
    .split(path.sep)
    .join(path.posix.sep);
  if (publicRelPaths && publicRelPaths.has(rel)) {
    log.error`content/${B`${rel}`} conflicts with public/${B`${rel}`}`;
    throw new Error(`content/${rel} and public/${rel} have the same path`);
  }
  const dest = path.join(distDir, rel);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(filePath, dest);
  log.info`Copying content file ${B`${rel}`}`;
}

module.exports = {
  copyPublicFiles,
  copyContentAssets,
  copyPublicFile,
  copyContentFile,
};
