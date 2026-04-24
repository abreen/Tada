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
});
