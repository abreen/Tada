import fs from 'fs';
import path from 'path';
import { getPackageDir } from './utils/paths';

export const MATERIAL_SYMBOL_CONFIG = Object.freeze({
  family: 'Material Symbols Outlined',
  fill: 0,
  weight: 400,
  grade: 0,
  opticalSize: 24,
  viewBox: '0 -960 960 960',
  source:
    'https://github.com/google/material-design-icons/tree/master/symbols/web',
} as const);

export const MATERIAL_SYMBOLS = Object.freeze({
  tada: Object.freeze({ cssVariable: '--icon-tada', symbol: 'celebration' }),
  contrastStandard: Object.freeze({
    cssVariable: '--icon-contrast-standard',
    symbol: 'contrast_rtl_off',
  }),
  contrastHigh: Object.freeze({
    cssVariable: '--icon-contrast-high',
    symbol: 'contrast',
  }),
  info: Object.freeze({ cssVariable: '--icon-info', symbol: 'info' }),
  warning: Object.freeze({ cssVariable: '--icon-warning', symbol: 'warning' }),
  parent: Object.freeze({ cssVariable: '--icon-parent', symbol: 'south_east' }),
  search: Object.freeze({ cssVariable: '--icon-search', symbol: 'search' }),
  externalLink: Object.freeze({
    cssVariable: '--icon-external-link',
    symbol: 'north_east',
  }),
  headingAnchor: Object.freeze({
    cssVariable: '--icon-heading-anchor',
    symbol: 'tag',
  }),
  headerMenu: Object.freeze({
    cssVariable: '--icon-header-menu',
    symbol: 'menu',
  }),
  headerClose: Object.freeze({
    cssVariable: '--icon-header-close',
    symbol: 'close',
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
    `${symbol.symbol}_${MATERIAL_SYMBOL_CONFIG.opticalSize}px.svg`,
  );
}

function isConfiguredSvg(svg: string): boolean {
  const svgTag = svg.match(/<svg\b[^>]*>/)?.[0];
  if (!svgTag) {
    return false;
  }

  const hasAttribute = (name: string, value: string) =>
    new RegExp(`\\b${name}=["']${value}["']`).test(svgTag);

  return (
    hasAttribute('width', String(MATERIAL_SYMBOL_CONFIG.opticalSize)) &&
    hasAttribute('height', String(MATERIAL_SYMBOL_CONFIG.opticalSize)) &&
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

      if (!isConfiguredSvg(svg)) {
        throw new Error(
          `Material Symbol "${symbol.symbol}" does not match the configured ${MATERIAL_SYMBOL_CONFIG.opticalSize}px SVG format: ${assetPath}`,
        );
      }

      const dataUri = `data:image/svg+xml,${encodeURIComponent(svg.trim())}`;
      return `  ${symbol.cssVariable}: url("${dataUri}");`;
    })
    .join('\n');
}
