import fs from 'fs';
import path from 'path';
import {
  getProcessedExts,
  getSourceOutputPaths,
  getSourceTargetPaths,
  isBuildContentSource,
  shouldSkipContentFile,
} from '../source-model';
import { getPublicDir, toPosix } from './paths';

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

export function getBuildContentFiles(
  contentDir: string,
  codeExtensions: string[],
): string[] {
  const processedExts = getProcessedExts(codeExtensions);

  return getContentFiles(contentDir, codeExtensions).filter(filePath =>
    isBuildContentSource(filePath, processedExts),
  );
}

export function getContentSourceOutputRelPaths(
  contentDir: string,
  filePath: string,
  codeExtensions: string[],
): Set<string> {
  const processedExts = getProcessedExts(codeExtensions);
  const buildContentFiles = new Set(
    getBuildContentFiles(contentDir, codeExtensions),
  );

  return getSourceOutputPaths({
    contentDir,
    filePath,
    processedExts,
    buildContent: buildContentFiles.has(filePath),
  });
}

export function getContentOutputRelPaths(
  contentDir: string,
  codeExtensions: string[],
): Set<string> {
  const buildContentFiles = getBuildContentFiles(contentDir, codeExtensions);
  const processedExts = getProcessedExts(codeExtensions);
  const outputs = new Set<string>();

  for (const filePath of buildContentFiles) {
    for (const outputPath of getSourceOutputPaths({
      contentDir,
      filePath,
      processedExts,
      buildContent: true,
    })) {
      outputs.add(outputPath);
    }
  }

  for (const filePath of walkFiles(contentDir)) {
    const ext = path.extname(filePath).slice(1).toLowerCase();
    if (processedExts.has(ext)) {
      continue;
    }
    outputs.add(toPosix(path.relative(contentDir, filePath)));
  }

  return outputs;
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
): Set<string> {
  const targets = new Set<string>();
  const processedExts = getProcessedExts(codeExtensions);

  for (const filePath of contentFiles) {
    for (const targetPath of getSourceTargetPaths({
      kind: 'content',
      rootDir: contentDir,
      filePath,
      processedExts,
      buildContent: true,
    })) {
      targets.add(targetPath);
    }
  }

  // Include non-processed assets in content/ that are copied directly to dist/.
  for (const filePath of walkFiles(contentDir)) {
    const ext = path.extname(filePath).slice(1).toLowerCase();
    if (processedExts.has(ext)) {
      continue;
    }
    for (const targetPath of getSourceTargetPaths({
      kind: 'content',
      rootDir: contentDir,
      filePath,
      processedExts,
      buildContent: false,
    })) {
      targets.add(targetPath);
    }
  }

  const publicDir = getPublicDir();
  for (const filePath of getPublicFiles(publicDir)) {
    for (const targetPath of getSourceTargetPaths({
      kind: 'public',
      rootDir: publicDir,
      filePath,
      processedExts,
      buildContent: true,
    })) {
      targets.add(targetPath);
    }
  }

  return targets;
}

export { shouldSkipContentFile };
