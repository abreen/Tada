import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import fs from 'fs';
import path from 'path';
import { resolvePathname } from './serve';

let tmpDir: string;

beforeAll(() => {
  tmpDir = fs.mkdtempSync('/tmp/serve-test-');
  fs.writeFileSync(path.join(tmpDir, 'index.html'), '<h1>hello</h1>');
  fs.mkdirSync(path.join(tmpDir, 'sub'));
  fs.writeFileSync(path.join(tmpDir, 'sub', 'page.html'), '<p>page</p>');
});

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true });
});

describe('resolvePathname', () => {
  test('resolves a file at the root', () => {
    const result = resolvePathname(tmpDir, '/index.html');
    expect(result).not.toBeNull();
    expect(result!.filePath).toBe(path.join(tmpDir, 'index.html'));
    expect(result!.mtime).toBeInstanceOf(Date);
  });

  test('resolves a file in a subdirectory', () => {
    const result = resolvePathname(tmpDir, '/sub/page.html');
    expect(result).not.toBeNull();
    expect(result!.filePath).toBe(path.join(tmpDir, 'sub', 'page.html'));
  });

  test('returns null for nonexistent file', () => {
    expect(resolvePathname(tmpDir, '/missing.html')).toBeNull();
  });

  test('returns null for directory', () => {
    expect(resolvePathname(tmpDir, '/sub')).toBeNull();
  });

  test('returns null for path traversal', () => {
    expect(resolvePathname(tmpDir, '/../etc/passwd')).toBeNull();
  });

  test('returns null for encoded path traversal', () => {
    expect(resolvePathname(tmpDir, '/%2e%2e/etc/passwd')).toBeNull();
  });

  test('returns null for invalid URL encoding', () => {
    expect(resolvePathname(tmpDir, '/%ZZ')).toBeNull();
  });

  test('decodes percent-encoded path', () => {
    fs.writeFileSync(path.join(tmpDir, 'spaced file.html'), 'ok');
    const result = resolvePathname(tmpDir, '/spaced%20file.html');
    expect(result).not.toBeNull();
    expect(result!.filePath).toBe(path.join(tmpDir, 'spaced file.html'));
  });
});
