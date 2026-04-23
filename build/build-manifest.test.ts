import { createHash } from 'node:crypto';
import { beforeAll, beforeEach, describe, expect, mock, test } from 'bun:test';
import path from 'path';
import { createGlobals } from './globals.test';

type BuildManifest = import('./build-manifest').BuildManifest;
type ManifestDiff = import('./build-manifest').ManifestDiff;

const rootDir = '/virtual/manifest';
const files = new Map<string, string>();
const directories = new Set<string>();

function resolvePath(filePath: string): string {
  return path.resolve(filePath);
}

function ensureDirectory(dirPath: string): void {
  let current = resolvePath(dirPath);
  while (!directories.has(current)) {
    directories.add(current);
    const parent = path.dirname(current);
    if (parent === current) {
      break;
    }
    current = parent;
  }
}

function writeFile(filePath: string, content: string): void {
  const resolved = resolvePath(filePath);
  ensureDirectory(path.dirname(resolved));
  files.set(resolved, content);
}

function readFile(filePath: string): string {
  const resolved = resolvePath(filePath);
  const content = files.get(resolved);
  if (content === undefined) {
    throw new Error(`ENOENT: no such file or directory, open '${resolved}'`);
  }
  return content;
}

function removePath(targetPath: string): void {
  const resolved = resolvePath(targetPath);
  files.delete(resolved);
  for (const filePath of [...files.keys()]) {
    if (filePath.startsWith(`${resolved}${path.sep}`)) {
      files.delete(filePath);
    }
  }
  for (const dirPath of [...directories]) {
    if (dirPath === resolved || dirPath.startsWith(`${resolved}${path.sep}`)) {
      directories.delete(dirPath);
    }
  }
}

function getChildren(
  dirPath: string,
): Array<{ name: string; fullPath: string; isDirectory: boolean }> {
  const resolvedDir = resolvePath(dirPath);
  if (!directories.has(resolvedDir)) {
    throw new Error(
      `ENOENT: no such file or directory, scandir '${resolvedDir}'`,
    );
  }

  const children = new Map<
    string,
    { fullPath: string; isDirectory: boolean }
  >();
  for (const child of directories) {
    if (path.dirname(child) === resolvedDir && child !== resolvedDir) {
      children.set(path.basename(child), {
        fullPath: child,
        isDirectory: true,
      });
    }
  }
  for (const child of files.keys()) {
    if (path.dirname(child) === resolvedDir) {
      children.set(path.basename(child), {
        fullPath: child,
        isDirectory: false,
      });
    }
  }

  return [...children.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, info]) => ({
      name,
      fullPath: info.fullPath,
      isDirectory: info.isDirectory,
    }));
}

function createDirent(
  parentPath: string,
  entry: { name: string; fullPath: string; isDirectory: boolean },
) {
  return {
    name: entry.name,
    parentPath,
    isDirectory: () => entry.isDirectory,
    isFile: () => !entry.isDirectory,
  };
}

const fsMock = {
  copyFileSync(sourcePath: string, targetPath: string) {
    writeFile(targetPath, readFile(sourcePath));
  },
  existsSync(filePath: string) {
    const resolved = resolvePath(filePath);
    return directories.has(resolved) || files.has(resolved);
  },
  mkdirSync(dirPath: string) {
    ensureDirectory(dirPath);
  },
  readFileSync(filePath: string) {
    return readFile(filePath);
  },
  readdirSync(
    dirPath: string,
    options?: { withFileTypes?: boolean; recursive?: boolean },
  ) {
    const resolvedDir = resolvePath(dirPath);
    const children = getChildren(resolvedDir);

    if (!options?.withFileTypes) {
      return children.map(entry => entry.name);
    }

    if (!options.recursive) {
      return children.map(entry => createDirent(resolvedDir, entry));
    }

    const result: Array<ReturnType<typeof createDirent>> = [];
    const walk = (currentDir: string) => {
      for (const entry of getChildren(currentDir)) {
        result.push(createDirent(currentDir, entry));
        if (entry.isDirectory) {
          walk(entry.fullPath);
        }
      }
    };
    walk(resolvedDir);
    return result;
  },
  rmSync(targetPath: string, options?: { force?: boolean }) {
    const resolved = resolvePath(targetPath);
    if (!files.has(resolved) && !directories.has(resolved)) {
      if (options?.force) {
        return;
      }
      throw new Error(`ENOENT: no such file or directory, rm '${resolved}'`);
    }
    removePath(resolved);
  },
  writeFileSync(filePath: string, content: string) {
    writeFile(filePath, content);
  },
};

