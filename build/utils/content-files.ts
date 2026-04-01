import fs from 'fs';
import path from 'path';
import { parseFrontMatterAndContent } from './front-matter';
import {
  getProcessedExtensions,
  extensionIsMarkdown,
  isLiterateJava,
  isPartial,
} from './file-types';
import { getPublicDir, normalizeOutputPath } from './paths';

function walkFiles(dir: string): string[] {
  return fs.readdirSync(dir).flatMap(file => {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      return walkFiles(fullPath);
    }
    return [fullPath];
  });
}

export function getContentFiles(
  contentDir: string,
  codeExtensions: string[],
): string[] {
  const extensions = ['md', 'html', ...codeExtensions];
  const pattern = new RegExp(`\\.(${extensions.join('|')})$`);

  return walkFiles(contentDir).filter(filePath => {
    return pattern.test(path.basename(filePath));
  });
}

export function shouldSkipContentFile(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  if (!(extensionIsMarkdown(ext) || ext === '.html')) {
    return false;
  }

  const raw = fs.readFileSync(filePath, 'utf-8');
  const { pageVariables } = parseFrontMatterAndContent(raw, ext);
  return pageVariables?.skip === true;
}

export function getBuildContentFiles(
  contentDir: string,
  codeExtensions: string[],
): string[] {
  return getContentFiles(contentDir, codeExtensions).filter(
    filePath => !isPartial(filePath) && !shouldSkipContentFile(filePath),
  );
}

function addGeneratedRouteAliases(
  pathSet: Set<string>,
  outputPath: string,
): void {
  const normalizedPath = normalizeOutputPath(outputPath);
  pathSet.add(normalizedPath);

  if (!normalizedPath.endsWith('/index.html')) {
    return;
  }

  const base = normalizedPath.slice(0, -'index.html'.length);
  pathSet.add(base);
  if (base.endsWith('/') && base.length > 1) {
    pathSet.add(base.slice(0, -1));
  }
}

function getPublicFiles(publicDir: string): string[] {
  if (!fs.existsSync(publicDir)) {
    return [];
  }

  return walkFiles(publicDir);
}

export function getFilesByExtensions(
  rootDir: string,
  extensions: string[],
): string[] {
  if (!fs.existsSync(rootDir)) {
    return [];
  }

  const extensionSet = new Set(extensions.map(ext => ext.toLowerCase()));

  return walkFiles(rootDir).filter(filePath => {
    const ext = path.extname(filePath).slice(1).toLowerCase();
    return extensionSet.has(ext);
  });
}

export function getValidInternalTargets(
  contentDir: string,
  contentFiles: string[],
  codeExtensions: string[],
  codeEnabled: boolean,
): Set<string> {
  const targets = new Set<string>();
  const codeExtensionSet = new Set(
    codeExtensions.map(ext => ext.toLowerCase()),
  );

  for (const filePath of contentFiles) {
    if (isPartial(filePath)) {
      continue;
    }
    const relPath = path.relative(contentDir, filePath);
    const parsed = path.parse(relPath);
    const ext = parsed.ext.toLowerCase();
    const subPath = path
      .join(parsed.dir, parsed.name)
      .split(path.sep)
      .join(path.posix.sep);

    if (isLiterateJava(filePath)) {
      // parsed.name is e.g. "VowelCounter.java"; the output page is
      // VowelCounter.java.html and the source file is VowelCounter.java
      const javaSubPath = path
        .join(parsed.dir, parsed.name)
        .split(path.sep)
        .join(path.posix.sep);
      addGeneratedRouteAliases(targets, `/${javaSubPath}.html`);
      targets.add(normalizeOutputPath(`/${javaSubPath}`));
    } else if (extensionIsMarkdown(ext) || ext === '.html') {
      addGeneratedRouteAliases(targets, `/${subPath}.html`);
    } else if (codeExtensionSet.has(ext.slice(1))) {
      if (codeEnabled) {
        addGeneratedRouteAliases(targets, `/${relPath}.html`);
      }
      targets.add(normalizeOutputPath(`/${relPath}`));
    }
  }

  // Include non-processed assets in content/ that are copied directly to dist/.
  const processedExtSet = new Set(getProcessedExtensions(codeExtensions));
  for (const filePath of walkFiles(contentDir)) {
    const ext = path.extname(filePath).slice(1).toLowerCase();
    if (processedExtSet.has(ext)) {
      continue;
    }
    const relPath = path.relative(contentDir, filePath);
    targets.add(normalizeOutputPath(`/${relPath}`));
  }

  const publicDir = getPublicDir();
  for (const filePath of getPublicFiles(publicDir)) {
    const relPath = path.relative(publicDir, filePath);
    targets.add(normalizeOutputPath(`/${relPath}`));
  }

  return targets;
}
