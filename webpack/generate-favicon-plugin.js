const { execSync } = require('child_process');
const fontkit = require('fontkit');
const sharp = require('sharp');
const { default: pngToIco } = require('png-to-ico');
const { makeLogger } = require('./log');

const log = makeLogger(__filename);

// Map CSS font-weight (100–900) to fontconfig FC_WEIGHT values
function cssWeightToFc(cssWeight) {
  if (cssWeight <= 100) {
    return 0;
  } // thin
  if (cssWeight <= 200) {
    return 40;
  } // extralight
  if (cssWeight <= 300) {
    return 50;
  } // light
  if (cssWeight <= 400) {
    return 80;
  } // regular
  if (cssWeight <= 500) {
    return 100;
  } // medium
  if (cssWeight <= 600) {
    return 180;
  } // demibold
  if (cssWeight <= 700) {
    return 200;
  } // bold
  if (cssWeight <= 800) {
    return 205;
  } // extrabold
  return 210; // black
}

function findFontFile(familyName, cssWeight) {
  const pattern =
    cssWeight != null
      ? `${familyName}:weight=${cssWeightToFc(cssWeight)}`
      : familyName;
  const result = execSync(`fc-match -f '%{file}' "${pattern}"`)
    .toString()
    .trim();
  if (!result) {
    throw new Error(`Could not find font: ${pattern}`);
  }
  return result;
}

function createFaviconSvg(size, color, symbol, font, cssWeight) {
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
  const advances = [];

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
    .map((glyph, i) => {
      const d = glyph.path.toSVG();
      return advances[i] === 0
        ? `<path d="${d}" fill="#fff" />`
        : `<path d="${d}" transform="translate(${advances[i]} 0)" fill="#fff" />`;
    })
    .join('\n    ');

  return `<svg viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${size}" height="${size}" rx="${size / 10}" fill="${color}" />
  <g transform="translate(${tx.toFixed(2)} ${ty.toFixed(2)}) scale(${s.toFixed(4)} ${(-s).toFixed(4)})">
    ${paths}
  </g>
</svg>`;
}

class GenerateFaviconPlugin {
  constructor(siteVariables, options = {}) {
    this.options = {
      sizes: options.sizes || [16, 32, 48, 64, 128, 192, 256, 512, 1024],
      svgSize: options.svgSize || 512,
      filenameBase: options.filenameBase || 'favicon',
      color: siteVariables.faviconColor,
      symbol: siteVariables.faviconSymbol,
      fontFamily: siteVariables.faviconFont,
      fontWeight: siteVariables.faviconFontWeight,
    };
  }

  apply(compiler) {
    compiler.hooks.thisCompilation.tap('GenerateFaviconPlugin', compilation => {
      const wp = compilation.compiler.webpack || {};
      const { RawSource } =
        (wp.sources && wp.sources) || require('webpack-sources');

      compilation.hooks.processAssets.tapPromise(
        {
          name: 'GenerateFaviconPlugin',
          stage: compiler.webpack.Compilation.PROCESS_ASSETS_STAGE_ADDITIONAL,
        },
        async assets => {
          const {
            color,
            symbol,
            sizes,
            filenameBase,
            svgSize,
            fontFamily,
            fontWeight,
          } = this.options;

          if (!color || !symbol || !fontFamily) {
            throw new Error(
              'Missing required "color", "symbol", and/or "fontFamily" options',
            );
          }

          try {
            const fontPath = findFontFile(fontFamily, fontWeight);
            log.note`Using font file: ${fontPath}`;
            const font = fontkit.openSync(fontPath);

            const svgMarkup = createFaviconSvg(
              svgSize,
              color,
              symbol,
              font,
              fontWeight,
            );
            compilation.emitAsset(
              `${filenameBase}.svg`,
              new RawSource(svgMarkup),
            );

            const pngBuffers = await Promise.all(
              sizes.map(async size => {
                const svgForSize = createFaviconSvg(
                  size,
                  color,
                  symbol,
                  font,
                  fontWeight,
                );
                const buf = await sharp(Buffer.from(svgForSize))
                  .png()
                  .toBuffer();

                compilation.emitAsset(
                  `${filenameBase}-${size}.png`,
                  new RawSource(buf),
                );
                return { size, buf };
              }),
            );

            const icoBuffer = await pngToIco(
              pngBuffers
                .filter(b => b.size <= 256)
                .sort((a, b) => a.size - b.size)
                .map(x => x.buf),
            );
            compilation.emitAsset(
              `${filenameBase}.ico`,
              new RawSource(icoBuffer),
            );
          } catch (err) {
            compilation.errors.push(
              new Error(`Error: ${err && err.message ? err.message : err}`),
            );
          }
        },
      );
    });
  }
}

module.exports = GenerateFaviconPlugin;
