import { describe, expect, test } from 'bun:test';
import fs from 'fs';
import path from 'path';
import _ from 'lodash';

const TOP_TEMPLATE = fs.readFileSync(
  path.join(import.meta.dir, '_top.html'),
  'utf-8',
);

function renderTop(
  defaultFont: 'sans' | 'serif',
  defaultContrast: 'standard' | 'high',
) {
  return _.template(TOP_TEMPLATE)({
    site: {
      defaultFont,
      defaultContrast,
      features: { favicon: false, search: false },
      title: 'Test site',
      titlePostfix: ' - Test site',
    },
    page: { title: 'Page', template: 'default' },
    tadaVersion: '0.0.0',
    isWatchMode: true,
    speculationRulesHrefMatches: '/*',
    render: () => '',
  });
}

describe('_top.html template', () => {
  test('renders sans and standard defaults without effective state attributes', () => {
    const html = renderTop('sans', 'standard');
    const openingTag = html.match(/<html[^>]*>/)?.[0];

    expect(openingTag).toContain('data-default-font-preference="sans"');
    expect(openingTag).toContain('data-default-contrast-preference="standard"');
    expect(openingTag).not.toContain(' data-font-preference=');
    expect(openingTag).not.toContain(' data-contrast-preference=');
  });

  test('renders serif and high contrast as effective build-time defaults', () => {
    const html = renderTop('serif', 'high');
    const openingTag = html.match(/<html[^>]*>/)?.[0];

    expect(openingTag).toContain('data-default-font-preference="serif"');
    expect(openingTag).toContain('data-default-contrast-preference="high"');
    expect(openingTag).toContain('data-font-preference="serif"');
    expect(openingTag).toContain('data-contrast-preference="high"');
  });
});
