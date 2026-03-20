import path from 'path';

export function getProcessedExtensions(codeExtensions: string[]): string[] {
  return ['md', 'markdown', 'html', ...codeExtensions];
}

export function extensionIsMarkdown(ext: string): boolean {
  return ['.md', '.markdown'].includes(ext);
}

export function isLiterateJava(filePath: string): boolean {
  return path.basename(filePath).toLowerCase().endsWith('.java.md');
}
