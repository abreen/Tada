import { describe, expect, test } from 'bun:test';
import { getPackageRendererPath } from './author-renderers';

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
