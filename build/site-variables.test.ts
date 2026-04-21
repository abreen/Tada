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
