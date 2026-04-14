import { describe, expect, test } from 'bun:test';
import { applySourceTemplate } from './utils/source-template';
import type { SiteVariables } from './types';

const siteVariables = {
  base: 'https://example.edu',
  basePath: '/course',
  title: 'My Course',
  titlePostfix: ' - My Course',
  themeColor: 'steelblue',
  defaultTimeZone: 'America/New_York',
  internalDomains: [],
  codeLanguages: { java: 'java', py: 'python' },
  features: { search: true, code: true, favicon: true, footer: true },
  vars: { fullCourseName: 'CS 0, Intro to CS' },
} as SiteVariables;

describe('applySourceTemplate', () => {
  test('substitutes vars.* into the source', () => {
    const source = '# Supplied as part of <%= vars.fullCourseName %>.\n';
    const result = applySourceTemplate(source, siteVariables, 'test.py');
    expect(result).toBe('# Supplied as part of CS 0, Intro to CS.\n');
  });

  test('returns source unchanged when no template syntax is present', () => {
    const source = 'class Foo {}\n';
    const result = applySourceTemplate(source, siteVariables, 'Foo.java');
    expect(result).toBe('class Foo {}\n');
  });

  test('exposes site.title, site.base, and site.basePath', () => {
    const source =
      '/// <%= site.title %> @ <%= site.base %><%= site.basePath %>\n';
    const result = applySourceTemplate(source, siteVariables, 'Foo.java');
    expect(result).toBe('/// My Course @ https://example.edu/course\n');
  });

  test('treats missing vars as empty object', () => {
    const vars = { ...siteVariables, vars: undefined } as SiteVariables;
    const source = '<%= Object.keys(vars).length %>\n';
    const result = applySourceTemplate(source, vars, 'test.py');
    expect(result).toBe('0\n');
  });

  test('throws an error that includes the filePath on template failure', () => {
    const source = '<%= undefinedVariable %>\n';
    expect(() =>
      applySourceTemplate(source, siteVariables, 'broken.py'),
    ).toThrow(/broken\.py/);
  });

  test('preserves lines without template syntax', () => {
    const source = 'line1\nline2 <%= vars.fullCourseName %>\nline3\n';
    const result = applySourceTemplate(source, siteVariables, 'test.py');
    expect(result).toBe('line1\nline2 CS 0, Intro to CS\nline3\n');
  });
});
