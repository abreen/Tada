import path from 'path';

export function getProcessedExtensions(codeExtensions: string[]): string[] {
  return ['md', 'markdown', 'mdx', 'html', ...codeExtensions];
}

export function extensionIsMarkdown(ext: string): boolean {
  return ['.md', '.markdown'].includes(ext);
}

export function extensionIsMdx(ext: string): boolean {
  return ext === '.mdx';
}

export function extensionIsMdxContent(ext: string): boolean {
  return extensionIsMarkdown(ext) || extensionIsMdx(ext);
}

export function extensionIsPlainTextPage(ext: string): boolean {
  return extensionIsMarkdown(ext) || extensionIsMdx(ext) || ext === '.html';
}

export function isPartial(filePath: string): boolean {
  return path.basename(filePath).startsWith('_');
}

export function isLiterateJava(filePath: string): boolean {
  return path.basename(filePath).toLowerCase().endsWith('.java.md');
}
