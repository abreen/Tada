import { expect, test } from 'bun:test';
import path from 'path';
import { validateBranding } from './branding';

const publicDir = path.resolve('site', 'public');
const publicFile = (...segments: string[]) => path.join(publicDir, ...segments);
const validate = (
  site: { logo?: string; favicon?: string },
  files: string[] = [],
) =>
  validateBranding(site, {
    publicDir,
    publicFiles: new Set(files),
    readFile: () => Buffer.from('asset'),
  });

test('accepts optional and nested branding assets without decoding', () => {
  expect(validate({})).toEqual([]);
  expect(
    validate({ logo: 'brand/my logo.svg', favicon: 'brand/icon.ico' }, [
      publicFile('brand', 'my logo.svg'),
      publicFile('brand', 'icon.ico'),
    ]),
  ).toEqual([]);
});

for (const value of [
  '',
  '/logo.svg',
  'C:/logo.svg',
  'a\\b.svg',
  'a//b.svg',
  '../b.svg',
  'a/./b.svg',
  'a.svg?q',
  'a.svg#x',
]) {
  test(`rejects unsafe branding path ${value}`, () => {
    expect(validate({ logo: value })[0]).toContain('logo');
  });
}

test('requires ICO and reports missing and unreadable assets', () => {
  expect(validate({ favicon: 'icon.png' })[0]).toContain('.ico');
  expect(validate({ logo: 'missing.svg' })[0]).toContain(
    'logo "missing.svg" does not exist',
  );
  expect(
    validateBranding(
      { favicon: 'icon.ico' },
      {
        publicDir,
        publicFiles: new Set([publicFile('icon.ico')]),
        readFile: () => {
          throw new Error('unreadable');
        },
      },
    )[0],
  ).toContain('favicon "icon.ico" could not be read');
});

test('schema accepts optional strings and rejects other types', async () => {
  const { compile } = await import('./json-schema');
  const { default: schema } = await import('../schema/site.schema.json');
  const validator = compile(schema);
  const config = {
    base: 'https://example.com',
    title: 'Test',
    defaultTimeZone: 'UTC',
    themeColor: 'tomato',
  };
  expect(validator(config)).toBe(true);
  expect(
    validator({ ...config, logo: 'brand/logo.svg', favicon: 'brand/icon.ico' }),
  ).toBe(true);
  for (const field of ['logo', 'favicon']) {
    for (const value of [1, null, [], {}]) {
      expect(validator({ ...config, [field]: value })).toBe(false);
    }
  }
});
