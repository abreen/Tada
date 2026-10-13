import path from 'path';
import { describe, expect, test } from 'bun:test';
import {
  findPackageDir,
  getPackageAssetOutputPath,
  isNpmSpecifier,
  isValidConfigAssetPath,
  parseNpmSpecifier,
  resolveConfigAssetPath,
  type PackageFileSystem,
} from './packages';

const PROJECT_DIR = path.resolve(path.sep, 'home', 'site');
const PUBLIC_DIR = path.join(PROJECT_DIR, 'public');

// A file system holding only the given files, where links map one real path
// prefix to another
function fakeFileSystem(
  files: string[],
  links: Record<string, string> = {},
): PackageFileSystem {
  const set = new Set(files);
  return {
    isFile: filePath => set.has(filePath),
    realPath: filePath => {
      for (const [from, to] of Object.entries(links)) {
        if (filePath === from || filePath.startsWith(from + path.sep)) {
          return to + filePath.slice(from.length);
        }
      }
      return filePath;
    },
  };
}

function packageFile(dir: string, name: string, ...segments: string[]) {
  return path.join(dir, 'node_modules', ...name.split('/'), ...segments);
}

describe('parseNpmSpecifier', () => {
  test.each([
    ['npm:leaflet', { name: 'leaflet', subpath: '' }],
    ['npm:chart.js', { name: 'chart.js', subpath: '' }],
    ['npm:tada-leaflet/heatmap', { name: 'tada-leaflet', subpath: 'heatmap' }],
    [
      'npm:@fontsource/literata/files/literata-latin-400-normal.woff2',
      {
        name: '@fontsource/literata',
        subpath: 'files/literata-latin-400-normal.woff2',
      },
    ],
    ['npm:@scope/pkg', { name: '@scope/pkg', subpath: '' }],
  ])('parses %s', (value, expected) => {
    expect(isNpmSpecifier(value)).toBe(true);
    expect(parseNpmSpecifier(value)).toEqual(expected);
  });

  test.each([
    'npm:',
    'npm:/leaflet',
    'npm:@scope',
    'npm:@scope/',
    'npm:Leaflet',
    'npm:.hidden',
    'npm:_private',
    'npm:pkg/',
    'npm:pkg//a.js',
    'npm:pkg/../a.js',
    'npm:pkg/./a.js',
    'npm:pkg/a\\b.js',
    'npm:pkg/a.js?x',
    'npm:pkg/a.js#x',
    'npm:pkg name',
  ])('rejects malformed %s', value => {
    expect(parseNpmSpecifier(value)).toBeNull();
  });

  test('ignores values without the prefix', () => {
    expect(isNpmSpecifier('lectures/timezone.ts')).toBe(false);
    expect(parseNpmSpecifier('lectures/timezone.ts')).toBeNull();
  });
});

describe('isValidConfigAssetPath', () => {
  test.each([
    'fonts/a.woff2',
    'npm:@fontsource/literata/files/a.woff2',
    'npm:pkg/a.woff2',
  ])('accepts %s', value => {
    expect(isValidConfigAssetPath(value)).toBe(true);
  });

  test.each(['', '/a.woff2', '../a.woff2', 'npm:pkg', 'npm:@scope/pkg'])(
    'rejects %s',
    value => {
      expect(isValidConfigAssetPath(value)).toBe(false);
    },
  );
});

describe('findPackageDir', () => {
  test('finds a package in the project', () => {
    const fs = fakeFileSystem([
      packageFile(PROJECT_DIR, '@scope/pkg', 'package.json'),
    ]);
    expect(findPackageDir('@scope/pkg', PROJECT_DIR, fs)).toBe(
      packageFile(PROJECT_DIR, '@scope/pkg'),
    );
  });

  test('walks up to an ancestor node_modules', () => {
    const parent = path.dirname(PROJECT_DIR);
    const fs = fakeFileSystem([packageFile(parent, 'pkg', 'package.json')]);
    expect(findPackageDir('pkg', PROJECT_DIR, fs)).toBe(
      packageFile(parent, 'pkg'),
    );
  });

  test('prefers the nearest package', () => {
    const parent = path.dirname(PROJECT_DIR);
    const fs = fakeFileSystem([
      packageFile(parent, 'pkg', 'package.json'),
      packageFile(PROJECT_DIR, 'pkg', 'package.json'),
    ]);
    expect(findPackageDir('pkg', PROJECT_DIR, fs)).toBe(
      packageFile(PROJECT_DIR, 'pkg'),
    );
  });

  test('returns null when no package is installed', () => {
    expect(findPackageDir('pkg', PROJECT_DIR, fakeFileSystem([]))).toBeNull();
  });
});

describe('resolveConfigAssetPath', () => {
  const options = (fs: PackageFileSystem, publicFiles: string[] = []) => ({
    publicDir: PUBLIC_DIR,
    publicFiles: new Set(publicFiles),
    projectDir: PROJECT_DIR,
    packageFs: fs,
  });

  test('resolves a public file', () => {
    const file = path.join(PUBLIC_DIR, 'fonts', 'a.woff2');
    expect(
      resolveConfigAssetPath(
        'fonts/a.woff2',
        options(fakeFileSystem([]), [file]),
      ),
    ).toEqual({ filePath: file });
  });

  test('reports a missing public file', () => {
    expect(
      resolveConfigAssetPath('fonts/a.woff2', options(fakeFileSystem([]))),
    ).toEqual({ reason: 'does not exist in public/' });
  });

  test('resolves a package file, ignoring the package exports', () => {
    const file = packageFile(PROJECT_DIR, '@f/lit', 'files', 'a.woff2');
    const fs = fakeFileSystem([
      packageFile(PROJECT_DIR, '@f/lit', 'package.json'),
      file,
    ]);
    expect(
      resolveConfigAssetPath('npm:@f/lit/files/a.woff2', options(fs)),
    ).toEqual({ filePath: file });
  });

  test('reports a package that is not installed', () => {
    expect(
      resolveConfigAssetPath('npm:@f/lit/a.woff2', options(fakeFileSystem([]))),
    ).toEqual({
      reason: 'needs package "@f/lit", which is not installed; run bun install',
    });
  });

  test('reports a file missing from the package', () => {
    const fs = fakeFileSystem([
      packageFile(PROJECT_DIR, 'pkg', 'package.json'),
    ]);
    expect(resolveConfigAssetPath('npm:pkg/a.woff2', options(fs))).toEqual({
      reason: 'does not exist in package "pkg"',
    });
  });

  test('reports a package file that links outside the package', () => {
    const outside = path.resolve(path.sep, 'elsewhere');
    const linked = packageFile(PROJECT_DIR, 'pkg', 'files');
    const fs = fakeFileSystem(
      [
        packageFile(PROJECT_DIR, 'pkg', 'package.json'),
        path.join(linked, 'a.woff2'),
      ],
      { [linked]: outside },
    );
    expect(
      resolveConfigAssetPath('npm:pkg/files/a.woff2', options(fs)),
    ).toEqual({ reason: 'is outside package "pkg"' });
  });
});

describe('getPackageAssetOutputPath', () => {
  test('publishes package files under _packages/', () => {
    expect(
      getPackageAssetOutputPath('npm:@fontsource/literata/files/a.woff2'),
    ).toBe('_packages/@fontsource/literata/files/a.woff2');
  });
});
