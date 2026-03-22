import { describe, expect, test, beforeEach, afterEach } from 'bun:test';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  diffManifests,
  hashFile,
  walkAndHash,
  getVersions,
  getNextVersion,
  generateBuildManifest,
  loadManifest,
  pruneOldVersions,
  copyChangedFiles,
} from './build-manifest';
import type { BuildManifest, ManifestDiff } from './build-manifest';

function makeManifest(files: Record<string, string>): BuildManifest {
  return { version: 1, buildTime: '2025-01-01T00:00:00.000Z', files };
}

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tada-test-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true });
});

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
    const file = path.join(tmpDir, 'test.txt');
    fs.writeFileSync(file, 'hello world');
    const hash1 = await hashFile(file);
    const hash2 = await hashFile(file);
    expect(hash1).toBe(hash2);
  });

  test('returns a 64-character hex string', async () => {
    const file = path.join(tmpDir, 'test.txt');
    fs.writeFileSync(file, 'content');
    const hash = await hashFile(file);
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[0-9a-f]+$/);
  });

  test('different content produces different hashes', async () => {
    const file1 = path.join(tmpDir, 'a.txt');
    const file2 = path.join(tmpDir, 'b.txt');
    fs.writeFileSync(file1, 'content one');
    fs.writeFileSync(file2, 'content two');
    const hash1 = await hashFile(file1);
    const hash2 = await hashFile(file2);
    expect(hash1).not.toBe(hash2);
  });
});

describe('walkAndHash', () => {
  test('returns a file map with relative paths and hashes', async () => {
    fs.writeFileSync(path.join(tmpDir, 'index.html'), '<html></html>');
    fs.writeFileSync(path.join(tmpDir, 'style.css'), 'body {}');
    const result = await walkAndHash(tmpDir);
    expect(Object.keys(result).sort()).toEqual(['index.html', 'style.css']);
    for (const hash of Object.values(result)) {
      expect(hash).toHaveLength(64);
    }
  });

  test('excludes pagefind/ top-level directory', async () => {
    fs.writeFileSync(path.join(tmpDir, 'index.html'), '<html></html>');
    const pagefindDir = path.join(tmpDir, 'pagefind');
    fs.mkdirSync(pagefindDir);
    fs.writeFileSync(path.join(pagefindDir, 'pagefind.js'), 'code');
    const result = await walkAndHash(tmpDir);
    expect(Object.keys(result)).toEqual(['index.html']);
    expect('pagefind/pagefind.js' in result).toBe(false);
  });

  test('returns empty object for empty directory', async () => {
    const result = await walkAndHash(tmpDir);
    expect(result).toEqual({});
  });

  test('uses forward slashes in keys', async () => {
    const subDir = path.join(tmpDir, 'sub', 'nested');
    fs.mkdirSync(subDir, { recursive: true });
    fs.writeFileSync(path.join(subDir, 'file.html'), 'content');
    const result = await walkAndHash(tmpDir);
    const keys = Object.keys(result);
    expect(keys).toEqual(['sub/nested/file.html']);
    for (const key of keys) {
      expect(key).not.toContain('\\');
    }
  });
});

describe('getVersions', () => {
  test('returns sorted version numbers', () => {
    fs.mkdirSync(path.join(tmpDir, 'v3'));
    fs.mkdirSync(path.join(tmpDir, 'v1'));
    fs.mkdirSync(path.join(tmpDir, 'v2'));
    expect(getVersions(tmpDir)).toEqual([1, 2, 3]);
  });

  test('ignores non-version entries', () => {
    fs.mkdirSync(path.join(tmpDir, 'v1'));
    fs.mkdirSync(path.join(tmpDir, 'other'));
    fs.mkdirSync(path.join(tmpDir, 'v2x'));
    fs.writeFileSync(path.join(tmpDir, 'v3.manifest.json'), '{}');
    expect(getVersions(tmpDir)).toEqual([1]);
  });

  test('returns empty array for nonexistent directory', () => {
    expect(getVersions(path.join(tmpDir, 'nonexistent'))).toEqual([]);
  });

  test('returns empty array for empty directory', () => {
    expect(getVersions(tmpDir)).toEqual([]);
  });
});

describe('getNextVersion', () => {
  test('returns 1 for nonexistent directory', () => {
    expect(getNextVersion(path.join(tmpDir, 'nonexistent'))).toBe(1);
  });

  test('returns 1 for empty directory', () => {
    expect(getNextVersion(tmpDir)).toBe(1);
  });

  test('returns highest version + 1', () => {
    fs.mkdirSync(path.join(tmpDir, 'v1'));
    fs.mkdirSync(path.join(tmpDir, 'v3'));
    expect(getNextVersion(tmpDir)).toBe(4);
  });
});

