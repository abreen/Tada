import { beforeEach, describe, expect, mock, test } from 'bun:test';
import type fs from 'fs';
import path from 'path';
import { resolvePathname } from './serve';

type MockEntry = { kind: 'dir' | 'file'; mtime?: Date };

const DIST_DIR = path.resolve(path.sep, 'virtual', 'dist');
const DEFAULT_MTIME = new Date('2025-01-01T00:00:00.000Z');

function mockFs(entries: Record<string, MockEntry>): void {
  const statSync = ((filePath: fs.PathLike) => {
    const resolvedPath = path.resolve(String(filePath));
    const entry = entries[resolvedPath];
    if (!entry) {
      const error = new Error(
        `ENOENT: ${resolvedPath}`,
      ) as NodeJS.ErrnoException;
      error.code = 'ENOENT';
      throw error;
    }
    return {
      isFile: () => entry.kind === 'file',
      mtime: entry.mtime ?? DEFAULT_MTIME,
    } as fs.Stats;
  }) as typeof import('fs').statSync;

  mock.module('fs', () => ({ default: { statSync }, statSync }));
}

beforeEach(() => {
  mockFs({
    [path.join(DIST_DIR, 'index.html')]: { kind: 'file' },
    [path.join(DIST_DIR, 'sub')]: { kind: 'dir' },
    [path.join(DIST_DIR, 'sub', 'page.html')]: { kind: 'file' },
  });
});

describe('resolvePathname', () => {
  test('resolves a file at the root', () => {
    const result = resolvePathname(DIST_DIR, '/index.html');
    expect(result).not.toBeNull();
    expect(result!.filePath).toBe(path.join(DIST_DIR, 'index.html'));
    expect(result!.mtime).toBeInstanceOf(Date);
  });

  test('resolves a file in a subdirectory', () => {
    const result = resolvePathname(DIST_DIR, '/sub/page.html');
    expect(result).not.toBeNull();
    expect(result!.filePath).toBe(path.join(DIST_DIR, 'sub', 'page.html'));
  });

  test('returns null for nonexistent file', () => {
    expect(resolvePathname(DIST_DIR, '/missing.html')).toBeNull();
  });

  test('returns null for directory', () => {
    expect(resolvePathname(DIST_DIR, '/sub')).toBeNull();
  });

  test('returns null for path traversal', () => {
    expect(resolvePathname(DIST_DIR, '/../etc/passwd')).toBeNull();
  });

  test('returns null for encoded path traversal', () => {
    expect(resolvePathname(DIST_DIR, '/%2e%2e/etc/passwd')).toBeNull();
  });

  test('returns null for invalid URL encoding', () => {
    expect(resolvePathname(DIST_DIR, '/%ZZ')).toBeNull();
  });

  test('decodes percent-encoded path', () => {
    mockFs({
      [path.join(DIST_DIR, 'index.html')]: { kind: 'file' },
      [path.join(DIST_DIR, 'sub')]: { kind: 'dir' },
      [path.join(DIST_DIR, 'sub', 'page.html')]: { kind: 'file' },
      [path.join(DIST_DIR, 'spaced file.html')]: { kind: 'file' },
    });
    const result = resolvePathname(DIST_DIR, '/spaced%20file.html');
    expect(result).not.toBeNull();
    expect(result!.filePath).toBe(path.join(DIST_DIR, 'spaced file.html'));
  });
});
