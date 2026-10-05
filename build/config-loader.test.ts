import { describe, expect, test } from 'bun:test';
import { parseConfigText } from './config-loader';

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
        JSON.stringify({
          title: 'Intro to Computer Science',
          defaultTimeZone: 'America/New_York',
        }),
        'site.dev.json',
      ),
    ).toEqual({
      title: 'Intro to Computer Science',
      defaultTimeZone: 'America/New_York',
    });
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
