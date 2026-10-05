import { describe, expect, test } from 'bun:test';
import { compile, doValidation } from './json-schema';
import {
  getExtensionToShikiLanguage,
  getRuntimeBundledShikiLanguages,
  resolveFaviconSymbol,
  validateExtensionToShikiLanguage,
  validateShikiLanguages,
} from './site-variables';
import type { SiteVariables } from './types';
import { getProcessedExts, getSourceRenderKind } from './source-model';
import { applySourceTemplate } from './utils/source-template';
import siteSchema from '../schema/site.schema.json' with { type: 'json' };

describe('validateExtensionToShikiLanguage', () => {
  test('retains template access to ordinary mapping methods', () => {
    const site = siteWith({
      extensionToShikiLanguage: validateExtensionToShikiLanguage(
        { ts: 'typescript' },
        'site.dev.json',
      ),
    });
    expect(
      applySourceTemplate(
        '<%= site.extensionToShikiLanguage.hasOwnProperty("ts") %>|<%= site.extensionToShikiLanguage.toString() %>',
        site,
        'example.ts',
      ),
    ).toBe('true|[object Object]');
  });

  test.each(['__proto__', 'constructor', 'toString'])(
    'retains an explicit %s extension mapping',
    ext => {
      const validated = validateExtensionToShikiLanguage(
        JSON.parse(`{"${ext}":"text"}`),
        'site.dev.json',
      )!;
      expect(Object.hasOwn(validated, ext)).toBe(true);
      expect(validated[ext]).toBe('text');
    },
  );

  test('uses the own __proto__ mapping for code-page classification', () => {
    const mapping = validateExtensionToShikiLanguage(
      JSON.parse('{"__proto__":"text"}'),
      'site.dev.json',
    )!;
    const site = siteWith({ extensionToShikiLanguage: mapping });
    const extensions = getExtensionToShikiLanguage(site);
    expect(extensions['__proto__']).toBe('text');
    expect(
      getSourceRenderKind(
        'example.__proto__',
        'content',
        getProcessedExts(Object.keys(extensions)),
        true,
      ),
    ).toBe('code-page');
    expect(Object.hasOwn(site.extensionToShikiLanguage!, '__proto__')).toBe(
      true,
    );
    expect(JSON.stringify(site.extensionToShikiLanguage)).toBe(
      '{"__proto__":"text"}',
    );
  });

  test('returns undefined when extensionToShikiLanguage is omitted', () => {
    expect(
      validateExtensionToShikiLanguage(undefined, 'site.dev.json'),
    ).toBeUndefined();
  });

  test('returns bundled language ids unchanged', () => {
    expect(
      validateExtensionToShikiLanguage(
        { java: 'java', ts: 'ts', text: 'text' },
        'site.dev.json',
      ),
    ).toEqual({ java: 'java', ts: 'ts', text: 'text' });
  });

  test('throws for unsupported shiki language ids', () => {
    expect(() =>
      validateExtensionToShikiLanguage(
        { foo: 'not-a-language' },
        'site.dev.json',
      ),
    ).toThrow(
      'site.dev.json: extensionToShikiLanguage.foo "not-a-language" is not a supported Shiki language',
    );
  });
});

describe('validateShikiLanguages', () => {
  test('returns undefined when shikiLanguages is omitted', () => {
    expect(validateShikiLanguages(undefined, 'site.dev.json')).toBeUndefined();
  });

  test('returns bundled shiki languages unchanged', () => {
    expect(validateShikiLanguages(['java', 'python'], 'site.dev.json')).toEqual(
      ['java', 'python'],
    );
  });

  test('rejects plain-text aliases', () => {
    expect(() => validateShikiLanguages(['text'], 'site.dev.json')).toThrow(
      'site.dev.json: shikiLanguages[0] "text" must be a bundled Shiki language',
    );
  });

  test('rejects non-string entries', () => {
    expect(() => validateShikiLanguages([123], 'site.dev.json')).toThrow(
      'site.dev.json: shikiLanguages[0] must be a string',
    );
  });

  test('rejects unsupported shiki language ids', () => {
    expect(() =>
      validateShikiLanguages(['not-a-language'], 'site.dev.json'),
    ).toThrow(
      'site.dev.json: shikiLanguages[0] "not-a-language" is not a supported Shiki language',
    );
  });
});

