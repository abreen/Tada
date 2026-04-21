import { describe, expect, test } from 'bun:test';
import { validateCodeLanguages } from './site-variables';

describe('validateCodeLanguages', () => {
  test('returns undefined when codeLanguages is omitted', () => {
    expect(validateCodeLanguages(undefined, 'site.dev.json')).toBeUndefined();
  });

  test('returns bundled language ids unchanged', () => {
    expect(
      validateCodeLanguages(
        { java: 'java', ts: 'ts', text: 'text' },
        'site.dev.json',
      ),
    ).toEqual({ java: 'java', ts: 'ts', text: 'text' });
  });

  test('throws for unsupported shiki language ids', () => {
    expect(() =>
      validateCodeLanguages({ foo: 'not-a-language' }, 'site.dev.json'),
    ).toThrow(
      'site.dev.json: codeLanguages.foo "not-a-language" is not a supported Shiki language',
    );
  });
});