mock.module('fs', () => ({ default: fsMock, ...fsMock }));

mock.module('./globals', () => ({
  globals: createGlobals({
    createSha256Hasher() {
      const hash = createHash('sha256');
      return {
        update(buffer: ArrayBuffer) {
          hash.update(new Uint8Array(buffer));
        },
        digest(encoding: 'hex') {
          return hash.digest(encoding);
        },
      };
    },
    now() {
      return Date.UTC(2025, 0, 1, 0, 0, 0, 0);
    },
    readFileArrayBuffer(filePath: string) {
      return Promise.resolve(
        new TextEncoder().encode(readFile(filePath)).buffer,
      );
    },
    toISOString(timestampMs: number) {
      return new Date(timestampMs).toISOString();
    },
  }),
}));

let diffManifests: typeof import('./build-manifest').diffManifests;
let hashFile: typeof import('./build-manifest').hashFile;
let walkAndHash: typeof import('./build-manifest').walkAndHash;
let getVersions: typeof import('./build-manifest').getVersions;
let getNextVersion: typeof import('./build-manifest').getNextVersion;
let generateBuildManifest: typeof import('./build-manifest').generateBuildManifest;
let loadManifest: typeof import('./build-manifest').loadManifest;
let pruneOldVersions: typeof import('./build-manifest').pruneOldVersions;
let copyChangedFiles: typeof import('./build-manifest').copyChangedFiles;

beforeAll(async () => {
  ({
    diffManifests,
    hashFile,
    walkAndHash,
    getVersions,
    getNextVersion,
    generateBuildManifest,
    loadManifest,
    pruneOldVersions,
    copyChangedFiles,
  } = await import('./build-manifest'));
});

beforeEach(() => {
  files.clear();
  directories.clear();
  ensureDirectory(rootDir);
});

function makeManifest(
  files: Record<string, string>,
  build: number = 1,
): BuildManifest {
  return { schema: 1, build, buildTime: '2025-01-01T00:00:00.000Z', files };
}

describe('diffManifests', () => {
  test('detects added files', () => {
    const prev = makeManifest({ 'a.html': 'hash1' });
    const current = makeManifest({ 'a.html': 'hash1', 'b.html': 'hash2' });
    const diff = diffManifests(prev, current);
    expect(diff.added).toEqual(['b.html']);
    expect(diff.changed).toEqual([]);
    expect(diff.removed).toEqual([]);
  });

  test('detects changed files', () => {
    const prev = makeManifest({ 'a.html': 'hash1' });
    const current = makeManifest({ 'a.html': 'hash2' });
    const diff = diffManifests(prev, current);
    expect(diff.added).toEqual([]);
    expect(diff.changed).toEqual(['a.html']);
    expect(diff.removed).toEqual([]);
  });

  test('detects removed files', () => {
    const prev = makeManifest({ 'a.html': 'hash1', 'b.html': 'hash2' });
    const current = makeManifest({ 'a.html': 'hash1' });
    const diff = diffManifests(prev, current);
    expect(diff.added).toEqual([]);
    expect(diff.changed).toEqual([]);
    expect(diff.removed).toEqual(['b.html']);
  });

  test('detects added, changed, and removed all at once', () => {
    const prev = makeManifest({
      'unchanged.html': 'same',
      'changed.html': 'old',
      'removed.html': 'gone',
    });
    const current = makeManifest({
      'unchanged.html': 'same',
      'changed.html': 'new',
      'added.html': 'fresh',
    });
    const diff = diffManifests(prev, current);
    expect(diff.added).toEqual(['added.html']);
    expect(diff.changed).toEqual(['changed.html']);
    expect(diff.removed).toEqual(['removed.html']);
  });

  test('returns empty arrays for identical manifests', () => {
    const manifest = makeManifest({ 'a.html': 'hash1', 'b.css': 'hash2' });
    const diff = diffManifests(manifest, manifest);
    expect(diff.added).toEqual([]);
    expect(diff.changed).toEqual([]);
    expect(diff.removed).toEqual([]);
  });

  test('returns results in alphabetical order', () => {
    const prev = makeManifest({
      'z.html': 'old',
      'removed-b.html': 'r',
      'removed-a.html': 'r',
    });
    const current = makeManifest({
      'z.html': 'new',
      'c-added.html': 'c',
      'a-added.html': 'a',
    });
    const diff = diffManifests(prev, current);
    expect(diff.added).toEqual(['a-added.html', 'c-added.html']);
    expect(diff.changed).toEqual(['z.html']);
    expect(diff.removed).toEqual(['removed-a.html', 'removed-b.html']);
  });
});

