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

module.exports = { PUBLIC_ASSET_EXTENSIONS, extensionIsMarkdown };
