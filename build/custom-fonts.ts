import fs from 'fs';
import path from 'path';
import * as fontkit from 'fontkit';
import type { FontFamilyOverride, FontOverrides } from './types';

export const CUSTOM_FONT_FACE_DEFINITIONS = Object.freeze({
  regular: Object.freeze({ fontStyle: 'normal', fontWeight: 400 }),
  italic: Object.freeze({ fontStyle: 'italic', fontWeight: 400 }),
  bold: Object.freeze({ fontStyle: 'normal', fontWeight: 700 }),
  boldItalic: Object.freeze({ fontStyle: 'italic', fontWeight: 700 }),
});

export const CUSTOM_FONT_FAMILY_DEFINITIONS = Object.freeze({
  serif: Object.freeze({ configKey: 'serif', cssFamily: 'Tada Custom Serif' }),
  serifMono: Object.freeze({
    configKey: 'serifMono',
    cssFamily: 'Tada Custom Serif Mono',
  }),
});

export type CustomFontFamilyKey = keyof typeof CUSTOM_FONT_FAMILY_DEFINITIONS;
export type CustomFontFaceKey = keyof typeof CUSTOM_FONT_FACE_DEFINITIONS;

const FACE_KEYS = Object.freeze(
  Object.keys(CUSTOM_FONT_FACE_DEFINITIONS) as CustomFontFaceKey[],
);
const FAMILY_KEYS = Object.freeze(
  Object.keys(CUSTOM_FONT_FAMILY_DEFINITIONS) as CustomFontFamilyKey[],
);

interface ParsedFont {
  availableFeatures: readonly string[];
}

export interface CustomFontValidationOptions {
  fontOverrides: FontOverrides | undefined;
  publicDir: string;
  publicFiles: ReadonlySet<string>;
  readFile?: (filePath: string) => Buffer;
  parseFont?: (contents: Buffer) => ParsedFont;
}

export function isValidPublicWoff2Path(filePath: string): boolean {
  if (
    filePath.length === 0 ||
    filePath.startsWith('/') ||
    /^[A-Za-z]:/.test(filePath) ||
    filePath.includes('\\') ||
    filePath.includes('?') ||
    filePath.includes('#') ||
    !filePath.endsWith('.woff2')
  ) {
    return false;
  }

  const segments = filePath.split('/');
  return segments.every(
    segment => segment.length > 0 && segment !== '.' && segment !== '..',
  );
}

export function resolvePublicFontPath(
  publicDir: string,
  filePath: string,
): string {
  return path.resolve(publicDir, ...filePath.split('/'));
}

export function encodePublicAssetPath(filePath: string): string {
  return filePath
    .split('/')
    .map(segment => encodeURIComponent(segment).replaceAll("'", '%27'))
    .join('/');
}

export function renderFontFeatureSettings(
  family: FontFamilyOverride | undefined,
): string {
  return family?.features?.length
    ? family.features.map(feature => `'${feature}'`).join(', ')
    : 'normal';
}

export function renderCustomFontFaceScss(
  fontOverrides: FontOverrides | undefined,
): string {
  const rules: string[] = [];
  for (const familyKey of FAMILY_KEYS) {
    const family = fontOverrides?.[familyKey];
    if (!family) {
      continue;
    }
    const cssFamily = CUSTOM_FONT_FAMILY_DEFINITIONS[familyKey].cssFamily;
    for (const faceKey of FACE_KEYS) {
      const filePath = family[faceKey];
      if (!filePath) {
        continue;
      }
      const face = CUSTOM_FONT_FACE_DEFINITIONS[faceKey];
      rules.push(`  @font-face {
    font-family: '${cssFamily}';
    font-style: ${face.fontStyle};
    font-weight: ${face.fontWeight};
    src: url('${encodePublicAssetPath(filePath)}') format('woff2');
    font-display: swap;
  }`);
    }
  }
  return rules.join('\n\n');
}

const HEADING_SIZES = Object.freeze({
  h1: 2.5,
  h2: 1.5,
  h3: 1.17,
  h4: 1,
  h5: 0.83,
  h6: 0.67,
});

function formatCssNumber(value: number): string {
  const rounded = Number(value.toFixed(4));
  return (rounded === 0 && value !== 0 ? value : rounded).toString();
}

