import path from 'path';

export type SiteEnv = 'dev' | 'prod';

export const SITE_DEV_CONFIG_FILE = 'site.dev.json';
export const SITE_PROD_CONFIG_FILE = 'site.prod.json';
export const NAV_JSON_FILE = 'nav.json';
export const AUTHORS_JSON_FILE = 'authors.json';

export const REQUIRED_PROJECT_DATA_FILES = [NAV_JSON_FILE];
export const OPTIONAL_PROJECT_DATA_FILES = [AUTHORS_JSON_FILE];
export const PROJECT_DATA_FILES = [
  ...REQUIRED_PROJECT_DATA_FILES,
  ...OPTIONAL_PROJECT_DATA_FILES,
];

export function getSiteConfigFile(env: SiteEnv): string {
  return env === 'dev' ? SITE_DEV_CONFIG_FILE : SITE_PROD_CONFIG_FILE;
}

export function getSiteConfigPath(projectDir: string, env: SiteEnv): string {
  return path.join(projectDir, getSiteConfigFile(env));
}

export function getProjectDataFilePath(
  projectDir: string,
  fileName: string,
): string {
  return path.join(projectDir, fileName);
}
