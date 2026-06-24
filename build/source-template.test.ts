import { describe, expect, test } from 'bun:test';
import { applySourceExpressions } from './utils/source-template';
import type { SiteVariables } from './types';

const siteVariables = {
  base: 'https://example.edu',
  basePath: '/course',
  title: 'My Course',
  titlePostfix: ' - My Course',
  themeColor: 'steelblue',
  defaultTimeZone: 'America/New_York',
  internalDomains: [],
  extensionToShikiLanguage: { java: 'java', py: 'python' },
  shikiLanguages: ['java', 'python'],
  features: { search: true, favicon: true, footer: true },
  vars: { fullCourseName: 'CS 0, Intro to CS' },
} as SiteVariables;

describe('applySourceExpressions', () => {
  test('leaves ordinary source files byte-for-byte unchanged', () => {
    const source = '# {vars.fullCourseName}\nconst text = "${name}";\n';
    const result = applySourceExpressions(source, siteVariables, 'test.py');
    expect(result).toBe(source);
  });

  test('returns source unchanged when no template syntax is present', () => {
    const source = 'class Foo {}\n';
    const result = applySourceExpressions(source, siteVariables, 'Foo.java');
    expect(result).toBe('class Foo {}\n');
  });

  test('resolves site and vars expressions only in Java prose comments', () => {
    const source =
      '/// {site.title} @ {site.base}{site.basePath}: {vars.fullCourseName}\n' +
      'String literal = "{site.title}";\n';
    const result = applySourceExpressions(source, siteVariables, 'Foo.java');
    expect(result).toBe(
      '/// My Course @ https://example.edu/course: CS 0, Intro to CS\n' +
        'String literal = "{site.title}";\n',
    );
  });

  test('does not process legacy Lodash syntax in Java prose comments', () => {
    const source = '/// <%= vars.fullCourseName %>\n';
    expect(applySourceExpressions(source, siteVariables, 'Foo.java')).toBe(
      source,
    );
  });
});
