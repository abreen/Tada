import { describe, expect, test } from 'bun:test';
import {
  parseConfigText,
  resolveProjectConfigExpressions,
} from './config-loader';

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

describe('resolveProjectConfigExpressions', () => {
  const site = {
    title: 'CS 22',
    vars: { course: 'CSCI E-22', sections: ['one', 'two'] },
  } as never;

  test('resolves brace expressions recursively and preserves values', () => {
    expect(
      resolveProjectConfigExpressions(
        [{ label: '{site.title}: {vars.course}', sections: '{vars.sections}' }],
        site,
        'nav.yaml',
      ),
    ).toEqual([{ label: 'CS 22: CSCI E-22', sections: ['one', 'two'] }]);
  });

  test('does not process legacy Lodash expressions', () => {
    expect(
      resolveProjectConfigExpressions(
        '<%= site.title %>',
        site,
        'authors.yaml',
      ),
    ).toBe('<%= site.title %>');
  });
});
