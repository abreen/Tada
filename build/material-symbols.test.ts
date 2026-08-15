import { describe, expect, test } from 'bun:test';
import path from 'path';
import {
  MATERIAL_SYMBOL_CONFIG,
  MATERIAL_SYMBOLS,
  renderMaterialSymbolVariables,
} from './material-symbols';

const CANONICAL_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" height="24" viewBox="0 -960 960 960" width="24"><path d="M1-1Z"/></svg>';

describe('Material Symbols', () => {
  test('uses one shared outlined default configuration', () => {
    expect(MATERIAL_SYMBOL_CONFIG).toEqual({
      family: 'Material Symbols Outlined',
      fill: 0,
      weight: 400,
      grade: 0,
      opticalSize: 24,
      viewBox: '0 -960 960 960',
      source:
        'https://github.com/google/material-design-icons/tree/master/symbols/web',
    });
    expect(MATERIAL_SYMBOLS).toEqual({
      tada: { cssVariable: '--icon-tada', symbol: 'celebration' },
      contrastStandard: {
        cssVariable: '--icon-contrast-standard',
        symbol: 'contrast_rtl_off',
      },
      contrastHigh: { cssVariable: '--icon-contrast-high', symbol: 'contrast' },
      info: { cssVariable: '--icon-info', symbol: 'info' },
      warning: { cssVariable: '--icon-warning', symbol: 'warning' },
      parent: { cssVariable: '--icon-parent', symbol: 'south_east' },
      search: { cssVariable: '--icon-search', symbol: 'search' },
      externalLink: {
        cssVariable: '--icon-external-link',
        symbol: 'north_east',
      },
      headingAnchor: { cssVariable: '--icon-heading-anchor', symbol: 'tag' },
      headerMenu: { cssVariable: '--icon-header-menu', symbol: 'menu' },
      headerClose: { cssVariable: '--icon-header-close', symbol: 'close' },
    });
  });

  test('loads canonical filenames and renders encoded CSS mask variables', () => {
    const requestedPaths: string[] = [];
    const variables = renderMaterialSymbolVariables({
      packageDir: '/tada',
      readFile(filePath) {
        requestedPaths.push(filePath);
        return CANONICAL_SVG;
      },
    });

    expect(requestedPaths).toEqual([
      path.join('/tada', 'assets/material-symbols/celebration_24px.svg'),
      path.join('/tada', 'assets/material-symbols/contrast_rtl_off_24px.svg'),
      path.join('/tada', 'assets/material-symbols/contrast_24px.svg'),
      path.join('/tada', 'assets/material-symbols/info_24px.svg'),
      path.join('/tada', 'assets/material-symbols/warning_24px.svg'),
      path.join('/tada', 'assets/material-symbols/south_east_24px.svg'),
      path.join('/tada', 'assets/material-symbols/search_24px.svg'),
      path.join('/tada', 'assets/material-symbols/north_east_24px.svg'),
      path.join('/tada', 'assets/material-symbols/tag_24px.svg'),
      path.join('/tada', 'assets/material-symbols/menu_24px.svg'),
      path.join('/tada', 'assets/material-symbols/close_24px.svg'),
    ]);
    expect(variables).toContain('--icon-tada: url("data:image/svg+xml,');
    expect(variables).toContain(
      '--icon-contrast-standard: url("data:image/svg+xml,',
    );
    expect(variables).toContain(
      '--icon-contrast-high: url("data:image/svg+xml,',
    );
    expect(variables).toContain('--icon-info: url("data:image/svg+xml,');
    expect(variables).toContain('--icon-warning: url("data:image/svg+xml,');
    expect(variables).toContain('--icon-parent: url("data:image/svg+xml,');
    expect(variables).toContain('--icon-search: url("data:image/svg+xml,');
    expect(variables).toContain(
      '--icon-external-link: url("data:image/svg+xml,',
    );
    expect(variables).toContain(
      '--icon-heading-anchor: url("data:image/svg+xml,',
    );
    expect(variables).toContain('--icon-header-menu: url("data:image/svg+xml,');
    expect(variables).toContain(
      '--icon-header-close: url("data:image/svg+xml,',
    );
    expect(variables).toContain('%3Csvg%20xmlns%3D%22http%3A');
    expect(variables).not.toContain('<svg');
  });

  test('reports the registered icon when its asset cannot be read', () => {
    expect(() =>
      renderMaterialSymbolVariables({
        packageDir: '/tada',
        readFile() {
          throw new Error('missing');
        },
      }),
    ).toThrow('Material Symbol "celebration" could not be read');
  });

  test('rejects SVGs that do not conform to the shared dimensions', () => {
    expect(() =>
      renderMaterialSymbolVariables({
        packageDir: '/tada',
        readFile() {
          return CANONICAL_SVG.replace('height="24"', 'height="20"');
        },
      }),
    ).toThrow(
      'Material Symbol "celebration" does not match the configured 24px SVG format',
    );
  });
});