describe('hashFile', () => {
  test('produces consistent hashes for the same content', async () => {
    const file = path.join(rootDir, 'test.txt');
    writeFile(file, 'hello world');
    const hash1 = await hashFile(file);
    const hash2 = await hashFile(file);
    expect(hash1).toBe(hash2);
  });

  test('returns a 64-character hex string', async () => {
    const file = path.join(rootDir, 'test.txt');
    writeFile(file, 'content');
    const hash = await hashFile(file);
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[0-9a-f]+$/);
  });

  test('different content produces different hashes', async () => {
    const file1 = path.join(rootDir, 'a.txt');
    const file2 = path.join(rootDir, 'b.txt');
    writeFile(file1, 'content one');
    writeFile(file2, 'content two');
    const hash1 = await hashFile(file1);
    const hash2 = await hashFile(file2);
    expect(hash1).not.toBe(hash2);
  });
});

describe('walkAndHash', () => {
  test('returns a file map with relative paths and hashes', async () => {
    writeFile(path.join(rootDir, 'index.html'), '<html></html>');
    writeFile(path.join(rootDir, 'style.css'), 'body {}');
    const result = await walkAndHash(rootDir);
    expect(Object.keys(result).sort()).toEqual(['index.html', 'style.css']);
    for (const hash of Object.values(result)) {
      expect(hash).toHaveLength(64);
    }
  });

  test('excludes pagefind/ top-level directory', async () => {
    writeFile(path.join(rootDir, 'index.html'), '<html></html>');
    writeFile(path.join(rootDir, 'pagefind', 'pagefind.js'), 'code');
    const result = await walkAndHash(rootDir);
    expect(Object.keys(result)).toEqual(['index.html']);
    expect('pagefind/pagefind.js' in result).toBe(false);
  });

  test('excludes tada.manifest.json', async () => {
    writeFile(path.join(rootDir, 'index.html'), '<html></html>');
    writeFile(path.join(rootDir, 'tada.manifest.json'), '{"schema":1}');
    const result = await walkAndHash(rootDir);
    expect(Object.keys(result)).toEqual(['index.html']);
    expect('tada.manifest.json' in result).toBe(false);
  });

  test('returns empty object for empty directory', async () => {
    const result = await walkAndHash(rootDir);
    expect(result).toEqual({});
  });

  test('uses forward slashes in keys', async () => {
    writeFile(path.join(rootDir, 'sub', 'nested', 'file.html'), 'content');
    const result = await walkAndHash(rootDir);
    const keys = Object.keys(result);
    expect(keys).toEqual(['sub/nested/file.html']);
    for (const key of keys) {
      expect(key).not.toContain('\\');
    }
  });
});

describe('getVersions', () => {
  test('returns sorted version numbers', () => {
    ensureDirectory(path.join(rootDir, 'v3'));
    ensureDirectory(path.join(rootDir, 'v1'));
    ensureDirectory(path.join(rootDir, 'v2'));
    expect(getVersions(rootDir)).toEqual([1, 2, 3]);
  });

  test('ignores non-version entries', () => {
    ensureDirectory(path.join(rootDir, 'v1'));
    ensureDirectory(path.join(rootDir, 'other'));
    ensureDirectory(path.join(rootDir, 'v2x'));
    writeFile(path.join(rootDir, 'some-file.json'), '{}');
    expect(getVersions(rootDir)).toEqual([1]);
  });

  test('returns empty array for nonexistent directory', () => {
    expect(getVersions(path.join(rootDir, 'nonexistent'))).toEqual([]);
  });

  test('returns empty array for empty directory', () => {
    expect(getVersions(rootDir)).toEqual([]);
  });
});

describe('getNextVersion', () => {
  test('returns 1 for nonexistent directory', () => {
    expect(getNextVersion(path.join(rootDir, 'nonexistent'))).toBe(1);
  });

  test('returns 1 for empty directory', () => {
    expect(getNextVersion(rootDir)).toBe(1);
  });

  test('returns highest version + 1', () => {
    ensureDirectory(path.join(rootDir, 'v1'));
    ensureDirectory(path.join(rootDir, 'v3'));
    expect(getNextVersion(rootDir)).toBe(4);
  });
});

