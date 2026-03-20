const path = require('path');

function getProcessedExtensions(codeExtensions) {
  return ['md', 'markdown', 'html', ...codeExtensions];
}

function extensionIsMarkdown(ext) {
  return ['.md', '.markdown'].includes(ext);
}

function isLiterateJava(filePath) {
  return path.basename(filePath).toLowerCase().endsWith('.java.md');
}

module.exports = {
  getProcessedExtensions,
  extensionIsMarkdown,
  isLiterateJava,
};
