import { beforeAll, describe, expect, mock, test } from 'bun:test';
import path from 'path';
import { createGlobals } from '../globals.test';
import type { SiteVariables } from '../types';

const projectDir = '/virtual/project';

mock.module('../globals', () => ({
  globals: createGlobals({
    cwd() {
      return projectDir;
    },
  }),
}));

let getPackageDir: typeof import('./paths').getPackageDir;
let getProjectDir: typeof import('./paths').getProjectDir;
let getContentDir: typeof import('./paths').getContentDir;
let getDistDir: typeof import('./paths').getDistDir;
let getPublicDir: typeof import('./paths').getPublicDir;
let createApplyBasePath: typeof import('./paths').createApplyBasePath;
let normalizeOutputPath: typeof import('./paths').normalizeOutputPath;
let toUrlPath: typeof import('./paths').toUrlPath;

beforeAll(async () => {
  ({
    getPackageDir,
    getProjectDir,
    getContentDir,
    getDistDir,
    getPublicDir,
    createApplyBasePath,
    normalizeOutputPath,
    toUrlPath,
  } = await import('./paths'));
});

describe('getPackageDir', () => {
  test('returns an absolute path', () => {
    expect(path.isAbsolute(getPackageDir())).toBe(true);
  });

  test('points to repo root (contains package.json)', () => {
    expect(getPackageDir()).toBe(path.resolve(import.meta.dir, '..', '..'));
  });
});

describe('getProjectDir', () => {
  test('returns the globals cwd()', () => {
    expect(getProjectDir()).toBe(projectDir);
  });
});

describe('directory getters', () => {
  test('getContentDir ends with content', () => {
    expect(getContentDir()).toEndWith(path.sep + 'content');
  });

  test('getDistDir ends with dist', () => {
    expect(getDistDir()).toEndWith(path.sep + 'dist');
  });

  test('getPublicDir ends with public', () => {
    expect(getPublicDir()).toEndWith(path.sep + 'public');
  });
});

describe('createApplyBasePath', () => {
  function apply(basePath: string, subPath: string): string {
    const site = { base: '', basePath } as SiteVariables;
    return createApplyBasePath(site)(subPath);
  }

  test('prepends basePath to subPath', () => {
    expect(apply('/course', '/page.html')).toBe('/course/page.html');
  });

  test('handles basePath with trailing slash', () => {
    expect(apply('/course/', '/page.html')).toBe('/course/page.html');
  });

  test('handles root basePath', () => {
    expect(apply('/', '/page.html')).toBe('/page.html');
  });

  test('throws for subPath without leading slash', () => {
    expect(() => apply('/course', 'page.html')).toThrow('must start with "/"');
  });
});

describe('normalizeOutputPath', () => {
  test('adds leading slash if missing', () => {
    expect(normalizeOutputPath('page.html')).toBe('/page.html');
  });

  test('preserves leading slash', () => {
    expect(normalizeOutputPath('/page.html')).toBe('/page.html');
  });

  test('normalizes dot-segments', () => {
    expect(normalizeOutputPath('/a/../b/page.html')).toBe('/b/page.html');
  });

  test('returns / for empty or dot path', () => {
    expect(normalizeOutputPath('')).toBe('/');
    expect(normalizeOutputPath('.')).toBe('/');
  });
});

describe('toUrlPath', () => {
  test('passes plain ASCII paths through unchanged', () => {
    expect(toUrlPath('guides/intro.html')).toBe('guides/intro.html');
    expect(toUrlPath('a/b/c.md')).toBe('a/b/c.md');
  });

  test('percent-encodes spaces', () => {
    expect(toUrlPath('my notes.html')).toBe('my%20notes.html');
    expect(toUrlPath('guides/my notes.html')).toBe('guides/my%20notes.html');
  });

  test('percent-encodes ? and # in filenames', () => {
    expect(toUrlPath('faq?.md')).toBe('faq%3F.md');
    expect(toUrlPath('topic#1.md')).toBe('topic%231.md');
  });

  test('percent-encodes non-ASCII', () => {
    expect(toUrlPath('café.html')).toBe('caf%C3%A9.html');
  });

  test('preserves leading slash and segment boundaries', () => {
    expect(toUrlPath('/a b/c d.html')).toBe('/a%20b/c%20d.html');
  });

  test('preserves forward slashes as segment separators', () => {
    expect(toUrlPath('a/b/c/d.html')).toBe('a/b/c/d.html');
  });
});