describe('generateBuildManifest', () => {
  test('writes valid JSON with version, buildTime, and files', async () => {
    const distDir = path.join(tmpDir, 'dist');
    fs.mkdirSync(distDir);
    fs.writeFileSync(path.join(distDir, 'index.html'), '<html></html>');

    const manifestPath = path.join(tmpDir, 'manifest.json');
    await generateBuildManifest(distDir, manifestPath);

    const raw = fs.readFileSync(manifestPath, 'utf8');
    const manifest = JSON.parse(raw) as BuildManifest;

    expect(manifest.version).toBe(1);
    expect(typeof manifest.buildTime).toBe('string');
    expect(manifest.buildTime).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(typeof manifest.files).toBe('object');
    expect('index.html' in manifest.files).toBe(true);
  });
});

describe('loadManifest', () => {
  test('loads and parses a manifest from a file', () => {
    const manifest = makeManifest({ 'index.html': 'abc123' });
    const filePath = path.join(tmpDir, 'manifest.json');
    fs.writeFileSync(filePath, JSON.stringify(manifest, null, 2) + '\n');

    const loaded = loadManifest(filePath);
    expect(loaded).toEqual(manifest);
  });

  test('returns null for a nonexistent file', () => {
    const result = loadManifest(path.join(tmpDir, 'missing.json'));
    expect(result).toBeNull();
  });
});

describe('pruneOldVersions', () => {
  function setupVersions(versions: number[]) {
    for (const v of versions) {
      fs.mkdirSync(path.join(tmpDir, `v${v}`));
      fs.writeFileSync(
        path.join(tmpDir, `v${v}.manifest.json`),
        JSON.stringify(makeManifest({})),
      );
    }
  }

  test('removes all but the latest 2 version directories', () => {
    setupVersions([1, 2, 3]);
    pruneOldVersions(tmpDir);
    expect(fs.existsSync(path.join(tmpDir, 'v1'))).toBe(false);
    expect(fs.existsSync(path.join(tmpDir, 'v2'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, 'v3'))).toBe(true);
  });

  test('also removes manifest files for pruned versions', () => {
    setupVersions([1, 2, 3]);
    pruneOldVersions(tmpDir);
    expect(fs.existsSync(path.join(tmpDir, 'v1.manifest.json'))).toBe(false);
    expect(fs.existsSync(path.join(tmpDir, 'v2.manifest.json'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, 'v3.manifest.json'))).toBe(true);
  });

  test('keeps all versions when there are 2 or fewer', () => {
    setupVersions([1, 2]);
    pruneOldVersions(tmpDir);
    expect(fs.existsSync(path.join(tmpDir, 'v1'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, 'v2'))).toBe(true);
  });

  test('is a no-op for a nonexistent directory', () => {
    expect(() =>
      pruneOldVersions(path.join(tmpDir, 'nonexistent')),
    ).not.toThrow();
  });
});

describe('copyChangedFiles', () => {
  test('copies added and changed files', () => {
    const distDir = path.join(tmpDir, 'dist');
    const outDir = path.join(tmpDir, 'out');
    fs.mkdirSync(distDir);
    fs.mkdirSync(outDir);

    fs.writeFileSync(path.join(distDir, 'added.html'), 'new file');
    fs.writeFileSync(path.join(distDir, 'changed.css'), 'updated styles');

    const diff: ManifestDiff = {
      added: ['added.html'],
      changed: ['changed.css'],
      removed: ['old.html'],
    };

    copyChangedFiles(diff, distDir, outDir);

    expect(fs.existsSync(path.join(outDir, 'added.html'))).toBe(true);
    expect(fs.existsSync(path.join(outDir, 'changed.css'))).toBe(true);
  });

  test('does not copy removed files', () => {
    const distDir = path.join(tmpDir, 'dist');
    const outDir = path.join(tmpDir, 'out');
    fs.mkdirSync(distDir);
    fs.mkdirSync(outDir);

    const diff: ManifestDiff = {
      added: [],
      changed: [],
      removed: ['removed.html'],
    };

    copyChangedFiles(diff, distDir, outDir);

    expect(fs.existsSync(path.join(outDir, 'removed.html'))).toBe(false);
  });

  test('creates nested directories as needed', () => {
    const distDir = path.join(tmpDir, 'dist');
    const outDir = path.join(tmpDir, 'out');
    fs.mkdirSync(distDir);
    fs.mkdirSync(outDir);

    const nested = path.join(distDir, 'deep', 'nested');
    fs.mkdirSync(nested, { recursive: true });
    fs.writeFileSync(path.join(nested, 'page.html'), 'content');

    const diff: ManifestDiff = {
      added: ['deep/nested/page.html'],
      changed: [],
      removed: [],
    };

    copyChangedFiles(diff, distDir, outDir);

    expect(
      fs.existsSync(path.join(outDir, 'deep', 'nested', 'page.html')),
    ).toBe(true);
  });
});
