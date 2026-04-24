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