describe('generateBuildManifest', () => {
  test('writes valid JSON with schema, build, buildTime, and files', async () => {
    const distDir = path.join(rootDir, 'dist');
    writeFile(path.join(distDir, 'index.html'), '<html></html>');

    const manifestPath = path.join(distDir, 'tada.manifest.json');
    await generateBuildManifest(distDir, manifestPath, 3);

    const manifest = JSON.parse(readFile(manifestPath)) as BuildManifest;

    expect(manifest.schema).toBe(1);
    expect(manifest.build).toBe(3);
    expect(manifest.buildTime).toBe('2025-01-01T00:00:00.000Z');
    expect(typeof manifest.files).toBe('object');
    expect('index.html' in manifest.files).toBe(true);
    expect('tada.manifest.json' in manifest.files).toBe(false);
  });
});

describe('loadManifest', () => {
  test('loads and parses a manifest from a file', () => {
    const manifest = makeManifest({ 'index.html': 'abc123' });
    const filePath = path.join(rootDir, 'tada.manifest.json');
    writeFile(filePath, JSON.stringify(manifest, null, 2) + '\n');

    const loaded = loadManifest(filePath);
    expect(loaded).toEqual(manifest);
  });

  test('returns null for a nonexistent file', () => {
    const result = loadManifest(path.join(rootDir, 'missing.json'));
    expect(result).toBeNull();
  });
});

describe('pruneOldVersions', () => {
  function setupVersions(versions: number[]) {
    for (const v of versions) {
      const vDir = path.join(rootDir, `v${v}`);
      ensureDirectory(vDir);
      writeFile(
        path.join(vDir, 'tada.manifest.json'),
        JSON.stringify(makeManifest({}, v)),
      );
    }
  }

  test('removes all but the latest 2 version directories', () => {
    setupVersions([1, 2, 3]);
    pruneOldVersions(rootDir);
    expect(fsMock.existsSync(path.join(rootDir, 'v1'))).toBe(false);
    expect(fsMock.existsSync(path.join(rootDir, 'v2'))).toBe(true);
    expect(fsMock.existsSync(path.join(rootDir, 'v3'))).toBe(true);
  });

  test('removes manifests inside pruned version directories', () => {
    setupVersions([1, 2, 3]);
    pruneOldVersions(rootDir);
    expect(
      fsMock.existsSync(path.join(rootDir, 'v1', 'tada.manifest.json')),
    ).toBe(false);
    expect(
      fsMock.existsSync(path.join(rootDir, 'v2', 'tada.manifest.json')),
    ).toBe(true);
    expect(
      fsMock.existsSync(path.join(rootDir, 'v3', 'tada.manifest.json')),
    ).toBe(true);
  });

  test('keeps all versions when there are 2 or fewer', () => {
    setupVersions([1, 2]);
    pruneOldVersions(rootDir);
    expect(fsMock.existsSync(path.join(rootDir, 'v1'))).toBe(true);
    expect(fsMock.existsSync(path.join(rootDir, 'v2'))).toBe(true);
  });

  test('is a no-op for a nonexistent directory', () => {
    expect(() =>
      pruneOldVersions(path.join(rootDir, 'nonexistent')),
    ).not.toThrow();
  });
});

describe('copyChangedFiles', () => {
  test('copies added and changed files', () => {
    const distDir = path.join(rootDir, 'dist');
    const outDir = path.join(rootDir, 'out');

    writeFile(path.join(distDir, 'added.html'), 'new file');
    writeFile(path.join(distDir, 'changed.css'), 'updated styles');

    const diff: ManifestDiff = {
      added: ['added.html'],
      changed: ['changed.css'],
      removed: ['old.html'],
    };

    copyChangedFiles(diff, distDir, outDir);

    expect(fsMock.existsSync(path.join(outDir, 'added.html'))).toBe(true);
    expect(fsMock.existsSync(path.join(outDir, 'changed.css'))).toBe(true);
  });

  test('does not copy removed files', () => {
    const distDir = path.join(rootDir, 'dist');
    const outDir = path.join(rootDir, 'out');
    ensureDirectory(distDir);
    ensureDirectory(outDir);

    const diff: ManifestDiff = {
      added: [],
      changed: [],
      removed: ['removed.html'],
    };

    copyChangedFiles(diff, distDir, outDir);

    expect(fsMock.existsSync(path.join(outDir, 'removed.html'))).toBe(false);
  });

  test('creates nested directories as needed', () => {
    const distDir = path.join(rootDir, 'dist');
    const outDir = path.join(rootDir, 'out');

    writeFile(path.join(distDir, 'deep', 'nested', 'page.html'), 'content');

    const diff: ManifestDiff = {
      added: ['deep/nested/page.html'],
      changed: [],
      removed: [],
    };

    copyChangedFiles(diff, distDir, outDir);

    expect(
      fsMock.existsSync(path.join(outDir, 'deep', 'nested', 'page.html')),
    ).toBe(true);
  });
});
