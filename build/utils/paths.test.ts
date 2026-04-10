import { describe, expect, test } from 'bun:test';
import path from 'path';
import {
  getPackageDir,
  getProjectDir,
  getContentDir,
  getDistDir,
  getPublicDir,
  getConfigDir,
  createApplyBasePath,
  normalizeOutputPath,
  toUrlPath,
} from './paths';
import type { SiteVariables } from '../types';

describe('getPackageDir', () => {
  test('returns an absolute path', () => {
    expect(path.isAbsolute(getPackageDir())).toBe(true);
  });

  test('points to repo root (contains package.json)', () => {
    const dir = getPackageDir();
    const pkg = path.join(dir, 'package.json');
    expect(Bun.file(pkg).size).toBeGreaterThan(0);
  });
});

describe('getProjectDir', () => {
  test('returns process.cwd()', () => {
    expect(getProjectDir()).toBe(process.cwd());
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

  test('getConfigDir equals getProjectDir', () => {
    expect(getConfigDir()).toBe(getProjectDir());
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
