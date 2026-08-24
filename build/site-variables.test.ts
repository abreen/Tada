import { describe, expect, test } from 'bun:test';
import { compile, doValidation } from './json-schema';
import {
  validateExtensionToShikiLanguage,
  validateShikiLanguages,
} from './site-variables';
import siteSchema from '../schema/site.schema.json' with { type: 'json' };

describe('validateExtensionToShikiLanguage', () => {
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

describe('site config schema', () => {
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

  test.each([
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
