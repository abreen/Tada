import fs from 'fs';
import path from 'path';
import { toPosix } from './utils/paths';
import { makeLogger } from './log';
import { B } from './colors';

const log = makeLogger(import.meta.url);

interface CollectedFile {
  abs: string;
  rel: string;
}

function collectFiles(dir: string): CollectedFile[] {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true, recursive: true });
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }
    throw err;
  }
  return entries
    .filter(entry => entry.isFile())
    .map(entry => {
      const abs = path.join(entry.parentPath, entry.name);
      const rel = path.relative(dir, abs);
      return { abs, rel: toPosix(rel) };
    });
}

export function copyPublicFiles(
  publicDir: string,
  distDir: string,
): Set<string> {
  const files = collectFiles(publicDir);
  const publicRelPaths = new Set<string>();
  for (const { abs, rel } of files) {
    const dest = path.join(distDir, rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(abs, dest);
    publicRelPaths.add(rel);
    log.info`Copying public file ${B`${rel}`}`;
  }
  return publicRelPaths;
}

export function copyContentAssets(
  contentDir: string,
  distDir: string,
  processedExtensions: string[],
  publicRelPaths: Set<string>,
): Set<string> {
  const processedExtSet = new Set(processedExtensions);
  const files = collectFiles(contentDir);
  const contentAssetRelPaths = new Set<string>();
  const conflicts: string[] = [];
  for (const { abs, rel } of files) {
    const ext = path.extname(abs).slice(1).toLowerCase();
    if (processedExtSet.has(ext)) {
      continue;
    }
    contentAssetRelPaths.add(rel);
    if (publicRelPaths.has(rel)) {
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

function copySingleFile(
  sourceDir: string,
  distDir: string,
  filePath: string,
  sourceLabel: string,
  conflictLabel: string,
  conflictSet?: Set<string>,
): void {
  const rel = toPosix(path.relative(sourceDir, filePath));
  if (conflictSet?.has(rel)) {
    log.error`${sourceLabel}/${B`${rel}`} conflicts with ${conflictLabel}/${B`${rel}`}`;
    throw new Error(
      `${sourceLabel}/${rel} and ${conflictLabel}/${rel} have the same path`,
    );
  }
  const dest = path.join(distDir, rel);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(filePath, dest);
  log.info`Copying ${sourceLabel} file ${B`${rel}`}`;
}

export function deleteOutputPath(distDir: string, relPath: string): void {
  const root = path.resolve(distDir);
  const target = path.resolve(distDir, relPath);
  const relative = path.relative(root, target);
  if (
    relative.startsWith('..') ||
    path.isAbsolute(relative) ||
    relative.length === 0
  ) {
    throw new Error(`refusing to delete path outside dist/: ${relPath}`);
  }

  fs.rmSync(target, { force: true });
  log.info`Removing output ${B`${toPosix(relPath)}`}`;

  let currentDir = path.dirname(target);
  while (currentDir !== root) {
    try {
      fs.rmdirSync(currentDir);
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === 'ENOTEMPTY' || code === 'ENOENT') {
        break;
      }
      throw err;
    }
    currentDir = path.dirname(currentDir);
  }
}

export function copyPublicFile(
  publicDir: string,
  distDir: string,
  filePath: string,
  contentAssetRelPaths?: Set<string>,
): void {
  copySingleFile(
    publicDir,
    distDir,
    filePath,
    'public',
    'content',
    contentAssetRelPaths,
  );
}

export function copyContentFile(
  contentDir: string,
  distDir: string,
  filePath: string,
  publicRelPaths?: Set<string>,
): void {
  copySingleFile(
    contentDir,
    distDir,
    filePath,
    'content',
    'public',
    publicRelPaths,
  );
}
