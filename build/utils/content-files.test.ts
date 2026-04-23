import { beforeAll, beforeEach, describe, expect, mock, test } from 'bun:test';
import path from 'path';
import { createGlobals } from '../globals.test';
import { createFsModuleMock } from '../test-helpers';

const projectRoot = '/virtual/site';
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

function readDir(dirPath: string): string[] {
  const resolvedDir = resolvePath(dirPath);
  if (!directories.has(resolvedDir)) {
    throw new Error(
      `ENOENT: no such file or directory, scandir '${resolvedDir}'`,
    );
  }

  const entries = new Set<string>();
  for (const child of directories) {
    if (path.dirname(child) === resolvedDir && child !== resolvedDir) {
      entries.add(path.basename(child));
    }
  }
  for (const child of files.keys()) {
    if (path.dirname(child) === resolvedDir) {
      entries.add(path.basename(child));
    }
  }
  return [...entries].sort();
}

const fsMock = {
  existsSync(filePath: string) {
    const resolved = resolvePath(filePath);
    return directories.has(resolved) || files.has(resolved);
  },
  readFileSync(filePath: string) {
    const resolved = resolvePath(filePath);
    const content = files.get(resolved);
    if (content === undefined) {
      throw new Error(`ENOENT: no such file or directory, open '${resolved}'`);
    }
    return content;
  },
  readdirSync(dirPath: string) {
    return readDir(dirPath);
  },
  statSync(filePath: string) {
    const resolved = resolvePath(filePath);
    if (directories.has(resolved)) {
      return { isDirectory: () => true, isFile: () => false };
    }
    if (files.has(resolved)) {
      return { isDirectory: () => false, isFile: () => true };
    }
    throw new Error(`ENOENT: no such file or directory, stat '${resolved}'`);
  },
};

mock.module('fs', () => createFsModuleMock(fsMock));

mock.module('../globals', () => ({
  globals: createGlobals({
    cwd() {
      return projectRoot;
    },
  }),
}));

let getContentFiles: typeof import('./content-files').getContentFiles;
let getFilesByExtensions: typeof import('./content-files').getFilesByExtensions;
let shouldSkipContentFile: typeof import('./content-files').shouldSkipContentFile;
let getBuildContentFiles: typeof import('./content-files').getBuildContentFiles;
let getValidInternalTargets: typeof import('./content-files').getValidInternalTargets;

beforeAll(async () => {
  ({
    getContentFiles,
    getFilesByExtensions,
    shouldSkipContentFile,
    getBuildContentFiles,
    getValidInternalTargets,
  } = await import('./content-files'));
});

beforeEach(() => {
  files.clear();
  directories.clear();
  ensureDirectory(projectRoot);
  ensureDirectory(path.join(projectRoot, 'content'));
  ensureDirectory(path.join(projectRoot, 'public'));
});

describe('getContentFiles', () => {
  test('finds markdown and html files', () => {
    const contentDir = path.join(projectRoot, 'content');
    writeFile(path.join(contentDir, 'page.md'), '# Hello');
    writeFile(path.join(contentDir, 'other.html'), '<p>hi</p>');
    writeFile(path.join(contentDir, 'style.css'), 'body {}');

    const files = getContentFiles(contentDir, []);
    const basenames = files.map(f => path.basename(f)).sort();
    expect(basenames).toEqual(['other.html', 'page.md']);
  });

  test('includes code extension files', () => {
    const contentDir = path.join(projectRoot, 'content');
    writeFile(path.join(contentDir, 'app.py'), 'print("hi")');
    writeFile(path.join(contentDir, 'page.md'), '# Hello');

    const files = getContentFiles(contentDir, ['py']);
    const basenames = files.map(f => path.basename(f)).sort();
    expect(basenames).toEqual(['app.py', 'page.md']);
  });

  test('finds files in subdirectories', () => {
    const contentDir = path.join(projectRoot, 'content');
    writeFile(path.join(contentDir, 'docs', 'guide.md'), '# Guide');

    const files = getContentFiles(contentDir, []);
    expect(files.map(f => path.basename(f))).toEqual(['guide.md']);
  });

  test('returns empty for directory with no matching files', () => {
    const contentDir = path.join(projectRoot, 'content');
    writeFile(path.join(contentDir, 'data.json'), '{}');
    expect(getContentFiles(contentDir, [])).toEqual([]);
  });
});