export function renderCustomFontTuningScss(
  fontOverrides: FontOverrides | undefined,
): string {
  const rules: string[] = [];
  const serifTuning = fontOverrides?.serif?.tuning;
  const monoTuning = fontOverrides?.serifMono?.tuning;
  const rootSelector = ":root[data-font-preference='serif']";

  if (serifTuning?.fontSizeAdjust !== undefined) {
    rules.push(
      `  ${rootSelector} {\n    --font-size-adjust: cap-height ${formatCssNumber(serifTuning.fontSizeAdjust)};\n  }`,
    );
  }

  if (monoTuning?.fontSizeAdjust !== undefined) {
    rules.push(
      `  ${rootSelector} {\n    --mono-font-size-adjust: cap-height ${formatCssNumber(monoTuning.fontSizeAdjust)};\n  }`,
    );
  }

  if (serifTuning?.scale !== undefined) {
    rules.push(
      `  ${rootSelector} {\n    --font-size: ${formatCssNumber(serifTuning.scale)}rem;\n  }`,
    );
  }

  if (serifTuning?.lineHeight !== undefined) {
    rules.push(
      `  ${rootSelector} main.body {\n    line-height: ${formatCssNumber(serifTuning.lineHeight)};\n  }`,
    );
  }

  if (
    serifTuning?.scale !== undefined ||
    serifTuning?.lineHeight !== undefined
  ) {
    rules.push(
      `  ${rootSelector} main.body > :is(footer, .appearance-pickers, .slides-header, .file-header) {\n    font-size: var(--font-size);\n    line-height: var(--line-height);\n  }`,
    );
  }

  if (
    serifTuning?.scale !== undefined ||
    serifTuning?.headingScale !== undefined
  ) {
    const headingScale = serifTuning.headingScale ?? 1;
    for (const [heading, size] of Object.entries(HEADING_SIZES)) {
      rules.push(
        `  ${rootSelector} .main-content ${heading}:not(.file-title) { font-size: ${formatCssNumber(size * headingScale)}rem; }`,
      );
      rules.push(
        `  ${rootSelector} body.is-presenting .main-content .slide ${heading}:not(.file-title) { font-size: ${formatCssNumber(size * headingScale)}em; }`,
      );
    }
  }

  if (serifTuning?.headingWeight !== undefined) {
    rules.push(
      `  ${rootSelector} .main-content :is(h1, h2, h3, h4, h5, h6):not(.file-title) {\n    font-weight: ${serifTuning.headingWeight};\n  }`,
    );
  }

  if (monoTuning?.scale !== undefined || monoTuning?.lineHeight !== undefined) {
    const declarations: string[] = [];
    if (monoTuning.scale !== undefined) {
      declarations.push(
        `--mono-font-size: ${formatCssNumber(monoTuning.scale)}em;`,
      );
    }
    if (monoTuning.lineHeight !== undefined) {
      declarations.push(
        `--mono-line-height: ${formatCssNumber(monoTuning.lineHeight)};`,
      );
    }
    rules.push(`  ${rootSelector} {\n    ${declarations.join('\n    ')}\n  }`);
  }

  return rules.join('\n\n');
}

export function getSerifFontStack(
  fontOverrides: FontOverrides | undefined,
): string {
  const custom = fontOverrides?.serif
    ? `'${CUSTOM_FONT_FAMILY_DEFINITIONS.serif.cssFamily}', `
    : '';
  return `${custom}'Source Serif 4', 'Times New Roman', 'Times', serif`;
}

export function getSerifMonoFontStack(
  fontOverrides: FontOverrides | undefined,
): string {
  const custom = fontOverrides?.serifMono
    ? `'${CUSTOM_FONT_FAMILY_DEFINITIONS.serifMono.cssFamily}', `
    : '';
  return `${custom}'Libertinus Mono', 'Courier New', 'Courier', monospace`;
}

function defaultParseFont(contents: Buffer): ParsedFont {
  const font = fontkit.create(contents) as fontkit.Font;
  return { availableFeatures: font.availableFeatures };
}

function validateFamily(
  familyKey: CustomFontFamilyKey,
  family: FontFamilyOverride,
  options: Required<
    Pick<CustomFontValidationOptions, 'readFile' | 'parseFont'>
  > &
    Pick<CustomFontValidationOptions, 'publicDir' | 'publicFiles'>,
): string[] {
  const diagnostics: string[] = [];
  const parsedFaces: Partial<Record<CustomFontFaceKey, ParsedFont>> = {};

  for (const faceKey of FACE_KEYS) {
    const filePath = family[faceKey];
    if (!filePath) {
      continue;
    }
    const configPath = `fontOverrides.${familyKey}.${faceKey}`;
    if (!isValidPublicWoff2Path(filePath)) {
      diagnostics.push(
        `${configPath} must be a public-relative POSIX path ending in .woff2`,
      );
      continue;
    }

    const absolutePath = resolvePublicFontPath(options.publicDir, filePath);
    if (!options.publicFiles.has(absolutePath)) {
      diagnostics.push(`${configPath} "${filePath}" does not exist in public/`);
      continue;
    }

    let contents: Buffer;
    try {
      contents = options.readFile(absolutePath);
    } catch {
      diagnostics.push(`${configPath} "${filePath}" could not be read`);
      continue;
    }
    if (contents.subarray(0, 4).toString('ascii') !== 'wOF2') {
      diagnostics.push(`${configPath} "${filePath}" is not a WOFF2 font`);
      continue;
    }
    try {
      parsedFaces[faceKey] = options.parseFont(contents);
    } catch {
      diagnostics.push(`${configPath} "${filePath}" is not a valid WOFF2 font`);
    }
  }

  for (const feature of family.features ?? []) {
    for (const faceKey of FACE_KEYS) {
      const parsed = parsedFaces[faceKey];
      if (parsed && !parsed.availableFeatures.includes(feature)) {
        diagnostics.push(
          `fontOverrides.${familyKey}.features "${feature}" is not supported by fontOverrides.${familyKey}.${faceKey}`,
        );
      }
    }
  }

  return diagnostics;
}

export function validateCustomFontOverrides(
  options: CustomFontValidationOptions,
): string[] {
  const readFile = options.readFile ?? fs.readFileSync;
  const parseFont = options.parseFont ?? defaultParseFont;
  const diagnostics: string[] = [];

  for (const familyKey of FAMILY_KEYS) {
    const family = options.fontOverrides?.[familyKey];
    if (family) {
      diagnostics.push(
        ...validateFamily(familyKey, family, {
          publicDir: options.publicDir,
          publicFiles: options.publicFiles,
          readFile,
          parseFont,
        }),
      );
    }
  }

  return diagnostics;
}
