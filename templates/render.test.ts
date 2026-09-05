import {
  afterEach,
  beforeEach,
  describe,
  expect,
  mock,
  spyOn,
  test,
} from 'bun:test';
import path from 'path';
import HEADING from './_heading.html' with { type: 'text' };
import AUTHOR from './_author.html' with { type: 'text' };
import * as configLoader from '../build/config-loader';
import createTemplateGlobals from '../build/template-globals';
import type { SiteVariables } from '../build/types';

const site = { defaultTimeZone: 'America/New_York' } as SiteVariables;
const templateSources: Record<string, string> = {
  '_heading.html': HEADING,
  '_author.html': AUTHOR,
};
mock.module('fs', () => ({
  default: {
    readdirSync: () => Object.keys(templateSources),
    readFileSync: (file: string) => templateSources[path.basename(file)]!,
  },
}));
const { compileTemplates, render } = await import('../build/templates');
let restore: () => void;

function heading(page: Record<string, unknown>) {
  return render('_heading.html', {
    page: { titleHtml: 'Recovered heading', ...page },
    ...createTemplateGlobals(page, site, 'index'),
  });
}

beforeEach(() => {
  // Only read package HTML templates; project configuration is irrelevant here.
  const loadConfig = spyOn(configLoader, 'loadProjectConfig').mockReturnValue(
    undefined,
  );
  restore = () => loadConfig.mockRestore();
  compileTemplates(site, true);
});

afterEach(() => restore());

describe('template render failures', () => {
  test('throws and identifies a top-level error on every attempt', () => {
    for (let attempt = 0; attempt < 3; attempt++) {
      expect(() => heading({ published: 'not-a-date' })).toThrow(
        'Render error in _heading.html:',
      );
    }
  });

  test('propagates nested failures across retries and recompilation', () => {
    for (let attempt = 0; attempt < 3; attempt++) {
      if (attempt === 2) {
        compileTemplates(site, true);
      }
      expect(() => heading({ author: { url: '\ud800' } })).toThrow(
        'Render error in _author.html:',
      );
    }
  });

  test('recovers cleanly and attributes the next failure to its own template', () => {
    expect(() => heading({ author: { url: '\ud800' } })).toThrow(
      'Render error in _author.html:',
    );
    expect(heading({ published: '2026-09-05' })).toContain('Recovered heading');
    expect(() => heading({ published: 'not-a-date' })).toThrow(
      'Render error in _heading.html:',
    );
    expect(heading({})).toContain('Recovered heading');
  });
});
