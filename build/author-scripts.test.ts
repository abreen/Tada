import { describe, expect, test } from 'bun:test';
import {
  collectScriptEntries,
  getPageAuthorAssets,
  getPageScripts,
  getScriptPathError,
  validateSiteScripts,
  type AuthorScripts,
} from './author-scripts';

describe('getScriptPathError', () => {
  test('accepts src-relative .ts and .js paths', () => {
    expect(getScriptPathError('timezone.ts')).toBeNull();
    expect(getScriptPathError('lectures/timezone.js')).toBeNull();
  });

  for (const value of [
    '',
    '/lectures/timezone.ts',
    'C:/timezone.ts',
    'lectures\\timezone.ts',
    '../timezone.ts',
    'lectures/../timezone.ts',
    './timezone.ts',
    'lectures//timezone.ts',
    'timezone.scss',
    'timezone',
  ]) {
    test(`rejects ${JSON.stringify(value)}`, () => {
      expect(getScriptPathError(value)).toBe(
        'must be a src-relative POSIX path ending in .ts or .js',
      );
    });
  }

  test('rejects values that are not strings', () => {
    expect(getScriptPathError(3)).toBe('must be a string');
  });

  test('accepts npm: paths with or without a path in the package', () => {
    expect(getScriptPathError('npm:chart.js')).toBeNull();
    expect(getScriptPathError('npm:tada-leaflet/heatmap')).toBeNull();
    expect(getScriptPathError('npm:@scope/pkg')).toBeNull();
  });

  test('rejects malformed npm: paths', () => {
    expect(getScriptPathError('npm:')).toBe(
      'must name an npm package, such as npm:name or npm:@scope/name/path',
    );
    expect(getScriptPathError('npm:pkg/../x')).toBe(
      'must name an npm package, such as npm:name or npm:@scope/name/path',
    );
  });

  test('reserves the _npm~ prefix for packages', () => {
    expect(getScriptPathError('_npm~x.ts')).toBe(
      'must not start with _npm~, which Tada uses for packages',
    );
    expect(getScriptPathError('_npm/x.ts')).toBeNull();
    expect(getScriptPathError('lib/_npm~x.ts')).toBeNull();
  });
});

describe('getPageScripts', () => {
  test('lists site-wide scripts first, then the page scripts, once each', () => {
    expect(
      getPageScripts(['site.ts', 'shared.ts'], ['page.ts', 'shared.ts'], 'p'),
    ).toEqual(['site.ts', 'shared.ts', 'page.ts']);
  });

  test('allows a page without scripts', () => {
    expect(getPageScripts(['site.ts'], undefined, 'p')).toEqual(['site.ts']);
    expect(getPageScripts(undefined, undefined, 'p')).toEqual([]);
  });

  test('treats an empty scripts field as no scripts', () => {
    // YAML reads `scripts:` with nothing after it as null
    expect(getPageScripts(['site.ts'], null, 'p')).toEqual(['site.ts']);
  });

  test('rejects a value that is not a list', () => {
    expect(() => getPageScripts([], 'page.ts', 'content/a.md')).toThrow(
      'content/a.md: front matter "scripts" must be a list of paths',
    );
  });

  test('rejects an invalid item and names it', () => {
    expect(() =>
      getPageScripts([], ['ok.ts', '../bad.ts'], 'content/a.md'),
    ).toThrow(
      'content/a.md: scripts[1] "../bad.ts" must be a src-relative POSIX path ending in .ts or .js',
    );
  });
});

describe('collectScriptEntries', () => {
  test('keeps valid paths in first-seen order, without repeats', () => {
    expect(
      collectScriptEntries(
        ['site.ts'],
        [['b.ts', 'site.ts'], undefined, 'not a list', ['a.ts', '/bad.ts', 4]],
      ),
    ).toEqual(['site.ts', 'b.ts', 'a.ts']);
  });
});

describe('getPageAuthorAssets', () => {
  const authorScripts: AuthorScripts = {
    requested: [],
    outputs: new Map(),
    entries: new Map([
      ['site.ts', { js: '_scripts/site.js', css: ['_scripts/site.css'] }],
      ['page.ts', { js: '_scripts/page.js', css: [] }],
    ]),
  };

  test('returns output paths in script order', () => {
    expect(
      getPageAuthorAssets(authorScripts, ['site.ts', 'page.ts'], 'p'),
    ).toEqual({
      js: ['_scripts/site.js', '_scripts/page.js'],
      css: ['_scripts/site.css'],
    });
  });

  test('reports a script that was not built', () => {
    expect(() =>
      getPageAuthorAssets(authorScripts, ['missing.ts'], 'content/a.md'),
    ).toThrow('content/a.md: script "missing.ts" not found in src/');
  });

  test('reports why a script was not built', () => {
    expect(() =>
      getPageAuthorAssets(
        { ...authorScripts, missing: new Map([['npm:pkg', 'is gone']]) },
        ['npm:pkg'],
        'content/a.md',
      ),
    ).toThrow('content/a.md: script "npm:pkg" is gone');
  });
});

describe('validateSiteScripts', () => {
  const findProblem = (script: string) =>
    script === 'site.ts' || script === 'npm:pkg' ? null : 'is missing';

  test('accepts scripts that can be found', () => {
    expect(validateSiteScripts(['site.ts', 'npm:pkg'], findProblem)).toEqual(
      [],
    );
    expect(validateSiteScripts(undefined, findProblem)).toEqual([]);
  });

  test('reports malformed and missing scripts', () => {
    expect(
      validateSiteScripts(
        ['/site.ts', 'gone.ts', 'npm:Bad', 'npm:gone'],
        findProblem,
      ),
    ).toEqual([
      'scripts[0] "/site.ts" must be a src-relative POSIX path ending in .ts or .js',
      'scripts[1] "gone.ts" is missing',
      'scripts[2] "npm:Bad" must name an npm package, such as npm:name or npm:@scope/name/path',
      'scripts[3] "npm:gone" is missing',
    ]);
  });
});
