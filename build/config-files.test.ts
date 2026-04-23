import path from 'path';
import { describe, expect, test } from 'bun:test';
import {
  AUTHORS_JSON_FILE,
  NAV_JSON_FILE,
  OPTIONAL_PROJECT_DATA_FILES,
  PROJECT_DATA_FILES,
  REQUIRED_PROJECT_DATA_FILES,
  SITE_DEV_CONFIG_FILE,
  SITE_PROD_CONFIG_FILE,
  getProjectDataFilePath,
  getSiteConfigFile,
  getSiteConfigPath,
} from './config-files';

describe('config-files', () => {
  test('exports canonical project config and data filenames', () => {
    expect(SITE_DEV_CONFIG_FILE).toBe('site.dev.json');
    expect(SITE_PROD_CONFIG_FILE).toBe('site.prod.json');
    expect(NAV_JSON_FILE).toBe('nav.json');
    expect(AUTHORS_JSON_FILE).toBe('authors.json');
    expect(REQUIRED_PROJECT_DATA_FILES).toEqual(['nav.json']);
    expect(OPTIONAL_PROJECT_DATA_FILES).toEqual(['authors.json']);
    expect(PROJECT_DATA_FILES).toEqual(['nav.json', 'authors.json']);
  });

  test('resolves site config filename by environment', () => {
    expect(getSiteConfigFile('dev')).toBe('site.dev.json');
    expect(getSiteConfigFile('prod')).toBe('site.prod.json');
  });

  test('builds project-relative config and data file paths', () => {
    const projectDir = path.join(path.sep, 'tmp', 'example-site');

    expect(getSiteConfigPath(projectDir, 'dev')).toBe(
      path.join(projectDir, 'site.dev.json'),
    );
    expect(getSiteConfigPath(projectDir, 'prod')).toBe(
      path.join(projectDir, 'site.prod.json'),
    );
    expect(getProjectDataFilePath(projectDir, NAV_JSON_FILE)).toBe(
      path.join(projectDir, 'nav.json'),
    );
    expect(getProjectDataFilePath(projectDir, AUTHORS_JSON_FILE)).toBe(
      path.join(projectDir, 'authors.json'),
    );
  });
});
