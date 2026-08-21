import { describe, expect, test } from 'bun:test';
import path from 'path';
import {
  MATERIAL_SYMBOL_CONFIG,
  MATERIAL_SYMBOLS,
  renderMaterialSymbolVariables,
} from './material-symbols';

function canonicalSvg(size: 20 | 24 | 40): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" height="${size}" viewBox="0 -960 960 960" width="${size}"><path d="M1-1Z"/></svg>`;
}

describe('Material Symbols', () => {
  test('uses one shared outlined unfilled configuration', () => {
    expect(MATERIAL_SYMBOL_CONFIG).toEqual({
      family: 'Material Symbols Outlined',
      fill: 0,
      weight: 200,
      grade: 200,
      opticalSizes: [20, 24, 40],
      viewBox: '0 -960 960 960',
      source: 'https://fonts.google.com/icons',
    });
    expect(MATERIAL_SYMBOLS).toEqual({
      tada: {
        cssVariable: '--icon-tada',
        symbol: 'celebration',
        opticalSize: 24,
      },
      contrastStandard: {
        cssVariable: '--icon-contrast-standard',
        symbol: 'contrast_rtl_off',
        opticalSize: 20,
      },
      contrastHigh: {
        cssVariable: '--icon-contrast-high',
        symbol: 'contrast',
        opticalSize: 20,
      },
      info: { cssVariable: '--icon-info', symbol: 'info', opticalSize: 40 },
      infoCompact: {
        cssVariable: '--icon-info-compact',
        symbol: 'info',
        opticalSize: 20,
      },
      warning: {
        cssVariable: '--icon-warning',
        symbol: 'warning',
        opticalSize: 40,
      },
      warningCompact: {
        cssVariable: '--icon-warning-compact',
        symbol: 'warning',
        opticalSize: 20,
      },
      parent: {
        cssVariable: '--icon-parent',
        symbol: 'south_east',
        opticalSize: 20,
      },
      search: {
        cssVariable: '--icon-search',
        symbol: 'search',
        opticalSize: 20,
      },
      externalLink: {
        cssVariable: '--icon-external-link',
        symbol: 'open_in_new',
        opticalSize: 20,
      },
      headingPresent: {
        cssVariable: '--icon-heading-present',
        symbol: 'smart_display',
        opticalSize: 24,
      },
      headerMenu: {
        cssVariable: '--icon-header-menu',
        symbol: 'menu',
        opticalSize: 24,
      },
      headerClose: {
        cssVariable: '--icon-header-close',
        symbol: 'close',
        opticalSize: 24,
      },
    });
  });

  test('loads canonical filenames and renders encoded CSS mask variables', () => {
    const requestedPaths: string[] = [];
    const variables = renderMaterialSymbolVariables({
      packageDir: '/tada',
      readFile(filePath) {
        requestedPaths.push(filePath);
        const size = Number.parseInt(filePath.match(/_(\d+)px\.svg$/)![1], 10);
        return canonicalSvg(size as 20 | 24 | 40);
      },
    });

    expect(requestedPaths).toEqual([
      path.join('/tada', 'assets/material-symbols/celebration_24px.svg'),
      path.join('/tada', 'assets/material-symbols/contrast_rtl_off_20px.svg'),
      path.join('/tada', 'assets/material-symbols/contrast_20px.svg'),
      path.join('/tada', 'assets/material-symbols/info_40px.svg'),
      path.join('/tada', 'assets/material-symbols/info_20px.svg'),
      path.join('/tada', 'assets/material-symbols/warning_40px.svg'),
      path.join('/tada', 'assets/material-symbols/warning_20px.svg'),
      path.join('/tada', 'assets/material-symbols/south_east_20px.svg'),
      path.join('/tada', 'assets/material-symbols/search_20px.svg'),
      path.join('/tada', 'assets/material-symbols/open_in_new_20px.svg'),
      path.join('/tada', 'assets/material-symbols/smart_display_24px.svg'),
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
    expect(variables).toContain(
      '--icon-info-compact: url("data:image/svg+xml,',
    );
    expect(variables).toContain('--icon-warning: url("data:image/svg+xml,');
    expect(variables).toContain(
      '--icon-warning-compact: url("data:image/svg+xml,',
    );
    expect(variables).toContain('--icon-parent: url("data:image/svg+xml,');
    expect(variables).toContain('--icon-search: url("data:image/svg+xml,');
    expect(variables).toContain(
      '--icon-external-link: url("data:image/svg+xml,',
    );
    expect(variables).toContain(
      '--icon-heading-present: url("data:image/svg+xml,',
    );
    expect(variables).toContain('--icon-header-menu: url("data:image/svg+xml,');
    expect(variables).toContain(
      '--icon-header-close: url("data:image/svg+xml,',
    );
    expect(variables).toContain('%3Csvg%20xmlns%3D%22http%3A');
    expect(variables).not.toContain('<svg');
    for (const symbol of Object.values(MATERIAL_SYMBOLS)) {
      expect(variables).toContain(
        `${symbol.cssVariable}-size: ${symbol.opticalSize}px;`,
      );
    }
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
          return canonicalSvg(24).replace('height="24"', 'height="20"');
        },
      }),
    ).toThrow(
      'Material Symbol "celebration" does not match the configured 24px SVG format',
    );
  });
});
