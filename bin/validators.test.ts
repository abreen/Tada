import { describe, expect, test } from 'bun:test';
import type { SiteConfigInput } from '../build/types.js';
import {
  validateSymbol,
  validateColor,
  validateHue,
  validateUrl,
  validateBasePath,
  createSiteConfig,
} from './validators.js';

describe('validateSymbol', () => {
  test('accepts a single uppercase letter', () => {
    expect(validateSymbol('A')).toBeNull();
  });

  test('accepts digits and uppercase letters up to 5 chars', () => {
    expect(validateSymbol('CS 0')).toBeNull();
    expect(validateSymbol('CS101')).toBeNull();
    expect(validateSymbol('AB-CD')).toBeNull();
  });

  test('rejects empty string', () => {
    expect(validateSymbol('')).not.toBeNull();
  });

  test('rejects value longer than 5 chars', () => {
    expect(validateSymbol('TOOLONG')).not.toBeNull();
  });

  test('rejects lowercase letters', () => {
    expect(validateSymbol('abc')).not.toBeNull();
  });

  test('rejects special characters', () => {
    expect(validateSymbol('A@B')).not.toBeNull();
    expect(validateSymbol('A.B')).not.toBeNull();
  });
});

describe('validateColor', () => {
  test('accepts CSS color names', () => {
    expect(validateColor('red')).toBeNull();
    expect(validateColor('tomato')).toBeNull();
    expect(validateColor('blue')).toBeNull();
  });

  test('accepts hex colors', () => {
    expect(validateColor('#f00')).toBeNull();
    expect(validateColor('#ff0000')).toBeNull();
    expect(validateColor('#c04040')).toBeNull();
  });

  test('accepts HSL colors', () => {
    expect(validateColor('hsl(195 70% 40%)')).toBeNull();
    expect(validateColor('hsl(195, 70%, 40%)')).toBeNull();
    expect(validateColor('hsl(195deg 70% 40%)')).toBeNull();
  });

  test('accepts RGB colors', () => {
    expect(validateColor('rgb(0 0 0)')).toBeNull();
    expect(validateColor('rgb(255, 99, 71)')).toBeNull();
  });

  test('rejects empty string', () => {
    expect(validateColor('')).not.toBeNull();
  });

  test('rejects invalid color strings', () => {
    expect(validateColor('notacolor')).not.toBeNull();
    expect(validateColor('hsl 195 70% 40%')).not.toBeNull();
  });
});

describe('validateHue', () => {
  test('accepts integer', () => {
    expect(validateHue('0')).toBeNull();
    expect(validateHue('180')).toBeNull();
    expect(validateHue('360')).toBeNull();
  });

  test('accepts integer with deg suffix', () => {
    expect(validateHue('90deg')).toBeNull();
    expect(validateHue('360deg')).toBeNull();
  });

  test('rejects empty string', () => {
    expect(validateHue('')).not.toBeNull();
  });

  test('rejects out of range', () => {
    expect(validateHue('-1')).not.toBeNull();
    expect(validateHue('361')).not.toBeNull();
  });

  test('rejects non-integer', () => {
    expect(validateHue('1.5')).not.toBeNull();
    expect(validateHue('abc')).not.toBeNull();
  });
});

describe('validateUrl', () => {
  test('accepts https URL', () => {
    expect(validateUrl('https://example.edu')).toBeNull();
  });

  test('accepts http URL', () => {
    expect(validateUrl('http://localhost')).toBeNull();
  });

  test('accepts URL with port', () => {
    expect(validateUrl('http://localhost:8080')).toBeNull();
  });

  test('rejects empty string', () => {
    expect(validateUrl('')).not.toBeNull();
  });

  test('rejects trailing slash', () => {
    expect(validateUrl('https://example.edu/')).not.toBeNull();
  });

  test('rejects URL with path', () => {
    expect(validateUrl('https://example.edu/foo')).not.toBeNull();
  });

  test('rejects non-http scheme', () => {
    expect(validateUrl('ftp://example.edu')).not.toBeNull();
  });

  test('rejects bare domain', () => {
    expect(validateUrl('example.edu')).not.toBeNull();
  });
});

describe('validateBasePath', () => {
  test('accepts root path', () => {
    expect(validateBasePath('/')).toBeNull();
  });

  test('accepts simple path segment', () => {
    expect(validateBasePath('/foo')).toBeNull();
    expect(validateBasePath('/foo-bar')).toBeNull();
    expect(validateBasePath('/cs101')).toBeNull();
  });

  test('rejects path without leading slash', () => {
    expect(validateBasePath('foo')).not.toBeNull();
  });

  test('rejects trailing slash', () => {
    expect(validateBasePath('/foo/')).not.toBeNull();
  });

  test('rejects spaces', () => {
    expect(validateBasePath('/foo bar')).not.toBeNull();
  });

  test('rejects nested paths', () => {
    expect(validateBasePath('/foo/bar')).not.toBeNull();
  });
});

describe('createSiteConfig', () => {
  const base: SiteConfigInput = {
    title: 'Test Site',
    symbol: 'TS',
    themeColor: 'hsl(200 50% 40%)',
    tintHue: '20',
    tintAmount: '100',
    defaultTimeZone: 'America/New_York',
    base: 'https://example.edu',
    basePath: '/',
    internalDomains: ['example.edu'],
  };

  test('returns an object with all expected keys', () => {
    const config = createSiteConfig(base);
    expect(config).toMatchObject({
      title: 'Test Site',
      symbol: 'TS',
      themeColor: 'hsl(200 50% 40%)',
      base: 'https://example.edu',
      basePath: '/',
      internalDomains: ['example.edu'],
      defaultTimeZone: 'America/New_York',
      features: { search: true, code: true, favicon: true },
      codeLanguages: { java: 'java', py: 'python' },
      vars: {},
    });
  });

  test('coerces tintHue and tintAmount to numbers', () => {
    const config = createSiteConfig(base);
    expect(config.tintHue).toBe(20);
    expect(config.tintAmount).toBe(100);
  });

  test('coerces numeric string tintHue correctly', () => {
    const config = createSiteConfig({ ...base, tintHue: '0', tintAmount: '0' });
    expect(config.tintHue).toBe(0);
    expect(config.tintAmount).toBe(0);
  });
});
