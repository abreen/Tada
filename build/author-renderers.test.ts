import { describe, expect, test } from 'bun:test';
import { addRenderers, getPackageRendererPath } from './author-renderers';
import { createEmptyAuthorScripts } from './author-scripts';

describe('getPackageRendererPath', () => {
  const manifest = {
    name: 'tada-map',
    tada: { render: { '.': './render.js', './heatmap': './heat/render.ts' } },
  };

  test('finds the renderer of the main module and of a subpath', () => {
    expect(getPackageRendererPath(manifest, '', 'tada-map')).toBe('render.js');
    expect(getPackageRendererPath(manifest, 'heatmap', 'tada-map')).toBe(
      'heat/render.ts',
    );
  });

  test('is null when the package names no renderer for the module', () => {
    expect(getPackageRendererPath(manifest, 'other', 'tada-map')).toBeNull();
    expect(getPackageRendererPath({}, '', 'tada-map')).toBeNull();
    expect(getPackageRendererPath({ tada: {} }, '', 'tada-map')).toBeNull();
  });

  test('rejects a malformed field', () => {
    for (const render of ['./render.js', ['./render.js'], null]) {
      expect(() =>
        getPackageRendererPath({ tada: { render } }, '', 'tada-map'),
      ).toThrow(
        'package "tada-map": "tada.render" in package.json must map module paths to renderer files',
      );
    }
  });

  test('rejects a path that is not a relative .ts or .js file', () => {
    for (const value of [
      'render.js',
      './render.css',
      './../render.js',
      '/render.js',
      3,
    ]) {
      expect(() =>
        getPackageRendererPath(
          { tada: { render: { '.': value } } },
          '',
          'tada-map',
        ),
      ).toThrow(
        'package "tada-map": "tada.render" "." in package.json must be a relative path ending in .ts or .js',
      );
    }
  });
});

describe('addRenderers', () => {
  test('records each renderer in its script outputs', () => {
    const authorScripts = {
      ...createEmptyAuthorScripts(['a.ts', 'b.ts']),
      entries: new Map([
        ['a.ts', { js: '_scripts/a.js', css: [] }],
        ['b.ts', { js: '_scripts/b.js', css: [] }],
      ]),
    };
    const renderers = new Map([
      [
        'a.ts',
        {
          file: 'src/a.render.ts',
          elements: new Map(),
          output: 'a.render-1234.js',
        },
      ],
    ]);
    const result = addRenderers(authorScripts, renderers);
    expect(result.entries.get('a.ts')).toEqual({
      js: '_scripts/a.js',
      css: [],
      render: 'a.render-1234.js',
    });
    expect(result.entries.get('b.ts')).toEqual({
      js: '_scripts/b.js',
      css: [],
    });
    expect(result.renderers).toBe(renderers);
    expect(authorScripts.entries.get('a.ts')).not.toHaveProperty('render');
  });
});
