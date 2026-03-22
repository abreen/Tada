import fs from 'fs';
import path from 'path';
import * as fontkit from 'fontkit';
import sharp from 'sharp';
import pngToIco from 'png-to-ico';
import { makeLogger } from './log';
import { getPackageDir } from './utils/paths';
import { deriveTheme } from './utils/derive-theme';
import type { SiteVariables } from './types';

const log = makeLogger(__filename);

const FONT_PATH = path.join(
  getPackageDir(),
  'fonts',
  'inter',
  'ttf',
  'InterVariable.ttf',
);

function createFaviconSvg(
  size: number,
  color: string,
  textColor: string,
  symbol: string,
  font: fontkit.Font,
  cssWeight: number,
): string {
  if (size < 10) {
    throw new Error(`size is too small: ${size}`);
  }

  if (!symbol) {
    throw new Error(`invalid symbol: ${symbol}`);
  }

  if (symbol.length > 5) {
    throw new Error(`symbol is too long (must be <= 5 chars): ${symbol}`);
  }

  // Apply variation axes for variable fonts
  const instance =
    typeof font.getVariation === 'function' &&
    font.variationAxes &&
    Object.keys(font.variationAxes).length > 0
      ? font.getVariation({ wght: cssWeight })
      : font;

  const run = instance.layout(symbol);

  // Compute combined bounding box across all glyphs (font units, y-up)
  let x = 0;
  let totalMinX = Infinity,
    totalMaxX = -Infinity;
  let totalMinY = Infinity,
    totalMaxY = -Infinity;
  const advances: number[] = [];

  for (let i = 0; i < run.glyphs.length; i++) {
    const bbox = run.glyphs[i].bbox;
    totalMinX = Math.min(totalMinX, x + bbox.minX);
    totalMaxX = Math.max(totalMaxX, x + bbox.maxX);
    totalMinY = Math.min(totalMinY, bbox.minY);
    totalMaxY = Math.max(totalMaxY, bbox.maxY);
    advances.push(x);
    x += run.positions[i].xAdvance;
  }

  const textW = totalMaxX - totalMinX;
  const textH = totalMaxY - totalMinY;

  if (textW <= 0 || textH <= 0) {
    throw new Error(`Could not get glyph bounds for symbol: ${symbol}`);
  }

  const pad = size * 0.1;
  const contentW = size - pad * 2;
  const contentH = size - pad * 2;

  // Scale font units to SVG pixels to fill padded content area
  const s = Math.min(contentW / textW, contentH / textH);

  // Font coords are y-up; SVG is y-down. The outer transform flips y via scale(s, -s).
  // We want the bbox center to land at (size/2, size/2).
  const bboxCenterX = (totalMinX + totalMaxX) / 2;
  const bboxCenterY = (totalMinY + totalMaxY) / 2;
  const tx = size / 2 - bboxCenterX * s;
  const ty = size / 2 + bboxCenterY * s;

  // Each glyph is translated by its cumulative x-advance (in font units).
  // The outer group handles y-flip and centering.
  const paths = run.glyphs
    .map((glyph: fontkit.Glyph, i: number) => {
      const d = glyph.path.toSVG();
      return advances[i] === 0
        ? `<path d="${d}" fill="${textColor}" />`
        : `<path d="${d}" transform="translate(${advances[i]} 0)" fill="${textColor}" />`;
    })
    .join('\n    ');

  return `<svg viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${size}" height="${size}" rx="${size / 10}" fill="${color}" />
  <g transform="translate(${tx.toFixed(2)} ${ty.toFixed(2)}) scale(${s.toFixed(4)} ${(-s).toFixed(4)})">
    ${paths}
  </g>
</svg>`;
}

export async function generateFavicons(
  siteVariables: SiteVariables,
  distDir: string,
): Promise<void> {
  const color = siteVariables.faviconColor;
  const symbol = siteVariables.faviconSymbol;
  const fontWeight = siteVariables.faviconFontWeight || 700;
  const sizes = [16, 32, 48, 64, 128, 192, 256, 512, 1024];
  const svgSize = 512;
  const filenameBase = 'favicon';

  if (!symbol) {
    throw new Error(
      'Favicon generation requires "symbol" in site config (or "faviconSymbol")',
    );
  }
  if (!color) {
    throw new Error(
      'Favicon generation requires "themeColor" in site config (or "faviconColor")',
    );
  }

  const { themeColorLight, textOnThemeLight } = deriveTheme(color);

  log.info`Generating favicons`;
  log.debug`Using font file: ${FONT_PATH}`;
  const font = fontkit.openSync(FONT_PATH) as fontkit.Font;

  const svgMarkup = createFaviconSvg(
    svgSize,
    themeColorLight,
    textOnThemeLight,
    symbol,
    font,
    fontWeight,
  );
  fs.writeFileSync(path.join(distDir, `${filenameBase}.svg`), svgMarkup);

  const pngBuffers = await Promise.all(
    sizes.map(async size => {
      const svgForSize = createFaviconSvg(
        size,
        themeColorLight,
        textOnThemeLight,
        symbol,
        font,
        fontWeight,
      );
      const buf = await sharp(Buffer.from(svgForSize)).png().toBuffer();
      fs.writeFileSync(path.join(distDir, `${filenameBase}-${size}.png`), buf);
      return { size, buf };
    }),
  );

  const icoBuffer = await pngToIco(
    pngBuffers
      .filter(b => b.size <= 256)
      .sort((a, b) => a.size - b.size)
      .map(x => x.buf),
  );
  fs.writeFileSync(path.join(distDir, `${filenameBase}.ico`), icoBuffer);
}

export { createFaviconSvg };
