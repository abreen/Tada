import { describe, expect, test } from 'bun:test';
import { resolveStructuredExpressions } from './structured-expressions';

const context = {
  site: { title: 'CS 22', features: { search: true } },
  vars: { code: 'CSCI E-22', sections: ['one', 'two'] },
};

describe('resolveStructuredExpressions', () => {
  test('interpolates site and vars properties into strings', () => {
    expect(
      resolveStructuredExpressions(
        'Welcome to {site.title}: {vars.code}',
        context,
        'page.md',
      ),
    ).toBe('Welcome to CS 22: CSCI E-22');
  });

  test('preserves the type of a whole-value expression', () => {
    expect(
      resolveStructuredExpressions('{site.features}', context, 'page.md'),
    ).toEqual({ search: true });
    expect(
      resolveStructuredExpressions('{vars.sections}', context, 'page.md'),
    ).toEqual(['one', 'two']);
  });

  test('resolves expressions recursively in arrays and objects', () => {
    expect(
      resolveStructuredExpressions(
        { title: '{site.title}', links: [{ label: 'Course {vars.code}' }] },
        context,
        'nav.yaml',
      ),
    ).toEqual({ title: 'CS 22', links: [{ label: 'Course CSCI E-22' }] });
  });

  test('leaves braces with unsupported roots untouched', () => {
    expect(
      resolveStructuredExpressions(
        'JavaScript: ${name}; MDX: {page.title}',
        context,
        'page.md',
      ),
    ).toBe('JavaScript: ${name}; MDX: {page.title}');
  });

  test('reports missing properties with the declaring file', () => {
    expect(() =>
      resolveStructuredExpressions('{vars.missing}', context, 'nav.yaml'),
    ).toThrow('nav.yaml: unknown expression "vars.missing"');
  });

  test('rejects object values embedded in surrounding text', () => {
    expect(() =>
      resolveStructuredExpressions(
        'Features: {site.features}',
        context,
        'page.md',
      ),
    ).toThrow('page.md: expression "site.features" cannot be embedded in text');
  });

  test('preserves non-plain YAML values such as dates', () => {
    const published = new Date('2026-03-20T00:00:00.000Z');
    expect(
      resolveStructuredExpressions({ published }, context, 'page.md'),
    ).toEqual({ published });
  });
});
