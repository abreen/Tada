const path = require('path');

const PUBLIC_ASSET_EXTENSIONS = [
  'png',
  'jpg',
  'jpeg',
  'gif',
  'svg',
  'txt',
  'zip',
  'pdf',
];

function extensionIsMarkdown(ext) {
  return ['.md', '.markdown'].includes(ext);
}

function isLiterateJava(filePath) {
  return path.basename(filePath).toLowerCase().endsWith('.java.md');
}

module.exports = {
  PUBLIC_ASSET_EXTENSIONS,
  extensionIsMarkdown,
  isLiterateJava,
};