function siteWith(overrides: Partial<SiteVariables>): SiteVariables {
  return {
    base: 'https://example.edu',
    basePath: '/',
    title: 'Test',
    titlePostfix: ' - Test',
    themeColor: 'tomato',
    defaultTimeZone: 'America/New_York',
    features: { search: true, favicon: true, footer: true, pickers: true },
    ...overrides,
  };
}

describe('getExtensionToShikiLanguage', () => {
  test('matches extension keys case-insensitively without changing author variables', () => {
    const mapping = Object.freeze({
      TS: 'typescript',
      Py: 'python',
      TXT: 'text',
    } as const);
    const site = siteWith({ extensionToShikiLanguage: mapping });

    expect(getExtensionToShikiLanguage(site)).toEqual({
      ts: 'typescript',
      py: 'python',
      txt: 'text',
    });
    expect(site.extensionToShikiLanguage).toBe(mapping);
    expect(site.extensionToShikiLanguage).toEqual(mapping);
    expect(getRuntimeBundledShikiLanguages(site)).toEqual([
      'typescript',
      'python',
    ]);
  });

  test.each([
    { ts: 'typescript', TS: 'text' },
    { TS: 'text', ts: 'typescript' },
  ] as const)(
    'preserves an existing lowercase mapping regardless of alias order: %j',
    mapping => {
      expect(
        getExtensionToShikiLanguage(
          siteWith({ extensionToShikiLanguage: mapping }),
        ),
      ).toEqual({ ts: 'typescript' });
    },
  );

  test('returns an empty mapping when omitted', () => {
    expect(getExtensionToShikiLanguage(siteWith({}))).toEqual({});
  });

  test('uses only configured lowercase aliases when choosing precedence', () => {
    expect(
      getExtensionToShikiLanguage(
        siteWith({ extensionToShikiLanguage: { CONSTRUCTOR: 'text' } }),
      )['constructor'],
    ).toBe('text');
  });

  test('uses the last case alias when no lowercase key is configured', () => {
    expect(
      getExtensionToShikiLanguage(
        siteWith({
          extensionToShikiLanguage: { TS: 'typescript', Ts: 'text' },
        }),
      ),
    ).toEqual({ ts: 'text' });
  });

  test('keeps every configured bundled language available for Markdown fences', () => {
    const site = siteWith({
      extensionToShikiLanguage: { ts: 'typescript', TS: 'python' },
    });
    expect(getExtensionToShikiLanguage(site)).toEqual({ ts: 'typescript' });
    expect(getRuntimeBundledShikiLanguages(site)).toEqual([
      'typescript',
      'python',
    ]);
  });
});

describe('resolveFaviconSymbol', () => {
  test('derives faviconSymbol from a text symbol', () => {
    const site = siteWith({ symbol: 'CS 0' });
    resolveFaviconSymbol(site, 'site.dev.yaml');
    expect(site.faviconSymbol).toBe('CS 0');
  });

  test('keeps an explicit faviconSymbol alongside an emoji symbol', () => {
    const site = siteWith({ symbol: '🚀', faviconSymbol: 'CS 0' });
    resolveFaviconSymbol(site, 'site.dev.yaml');
    expect(site.faviconSymbol).toBe('CS 0');
  });

  test('requires faviconSymbol when an emoji symbol would be a generated favicon', () => {
    expect(() =>
      resolveFaviconSymbol(siteWith({ symbol: '🚀' }), 'site.dev.yaml'),
    ).toThrow(
      'site.dev.yaml: faviconSymbol is required when symbol is an emoji',
    );
  });

  test('allows an emoji symbol alone when favicons are not generated', () => {
    const disabled = siteWith({
      symbol: '🚀',
      features: { search: true, favicon: false, footer: true, pickers: true },
    });
    const custom = siteWith({ symbol: '🚀', favicon: 'brand/icon.ico' });
    for (const site of [disabled, custom]) {
      expect(() => resolveFaviconSymbol(site, 'site.dev.yaml')).not.toThrow();
      expect(site.faviconSymbol).toBeUndefined();
    }
  });
});

