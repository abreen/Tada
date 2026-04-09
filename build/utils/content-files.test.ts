import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  getContentFiles,
  getFilesByExtensions,
  shouldSkipContentFile,
  getBuildContentFiles,
  getValidInternalTargets,
} from './content-files';

describe('getContentFiles', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tada-content-test-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  test('finds markdown and html files', () => {
    fs.writeFileSync(path.join(tempDir, 'page.md'), '# Hello');
    fs.writeFileSync(path.join(tempDir, 'other.html'), '<p>hi</p>');
    fs.writeFileSync(path.join(tempDir, 'style.css'), 'body {}');

    const files = getContentFiles(tempDir, []);
    const basenames = files.map(f => path.basename(f)).sort();
    expect(basenames).toEqual(['other.html', 'page.md']);
  });

  test('includes code extension files', () => {
    fs.writeFileSync(path.join(tempDir, 'app.py'), 'print("hi")');
    fs.writeFileSync(path.join(tempDir, 'page.md'), '# Hello');

    const files = getContentFiles(tempDir, ['py']);
    const basenames = files.map(f => path.basename(f)).sort();
    expect(basenames).toEqual(['app.py', 'page.md']);
  });

  test('finds files in subdirectories', () => {
    const sub = path.join(tempDir, 'docs');
    fs.mkdirSync(sub);
    fs.writeFileSync(path.join(sub, 'guide.md'), '# Guide');

    const files = getContentFiles(tempDir, []);
    expect(files.map(f => path.basename(f))).toEqual(['guide.md']);
  });

  test('returns empty for directory with no matching files', () => {
    fs.writeFileSync(path.join(tempDir, 'data.json'), '{}');
    expect(getContentFiles(tempDir, [])).toEqual([]);
  });
});

describe('getFilesByExtensions', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tada-ext-test-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  test('filters files by extension', () => {
    fs.writeFileSync(path.join(tempDir, 'a.txt'), '');
    fs.writeFileSync(path.join(tempDir, 'b.md'), '');
    fs.writeFileSync(path.join(tempDir, 'c.txt'), '');

    const files = getFilesByExtensions(tempDir, ['txt']);
    const basenames = files.map(f => path.basename(f)).sort();
    expect(basenames).toEqual(['a.txt', 'c.txt']);
  });

  test('is case-insensitive for extensions', () => {
    fs.writeFileSync(path.join(tempDir, 'upper.TXT'), '');
    const files = getFilesByExtensions(tempDir, ['txt']);
    expect(files.map(f => path.basename(f))).toEqual(['upper.TXT']);
  });

  test('returns empty for nonexistent directory', () => {
    expect(getFilesByExtensions('/nonexistent-dir-xyz', ['txt'])).toEqual([]);
  });

  test('returns empty when no files match', () => {
    fs.writeFileSync(path.join(tempDir, 'a.md'), '');
    expect(getFilesByExtensions(tempDir, ['txt'])).toEqual([]);
  });
});

describe('shouldSkipContentFile', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tada-skip-test-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  test('returns true for markdown file with skip: true', () => {
    const filePath = path.join(tempDir, 'skipped.md');
    fs.writeFileSync(filePath, 'skip: true\n\n# Skipped');
    expect(shouldSkipContentFile(filePath)).toBe(true);
  });

  test('returns false for markdown file without skip', () => {
    const filePath = path.join(tempDir, 'normal.md');
    fs.writeFileSync(filePath, 'title: Normal\n\n# Normal');
    expect(shouldSkipContentFile(filePath)).toBe(false);
  });

  test('returns false for non-markdown/html files', () => {
    const filePath = path.join(tempDir, 'code.py');
    fs.writeFileSync(filePath, 'print("hello")');
    expect(shouldSkipContentFile(filePath)).toBe(false);
  });

  test('returns false for markdown file with skip: false', () => {
    const filePath = path.join(tempDir, 'keep.md');
    fs.writeFileSync(filePath, 'skip: false\n\n# Keep');
    expect(shouldSkipContentFile(filePath)).toBe(false);
  });

  test('returns true for html file with skip: true', () => {
    const filePath = path.join(tempDir, 'skipped.html');
    fs.writeFileSync(filePath, 'skip: true\n\n<p>Skipped</p>');
    expect(shouldSkipContentFile(filePath)).toBe(true);
  });
});

describe('getBuildContentFiles', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tada-build-test-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  test('excludes partial files (starting with _)', () => {
    fs.writeFileSync(path.join(tempDir, 'page.md'), '# Page');
    fs.writeFileSync(path.join(tempDir, '_partial.md'), '# Partial');

    const files = getBuildContentFiles(tempDir, []);
    expect(files.map(f => path.basename(f))).toEqual(['page.md']);
  });

  test('excludes files with skip: true', () => {
    fs.writeFileSync(path.join(tempDir, 'page.md'), '# Page');
    fs.writeFileSync(path.join(tempDir, 'skipped.md'), 'skip: true\n\n# Skip');

    const files = getBuildContentFiles(tempDir, []);
    expect(files.map(f => path.basename(f))).toEqual(['page.md']);
  });
});

describe('getValidInternalTargets', () => {
  let tempDir: string;
  let originalCwd: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tada-targets-test-'));
    fs.mkdirSync(path.join(tempDir, 'content'));
    fs.mkdirSync(path.join(tempDir, 'public'), { recursive: true });
    originalCwd = process.cwd();
    process.chdir(tempDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  test('includes public files as valid targets', () => {
    fs.writeFileSync(path.join(tempDir, 'public', 'test.txt'), '');

    const contentDir = path.join(tempDir, 'content');
    const targets = getValidInternalTargets(contentDir, [], [], false);

    expect(targets.has('/test.txt')).toBe(true);
  });

  test('includes public index.html by exact path only', () => {
    const coverageDir = path.join(tempDir, 'public', 'coverage');
    fs.mkdirSync(coverageDir, { recursive: true });
    fs.writeFileSync(path.join(coverageDir, 'index.html'), '');

    const contentDir = path.join(tempDir, 'content');
    const targets = getValidInternalTargets(contentDir, [], [], false);

    expect(targets.has('/coverage/index.html')).toBe(true);
    expect(targets.has('/coverage/')).toBe(false);
    expect(targets.has('/coverage')).toBe(false);
  });

  test('includes nested public files', () => {
    const subDir = path.join(tempDir, 'public', 'assets');
    fs.mkdirSync(subDir, { recursive: true });
    fs.writeFileSync(path.join(subDir, 'style.css'), '');

    const contentDir = path.join(tempDir, 'content');
    const targets = getValidInternalTargets(contentDir, [], [], false);

    expect(targets.has('/assets/style.css')).toBe(true);
  });
});