describe('getFilesByExtensions', () => {
  test('filters files by extension', () => {
    const contentDir = path.join(projectRoot, 'content');
    writeFile(path.join(contentDir, 'a.txt'), '');
    writeFile(path.join(contentDir, 'b.md'), '');
    writeFile(path.join(contentDir, 'c.txt'), '');

    const files = getFilesByExtensions(contentDir, ['txt']);
    const basenames = files.map(f => path.basename(f)).sort();
    expect(basenames).toEqual(['a.txt', 'c.txt']);
  });

  test('is case-insensitive for extensions', () => {
    const contentDir = path.join(projectRoot, 'content');
    writeFile(path.join(contentDir, 'upper.TXT'), '');
    const files = getFilesByExtensions(contentDir, ['txt']);
    expect(files.map(f => path.basename(f))).toEqual(['upper.TXT']);
  });

  test('returns empty for nonexistent directory', () => {
    expect(getFilesByExtensions('/nonexistent-dir-xyz', ['txt'])).toEqual([]);
  });

  test('returns empty when no files match', () => {
    const contentDir = path.join(projectRoot, 'content');
    writeFile(path.join(contentDir, 'a.md'), '');
    expect(getFilesByExtensions(contentDir, ['txt'])).toEqual([]);
  });
});

describe('shouldSkipContentFile', () => {
  test('returns true for markdown file with skip: true', () => {
    const filePath = path.join(projectRoot, 'content', 'skipped.md');
    writeFile(filePath, 'skip: true\n\n# Skipped');
    expect(shouldSkipContentFile(filePath)).toBe(true);
  });

  test('returns false for markdown file without skip', () => {
    const filePath = path.join(projectRoot, 'content', 'normal.md');
    writeFile(filePath, 'title: Normal\n\n# Normal');
    expect(shouldSkipContentFile(filePath)).toBe(false);
  });

  test('returns false for non-markdown/html files', () => {
    const filePath = path.join(projectRoot, 'content', 'code.py');
    writeFile(filePath, 'print("hello")');
    expect(shouldSkipContentFile(filePath)).toBe(false);
  });

  test('returns false for markdown file with skip: false', () => {
    const filePath = path.join(projectRoot, 'content', 'keep.md');
    writeFile(filePath, 'skip: false\n\n# Keep');
    expect(shouldSkipContentFile(filePath)).toBe(false);
  });

  test('returns true for html file with skip: true', () => {
    const filePath = path.join(projectRoot, 'content', 'skipped.html');
    writeFile(filePath, 'skip: true\n\n<p>Skipped</p>');
    expect(shouldSkipContentFile(filePath)).toBe(true);
  });
});

describe('getBuildContentFiles', () => {
  test('excludes partial files (starting with _)', () => {
    const contentDir = path.join(projectRoot, 'content');
    writeFile(path.join(contentDir, 'page.md'), '# Page');
    writeFile(path.join(contentDir, '_partial.md'), '# Partial');

    const files = getBuildContentFiles(contentDir, []);
    expect(files.map(f => path.basename(f))).toEqual(['page.md']);
  });

  test('excludes files with skip: true', () => {
    const contentDir = path.join(projectRoot, 'content');
    writeFile(path.join(contentDir, 'page.md'), '# Page');
    writeFile(path.join(contentDir, 'skipped.md'), 'skip: true\n\n# Skip');

    const files = getBuildContentFiles(contentDir, []);
    expect(files.map(f => path.basename(f))).toEqual(['page.md']);
  });
});

describe('getValidInternalTargets', () => {
  test('includes public files as valid targets', () => {
    const contentDir = path.join(projectRoot, 'content');
    writeFile(path.join(projectRoot, 'public', 'test.txt'), '');

    const targets = getValidInternalTargets(contentDir, [], []);

    expect(targets.has('/test.txt')).toBe(true);
  });

  test('includes public index.html by exact path only', () => {
    const contentDir = path.join(projectRoot, 'content');
    writeFile(path.join(projectRoot, 'public', 'coverage', 'index.html'), '');

    const targets = getValidInternalTargets(contentDir, [], []);

    expect(targets.has('/coverage/index.html')).toBe(true);
    expect(targets.has('/coverage/')).toBe(false);
    expect(targets.has('/coverage')).toBe(false);
  });

  test('includes nested public files', () => {
    const contentDir = path.join(projectRoot, 'content');
    writeFile(path.join(projectRoot, 'public', 'assets', 'style.css'), '');

    const targets = getValidInternalTargets(contentDir, [], []);

    expect(targets.has('/assets/style.css')).toBe(true);
  });
});