describe('site config schema', () => {
  test('accepts a nested base path', () => {
    const validator = compile(siteSchema);

    expect(() =>
      doValidation(
        validator,
        {
          base: 'https://example.edu',
          basePath: '/old/26summer',
          title: 'Test',
          defaultTimeZone: 'America/New_York',
          themeColor: 'tomato',
        },
        'site.prod.yaml',
      ),
    ).not.toThrow();
  });

  test('accepts a Markdown banner string', () => {
    const validator = compile(siteSchema);

    expect(() =>
      doValidation(
        validator,
        {
          base: 'https://example.edu',
          title: 'Test',
          defaultTimeZone: 'America/New_York',
          themeColor: 'tomato',
          banner: '**Scheduled maintenance** tonight.',
        },
        'site.dev.json',
      ),
    ).not.toThrow();
  });

  test('rejects a non-string banner', () => {
    const validator = compile(siteSchema);

    expect(() =>
      doValidation(
        validator,
        {
          base: 'https://example.edu',
          title: 'Test',
          defaultTimeZone: 'America/New_York',
          themeColor: 'tomato',
          banner: ['Scheduled maintenance'],
        },
        'site.dev.json',
      ),
    ).toThrow('/banner: must be string');
  });

  test('accepts configurable appearance defaults', () => {
    const validator = compile(siteSchema);

    expect(() =>
      doValidation(
        validator,
        {
          base: 'https://example.edu',
          title: 'Test',
          defaultTimeZone: 'America/New_York',
          themeColor: 'tomato',
          defaultFont: 'serif',
          defaultContrast: 'high',
        },
        'site.dev.json',
      ),
    ).not.toThrow();
  });

  test.each([true, false])('accepts features.pickers=%s', pickers => {
    const validator = compile(siteSchema);

    expect(() =>
      doValidation(
        validator,
        {
          base: 'https://example.edu',
          title: 'Test',
          defaultTimeZone: 'America/New_York',
          themeColor: 'tomato',
          features: { pickers },
        },
        'site.dev.json',
      ),
    ).not.toThrow();
  });

  test('rejects a non-boolean features.pickers value', () => {
    const validator = compile(siteSchema);

    expect(() =>
      doValidation(
        validator,
        {
          base: 'https://example.edu',
          title: 'Test',
          defaultTimeZone: 'America/New_York',
          themeColor: 'tomato',
          features: { pickers: 'yes' },
        },
        'site.dev.json',
      ),
    ).toThrow('/features/pickers: must be boolean');
  });

  test('accepts structured serif font overrides', () => {
    const validator = compile(siteSchema);

    expect(() =>
      doValidation(
        validator,
        {
          base: 'https://example.edu',
          title: 'Test',
          defaultTimeZone: 'America/New_York',
          themeColor: 'tomato',
          fontOverrides: {
            serif: {
              regular: 'fonts/body-regular.woff2',
              italic: 'fonts/body-italic.woff2',
              bold: 'fonts/body-bold.woff2',
              boldItalic: 'fonts/body-bold-italic.woff2',
              tuning: {
                scale: 1.125,
                lineHeight: 1.5,
                headingScale: 0.9,
                headingWeight: 400,
                fontSizeAdjust: 0.67,
              },
            },
            serifMono: {
              regular: 'fonts/mono-regular.woff2',
              features: ['ss02'],
              tuning: { scale: 0.96, lineHeight: 1.45, fontSizeAdjust: 0.613 },
            },
          },
        },
        'site.dev.json',
      ),
    ).not.toThrow();
  });

  test('accepts tuning alone for both bundled serif families', () => {
    expect(() =>
      doValidation(
        compile(siteSchema),
        {
          base: 'https://example.edu',
          title: 'Test',
          defaultTimeZone: 'America/New_York',
          themeColor: 'tomato',
          fontOverrides: {
            serif: { tuning: { scale: 1.1 } },
            serifMono: { tuning: { scale: 0.85 } },
          },
        },
        'site.dev.json',
      ),
    ).not.toThrow();
  });

  test.each([
    [{ serif: {} }, 'required property'],
    [{ serifMono: { tuning: { scale: 0.5 } } }, 'must be >= 0.75'],
    [
      { serifMono: { features: ['ss02'], tuning: { scale: 0.9 } } },
      'required property',
    ],
    [
      { serif: { italic: 'fonts/body.woff2', tuning: { scale: 1.1 } } },
      'required property',
    ],
    [{ serif: { italic: 'fonts/body-italic.woff2' } }, 'required property'],
    [
      { serif: { regular: 'fonts/body.otf' } },
      'must match pattern "\\.woff2$"',
    ],
    [
      { serifMono: { regular: 'fonts/mono.woff2', features: ['ss2'] } },
      'must match pattern "^[A-Za-z0-9]{4}$"',
    ],
    [
      {
        serifMono: { regular: 'fonts/mono.woff2', features: ['ss02', 'ss02'] },
      },
      'must NOT have duplicate items',
    ],
    [
      { serif: { regular: 'fonts/body.woff2', tuning: { scale: 0.5 } } },
      'must be >= 0.75',
    ],
    [
      { serif: { regular: 'fonts/body.woff2', tuning: { fontSizeAdjust: 0 } } },
      'must be > 0',
    ],
    [
      {
        serifMono: {
          regular: 'fonts/mono.woff2',
          tuning: { fontSizeAdjust: -0.1 },
        },
      },
      'must be > 0',
    ],
    [
      {
        serif: {
          regular: 'fonts/body.woff2',
          tuning: { fontSizeAdjust: '0.67' },
        },
      },
      'must be number',
    ],
    [
      {
        serif: {
          regular: 'fonts/body.woff2',
          tuning: { fontSizeAdjust: Number.POSITIVE_INFINITY },
        },
      },
      'must be number',
    ],
    [
      {
        serifMono: {
          regular: 'fonts/mono.woff2',
          tuning: { fontSizeAdjust: Number.NaN },
        },
      },
      'must be number',
    ],
    [
      {
        serif: { regular: 'fonts/body.woff2', tuning: { headingWeight: 450 } },
      },
      'must be equal to one of the allowed values',
    ],
    [
      {
        serifMono: {
          regular: 'fonts/mono.woff2',
          tuning: { headingScale: 0.9 },
        },
      },
      'unknown property "headingScale"',
    ],
  ])('rejects invalid font overrides', (fontOverrides, message) => {
    const validator = compile(siteSchema);

    expect(() =>
      doValidation(
        validator,
        {
          base: 'https://example.edu',
          title: 'Test',
          defaultTimeZone: 'America/New_York',
          themeColor: 'tomato',
          fontOverrides,
        },
        'site.dev.json',
      ),
    ).toThrow(message);
  });

  test.each([
    ['defaultFont', 'comic'],
    ['defaultContrast', 'low'],
  ])('rejects unsupported %s values', (key, value) => {
    const validator = compile(siteSchema);

    expect(() =>
      doValidation(
        validator,
        {
          base: 'https://example.edu',
          title: 'Test',
          defaultTimeZone: 'America/New_York',
          themeColor: 'tomato',
          [key]: value,
        },
        'site.dev.json',
      ),
    ).toThrow(`/${key}: must be equal to one of the allowed values`);
  });

  test('rejects legacy codeLanguages', () => {
    const validator = compile(siteSchema);

    expect(() =>
      doValidation(
        validator,
        {
          base: 'https://example.edu',
          title: 'Test',
          defaultTimeZone: 'America/New_York',
          themeColor: 'tomato',
          codeLanguages: { java: 'java' },
        },
        'site.dev.json',
      ),
    ).toThrow('unknown property "codeLanguages"');
  });

  test('rejects legacy features.code', () => {
    const validator = compile(siteSchema);

    expect(() =>
      doValidation(
        validator,
        {
          base: 'https://example.edu',
          title: 'Test',
          defaultTimeZone: 'America/New_York',
          themeColor: 'tomato',
          features: { search: true, code: true },
        },
        'site.dev.json',
      ),
    ).toThrow('unknown property "code"');
  });
});
