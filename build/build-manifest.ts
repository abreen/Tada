import fs from 'fs';
import path from 'path';

const EXCLUDED_DIRS = new Set(['pagefind']);

export interface BuildManifest {
  version: 1;
  buildTime: string;
  files: Record<string, string>;
}

export interface ManifestDiff {
  added: string[];
  changed: string[];
  removed: string[];
}

export function diffManifests(
  prev: BuildManifest,
  current: BuildManifest,
): ManifestDiff {
  const prevFiles = prev.files;
  const currentFiles = current.files;

  const added: string[] = [];
  const changed: string[] = [];
  const removed: string[] = [];

  for (const key of Object.keys(currentFiles)) {
    if (!(key in prevFiles)) {
      added.push(key);
    } else if (prevFiles[key] !== currentFiles[key]) {
      changed.push(key);
    }
  }

  for (const key of Object.keys(prevFiles)) {
    if (!(key in currentFiles)) {
      removed.push(key);
    }
  }

  return {
    added: added.sort(),
    changed: changed.sort(),
    removed: removed.sort(),
  };
}

export async function hashFile(filePath: string): Promise<string> {
  const buffer = await Bun.file(filePath).arrayBuffer();
  const hasher = new Bun.CryptoHasher('sha256');
  hasher.update(buffer);
  return hasher.digest('hex');
}

export async function walkAndHash(
  dir: string,
): Promise<Record<string, string>> {
  const entries = fs.readdirSync(dir, { withFileTypes: true, recursive: true });
  const result: Record<string, string> = {};

  for (const entry of entries) {
    if (!entry.isFile()) {
      continue;
    }

    const abs = path.join(entry.parentPath, entry.name);
    const rel = path.relative(dir, abs).split(path.sep).join(path.posix.sep);

    const topLevel = rel.split('/')[0];
    if (EXCLUDED_DIRS.has(topLevel)) {
      continue;
    }

    result[rel] = await hashFile(abs);
  }

  return result;
}

export function getVersions(prodBaseDir: string): number[] {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(prodBaseDir, { withFileTypes: true });
  } catch {
    return [];
  }

  const versions: number[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }
    const match = entry.name.match(/^v(\d+)$/);
    if (match) {
      versions.push(parseInt(match[1], 10));
    }
  }

  return versions.sort((a, b) => a - b);
}

export function getNextVersion(prodBaseDir: string): number {
  const versions = getVersions(prodBaseDir);
  if (versions.length === 0) {
    return 1;
  }
  return Math.max(...versions) + 1;
}

export async function generateBuildManifest(
  distDir: string,
  manifestPath: string,
): Promise<void> {
  const files = await walkAndHash(distDir);
  const manifest: BuildManifest = {
    version: 1,
    buildTime: new Date().toISOString(),
    files,
  };
  fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
}

export function loadManifest(filePath: string): BuildManifest | null {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(content) as BuildManifest;
  } catch {
    return null;
  }
}

export function pruneOldVersions(prodBaseDir: string): number[] {
  const versions = getVersions(prodBaseDir);
  if (versions.length <= 2) {
    return [];
  }

  const toRemove = versions.slice(0, versions.length - 2);
  for (const v of toRemove) {
    const vDir = path.join(prodBaseDir, `v${v}`);
    fs.rmSync(vDir, { recursive: true, force: true });

    const manifestFile = path.join(prodBaseDir, `v${v}.manifest.json`);
    fs.rmSync(manifestFile, { force: true });
  }

  return toRemove;
}

export function copyChangedFiles(
  diff: ManifestDiff,
  distDir: string,
  outDir: string,
): void {
  const filesToCopy = [...diff.added, ...diff.changed];
  for (const rel of filesToCopy) {
    const src = path.join(distDir, rel);
    const dest = path.join(outDir, rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
  }
}
