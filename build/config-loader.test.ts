import { describe, expect, test } from 'bun:test';
import { interpolateConfigValue, parseConfigText } from './config-loader';

describe('parseConfigText', () => {
  test('parses YAML objects', () => {
    expect(
      parseConfigText(
        [
          'title: Intro to Computer Science',
          'features:',
          '  search: true',
        ].join('\n'),
        'site.dev.yaml',
      ),
    ).toEqual({
      title: 'Intro to Computer Science',
      features: { search: true },
    });
  });

  test('parses legacy JSON objects', () => {
    expect(
      parseConfigText(
        JSON.stringify({ title: 'Intro to Computer Science' }),
        'site.dev.json',
      ),
    ).toEqual({ title: 'Intro to Computer Science' });
  });

  test('parses JSON surrogate pair escapes', () => {
    const text =
      '{"symbol": "' +
      String.fromCharCode(92) +
      'ud83c' +
      String.fromCharCode(92) +
      'udf89"}';
    expect(parseConfigText(text, 'site.dev.json')).toEqual({ symbol: '🎉' });
  });

  test('names the file in JSON syntax errors', () => {
    expect(() => parseConfigText('{"title": ', 'site.dev.json')).toThrow(
      'site.dev.json: ',
    );
  });
});

describe('interpolateConfigValue', () => {
  const vars = { courseName: 'Intro to CS', term: { year: 2026 } };

  test('substitutes site variables in nested string values', () => {
    expect(
      interpolateConfigValue(
        [
          { title: 'Welcome to {{ courseName }}', count: 3 },
          { links: [{ text: 'Fall {{ term.year }}', external: true }] },
        ],
        vars,
        'nav.yaml',
      ),
    ).toEqual([
      { title: 'Welcome to Intro to CS', count: 3 },
      { links: [{ text: 'Fall 2026', external: true }] },
    ]);
  });

  test('keeps a whole-value variable as a string', () => {
    expect(interpolateConfigValue('{{ term.year }}', vars, 'nav.yaml')).toBe(
      '2026',
    );
  });

  test('leaves Lodash template syntax as literal text', () => {
    expect(interpolateConfigValue('<%= site.title %>', vars, 'nav.yaml')).toBe(
      '<%= site.title %>',
    );
  });

  test('names the config file for an unknown variable', () => {
    expect(() =>
      interpolateConfigValue({ title: '{{ missing }}' }, vars, 'nav.yaml'),
    ).toThrow('nav.yaml: unknown variable "{{ missing }}"');
  });
});
