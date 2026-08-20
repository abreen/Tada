import path from 'path';
import { describe, expect, test } from 'bun:test';
import {
  CUSTOM_FONT_FACE_DEFINITIONS,
  CUSTOM_FONT_FAMILY_DEFINITIONS,
  encodePublicAssetPath,
  getSerifFontStack,
  getSerifMonoFontStack,
  isValidPublicWoff2Path,
  renderCustomFontFaceScss,
  renderCustomFontTuningScss,
  renderFontFeatureSettings,
  resolvePublicFontPath,
  validateCustomFontOverrides,
} from './custom-fonts';

const PUBLIC_DIR = path.resolve(path.sep, 'site', 'public');

function publicPath(filePath: string): string {
  return resolvePublicFontPath(PUBLIC_DIR, filePath);
}

function validWoff2(): Buffer {
  return Buffer.from('wOF2test-font');
}

describe('custom font configuration', () => {
  test('defines stable family aliases and face descriptors', () => {
    expect(CUSTOM_FONT_FAMILY_DEFINITIONS).toEqual({
      serif: { configKey: 'serif', cssFamily: 'Tada Custom Serif' },
      serifMono: {
        configKey: 'serifMono',
        cssFamily: 'Tada Custom Serif Mono',
      },
    });
    expect(CUSTOM_FONT_FACE_DEFINITIONS).toEqual({
      regular: { fontStyle: 'normal', fontWeight: 400 },
      italic: { fontStyle: 'italic', fontWeight: 400 },
      bold: { fontStyle: 'normal', fontWeight: 700 },
      boldItalic: { fontStyle: 'italic', fontWeight: 700 },
    });
  });

  test('renders encoded custom font faces with fixed descriptors', () => {
    const scss = renderCustomFontFaceScss({
      serif: {
        regular: 'fonts/Body Regular.woff2',
        italic: 'fonts/body-italic.woff2',
        bold: 'fonts/body-bold.woff2',
        boldItalic: 'fonts/body-bold-italic.woff2',
      },
      serifMono: { regular: 'fonts/mono.woff2', features: ['ss02'] },
    });

    expect(scss.match(/@font-face/g)).toHaveLength(5);
    expect(scss).toContain("font-family: 'Tada Custom Serif';");
    expect(scss).toContain("font-family: 'Tada Custom Serif Mono';");
    expect(scss).toContain("url('fonts/Body%20Regular.woff2')");
    expect(scss).toContain('font-style: italic;');
    expect(scss).toContain('font-weight: 700;');
    expect(scss).toContain('font-display: swap;');
  });

  test('renders custom stacks, fallbacks, and feature settings', () => {
    const overrides = {
      serif: { regular: 'fonts/body.woff2' },
      serifMono: { regular: 'fonts/mono.woff2', features: ['ss02', 'calt'] },
    };

    expect(getSerifFontStack(overrides)).toBe(
      "'Tada Custom Serif', 'Source Serif 4', 'Times New Roman', 'Times', serif",
    );
    expect(getSerifMonoFontStack(overrides)).toBe(
      "'Tada Custom Serif Mono', 'Libertinus Mono', 'Courier New', 'Courier', monospace",
    );
    expect(renderFontFeatureSettings(overrides.serif)).toBe('normal');
    expect(renderFontFeatureSettings(overrides.serifMono)).toBe(
      "'ss02', 'calt'",
    );
    expect(encodePublicAssetPath('fonts/Font Name.woff2')).toBe(
      'fonts/Font%20Name.woff2',
    );
    expect(encodePublicAssetPath("fonts/Author's Font.woff2")).toBe(
      'fonts/Author%27s%20Font.woff2',
    );
  });

  test('leaves bundled stacks and normal features unchanged without overrides', () => {
    expect(renderCustomFontFaceScss(undefined)).toBe('');
    expect(getSerifFontStack(undefined)).toBe(
      "'Source Serif 4', 'Times New Roman', 'Times', serif",
    );
    expect(getSerifMonoFontStack(undefined)).toBe(
      "'Libertinus Mono', 'Courier New', 'Courier', monospace",
    );
    expect(renderFontFeatureSettings(undefined)).toBe('normal');
    expect(renderCustomFontTuningScss(undefined)).toBe('');
  });

  test('renders independent serif content, heading, and mono tuning', () => {
    const scss = renderCustomFontTuningScss({
      serif: {
        regular: 'fonts/body.woff2',
        tuning: {
          scale: 1.125,
          lineHeight: 1.5,
          headingScale: 0.9,
          headingWeight: 400,
          fontSizeAdjust: 0.67004,
        },
      },
      serifMono: {
        regular: 'fonts/mono.woff2',
        tuning: { scale: 0.96, lineHeight: 1.45, fontSizeAdjust: 0.61306 },
      },
    });

    expect(scss).toContain(
      ":root[data-font-preference='serif'] {\n    --font-size: 1.125rem;",
    );
    expect(scss).not.toContain(
      ':is(main.body, nav.toc, header .to-top-container)',
    );
    expect(scss).not.toContain('header .to-top-container .button');
    expect(scss).toContain('main.body {\n    line-height: 1.5;');
    expect(scss).toContain(
      '.main-content h1:not(.file-title) { font-size: 2.25rem; }',
    );
    expect(scss).toContain(
      '.main-content h2:not(.file-title) { font-size: 1.35rem; }',
    );
    expect(scss).toContain(
      'body.is-presenting .main-content .slide h1:not(.file-title) { font-size: 2.25em; }',
    );
    expect(scss).toContain(
      'body.is-presenting .main-content .slide h2:not(.file-title) { font-size: 1.35em; }',
    );
    expect(scss).toContain(
      '.main-content :is(h1, h2, h3, h4, h5, h6):not(.file-title)',
    );
    expect(scss).toContain('font-weight: 400;');
    expect(scss).toContain('--mono-font-size: 0.96em;');
    expect(scss).toContain('--mono-line-height: 1.45;');
    expect(scss).toContain('--font-size-adjust: cap-height 0.67;');
    expect(scss).toContain('--mono-font-size-adjust: cap-height 0.6131;');
    expect(scss).toContain(
      'main.body > :is(footer, .appearance-pickers, .slides-header, .file-header)',
    );
    expect(scss).toContain('line-height: var(--line-height);');
  });

  test('keeps headings independent when only serif scaling is configured', () => {
    const scss = renderCustomFontTuningScss({
      serif: { regular: 'fonts/body.woff2', tuning: { scale: 1.1 } },
    });

    expect(scss).toContain(
      '.main-content h1:not(.file-title) { font-size: 2.5rem; }',
    );
    expect(scss).toContain(
      '.main-content h2:not(.file-title) { font-size: 1.5rem; }',
    );
  });

  test('omits font size adjustment variables when they are not configured', () => {
    const scss = renderCustomFontTuningScss({
      serif: { regular: 'fonts/body.woff2', tuning: { lineHeight: 1.5 } },
      serifMono: { regular: 'fonts/mono.woff2', tuning: { scale: 0.96 } },
    });

    expect(scss).not.toContain('--font-size-adjust:');
    expect(scss).not.toContain('--mono-font-size-adjust:');
  });

  test('does not round a positive font size adjustment to zero', () => {
    const scss = renderCustomFontTuningScss({
      serif: {
        regular: 'fonts/body.woff2',
        tuning: { fontSizeAdjust: 0.00001 },
      },
    });

    expect(scss).toContain('--font-size-adjust: cap-height 0.00001;');
    expect(scss).not.toContain('--font-size-adjust: cap-height 0;');
  });

  test.each(['font.woff2', 'fonts/font.woff2', 'fonts/Font Name.woff2'])(
    'accepts safe public font path %s',
    filePath => {
      expect(isValidPublicWoff2Path(filePath)).toBe(true);
    },
  );

  test.each([
    '',
    '/fonts/font.woff2',
    'C:/fonts/font.woff2',
    '../font.woff2',
    'fonts/../font.woff2',
    'fonts/./font.woff2',
    'fonts//font.woff2',
    'fonts\\font.woff2',
    'fonts/font.otf',
    'fonts/font.woff2?version=1',
    'fonts/font.woff2#face',
  ])('rejects unsafe public font path %s', filePath => {
    expect(isValidPublicWoff2Path(filePath)).toBe(false);
  });

  test('accepts parsed faces that support every requested feature', () => {
    const regular = publicPath('fonts/body.woff2');
    const italic = publicPath('fonts/body-italic.woff2');
    const diagnostics = validateCustomFontOverrides({
      fontOverrides: {
        serif: {
          regular: 'fonts/body.woff2',
          italic: 'fonts/body-italic.woff2',
          features: ['liga', 'ss02'],
        },
      },
      publicDir: PUBLIC_DIR,
      publicFiles: new Set([regular, italic]),
      readFile: () => validWoff2(),
      parseFont: () => ({ availableFeatures: ['liga', 'ss02'] }),
    });

    expect(diagnostics).toEqual([]);
  });

  test('reports unsafe, missing, unreadable, malformed, and invalid faces', () => {
    const unreadable = publicPath('fonts/unreadable.woff2');
    const malformed = publicPath('fonts/malformed.woff2');
    const invalid = publicPath('fonts/invalid.woff2');
    const diagnostics = validateCustomFontOverrides({
      fontOverrides: {
        serif: {
          regular: '../body.woff2',
          italic: 'fonts/missing.woff2',
          bold: 'fonts/unreadable.woff2',
          boldItalic: 'fonts/malformed.woff2',
        },
        serifMono: { regular: 'fonts/invalid.woff2' },
      },
      publicDir: PUBLIC_DIR,
      publicFiles: new Set([unreadable, malformed, invalid]),
      readFile: filePath => {
        if (filePath === unreadable) {
          throw new Error('unreadable');
        }
        return filePath === malformed ? Buffer.from('nope') : validWoff2();
      },
      parseFont: () => {
        throw new Error('invalid');
      },
    });

    expect(diagnostics).toEqual([
      'fontOverrides.serif.regular must be a public-relative POSIX path ending in .woff2',
      'fontOverrides.serif.italic "fonts/missing.woff2" does not exist in public/',
      'fontOverrides.serif.bold "fonts/unreadable.woff2" could not be read',
      'fontOverrides.serif.boldItalic "fonts/malformed.woff2" is not a WOFF2 font',
      'fontOverrides.serifMono.regular "fonts/invalid.woff2" is not a valid WOFF2 font',
    ]);
  });

  test('reports unsupported features for each configured face', () => {
    const regular = publicPath('fonts/mono.woff2');
    const bold = publicPath('fonts/mono-bold.woff2');
    let parseCount = 0;
    const diagnostics = validateCustomFontOverrides({
      fontOverrides: {
        serifMono: {
          regular: 'fonts/mono.woff2',
          bold: 'fonts/mono-bold.woff2',
          features: ['ss02'],
        },
      },
      publicDir: PUBLIC_DIR,
      publicFiles: new Set([regular, bold]),
      readFile: () => validWoff2(),
      parseFont: () => ({
        availableFeatures: parseCount++ === 0 ? ['ss02'] : [],
      }),
    });

    expect(diagnostics).toEqual([
      'fontOverrides.serifMono.features "ss02" is not supported by fontOverrides.serifMono.bold',
    ]);
  });
});
