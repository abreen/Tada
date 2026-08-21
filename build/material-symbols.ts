import fs from 'fs';
import path from 'path';
import { getPackageDir } from './utils/paths';

export const MATERIAL_SYMBOL_CONFIG = Object.freeze({
  family: 'Material Symbols Outlined',
  fill: 0,
  weight: 200,
  grade: 200,
  opticalSizes: Object.freeze([20, 24, 40] as const),
  viewBox: '0 -960 960 960',
  source: 'https://fonts.google.com/icons',
} as const);

export const MATERIAL_SYMBOLS = Object.freeze({
  tada: Object.freeze({
    cssVariable: '--icon-tada',
    symbol: 'celebration',
    opticalSize: 24,
  }),
  contrastStandard: Object.freeze({
    cssVariable: '--icon-contrast-standard',
    symbol: 'contrast_rtl_off',
    opticalSize: 20,
  }),
  contrastHigh: Object.freeze({
    cssVariable: '--icon-contrast-high',
    symbol: 'contrast',
    opticalSize: 20,
  }),
  info: Object.freeze({
    cssVariable: '--icon-info',
    symbol: 'info',
    opticalSize: 40,
  }),
  infoCompact: Object.freeze({
    cssVariable: '--icon-info-compact',
    symbol: 'info',
    opticalSize: 20,
  }),
  warning: Object.freeze({
    cssVariable: '--icon-warning',
    symbol: 'warning',
    opticalSize: 40,
  }),
  warningCompact: Object.freeze({
    cssVariable: '--icon-warning-compact',
    symbol: 'warning',
    opticalSize: 20,
  }),
  parent: Object.freeze({
    cssVariable: '--icon-parent',
    symbol: 'south_east',
    opticalSize: 20,
  }),
  search: Object.freeze({
    cssVariable: '--icon-search',
    symbol: 'search',
    opticalSize: 20,
  }),
  externalLink: Object.freeze({
    cssVariable: '--icon-external-link',
    symbol: 'open_in_new',
    opticalSize: 20,
  }),
  headingPresent: Object.freeze({
    cssVariable: '--icon-heading-present',
    symbol: 'smart_display',
    opticalSize: 24,
  }),
  headerMenu: Object.freeze({
    cssVariable: '--icon-header-menu',
    symbol: 'menu',
    opticalSize: 24,
  }),
  headerClose: Object.freeze({
    cssVariable: '--icon-header-close',
    symbol: 'close',
    opticalSize: 24,
  }),
} as const);

type MaterialSymbol = (typeof MATERIAL_SYMBOLS)[keyof typeof MATERIAL_SYMBOLS];

interface RenderMaterialSymbolOptions {
  packageDir?: string;
  readFile?: (filePath: string) => string;
}

function getAssetPath(packageDir: string, symbol: MaterialSymbol): string {
  return path.join(
    packageDir,
    'assets/material-symbols',
    `${symbol.symbol}_${symbol.opticalSize}px.svg`,
  );
}

function isConfiguredSvg(
  svg: string,
  opticalSize: MaterialSymbol['opticalSize'],
): boolean {
  const svgTag = svg.match(/<svg\b[^>]*>/)?.[0];
  if (!svgTag) {
    return false;
  }

  const hasAttribute = (name: string, value: string) =>
    new RegExp(`\\b${name}=["']${value}["']`).test(svgTag);

  return (
    hasAttribute('width', String(opticalSize)) &&
    hasAttribute('height', String(opticalSize)) &&
    hasAttribute('viewBox', MATERIAL_SYMBOL_CONFIG.viewBox)
  );
}

export function renderMaterialSymbolVariables({
  packageDir = getPackageDir(),
  readFile = filePath => fs.readFileSync(filePath, 'utf8'),
}: RenderMaterialSymbolOptions = {}): string {
  return Object.values(MATERIAL_SYMBOLS)
    .map(symbol => {
      const assetPath = getAssetPath(packageDir, symbol);
      let svg: string;

      try {
        svg = readFile(assetPath);
      } catch (error) {
        throw new Error(
          `Material Symbol "${symbol.symbol}" could not be read from ${assetPath}`,
          { cause: error },
        );
      }

      if (!isConfiguredSvg(svg, symbol.opticalSize)) {
        throw new Error(
          `Material Symbol "${symbol.symbol}" does not match the configured ${symbol.opticalSize}px SVG format: ${assetPath}`,
        );
      }

      const dataUri = `data:image/svg+xml,${encodeURIComponent(svg.trim())}`;
      return `  ${symbol.cssVariable}: url("${dataUri}");\n  ${symbol.cssVariable}-size: ${symbol.opticalSize}px;`;
    })
    .join('\n');
}
