import fs from 'fs';
import path from 'path';

export type SiteEnv = 'dev' | 'prod';
export type SiteConfigName = 'site.dev' | 'site.prod';
export type ProjectConfigName = 'nav' | 'authors';
export type ConfigName = SiteConfigName | ProjectConfigName;
type ProjectConfigExtension = '.yaml' | '.yml' | '.json';

export interface ResolvedProjectConfigFile<
  Name extends ConfigName = ConfigName,
> {
  name: Name;
  baseName: string;
  fileName: string;
  filePath: string;
  extension: ProjectConfigExtension;
}

const CONFIG_FILE_EXTENSIONS = ['.yaml', '.yml', '.json'] as const;
const DEFAULT_CONFIG_FILE_EXTENSION = '.yaml' as const;

const SITE_CONFIG_BASE_NAMES = {
  dev: 'site.dev',
  prod: 'site.prod',
} as const satisfies Record<SiteEnv, SiteConfigName>;

const PROJECT_CONFIG_BASE_NAMES = {
  nav: 'nav',
  authors: 'authors',
} as const satisfies Record<ProjectConfigName, ProjectConfigName>;

export const PROJECT_CONFIG_NAMES = ['nav', 'authors'] as const;

function joinWithOr(items: string[]): string {
  if (items.length <= 1) {
    return items[0] ?? '';
  }
  if (items.length === 2) {
    return `${items[0]} or ${items[1]}`;
  }
  return `${items.slice(0, -1).join(', ')}, or ${items[items.length - 1]}`;
}

function getResolvedConfigExtension(fileName: string): ProjectConfigExtension {
  const ext = path.extname(fileName).toLowerCase();
  if (ext !== '.yaml' && ext !== '.yml' && ext !== '.json') {
    throw new Error(`Unsupported config file extension for ${fileName}`);
  }
  return ext;
}

export function getSiteConfigBaseName(env: SiteEnv): SiteConfigName {
  return SITE_CONFIG_BASE_NAMES[env];
}

export function getProjectConfigBaseName(
  name: ProjectConfigName,
): ProjectConfigName {
  return PROJECT_CONFIG_BASE_NAMES[name];
}

function getSupportedConfigFileNames(baseName: string): string[] {
  return CONFIG_FILE_EXTENSIONS.map(ext => `${baseName}${ext}`);
}

export function getSupportedConfigFilePaths(
  projectDir: string,
  baseName: string,
): string[] {
  return getSupportedConfigFileNames(baseName).map(fileName =>
    path.join(projectDir, fileName),
  );
}

export function getSupportedConfigFileNamesText(baseName: string): string {
  return joinWithOr(getSupportedConfigFileNames(baseName));
}

function getDefaultConfigFileName(baseName: string): string {
  return `${baseName}${DEFAULT_CONFIG_FILE_EXTENSION}`;
}

function getDefaultConfigFilePath(
  projectDir: string,
  baseName: string,
): string {
  return path.join(projectDir, getDefaultConfigFileName(baseName));
}

export function getDefaultSiteConfigPath(
  projectDir: string,
  env: SiteEnv,
): string {
  return getDefaultConfigFilePath(projectDir, getSiteConfigBaseName(env));
}

export function getDefaultProjectConfigFilePath(
  projectDir: string,
  name: ProjectConfigName,
): string {
  return getDefaultConfigFilePath(projectDir, getProjectConfigBaseName(name));
}

function resolveConfigFile<Name extends ConfigName = ConfigName>(
  projectDir: string,
  name: Name,
  baseName: string,
): ResolvedProjectConfigFile<Name> | undefined {
  const matches = getSupportedConfigFilePaths(projectDir, baseName).filter(
    filePath => fs.existsSync(filePath),
  );

  if (matches.length > 1) {
    const fileNames = matches.map(filePath => path.basename(filePath));
    throw new Error(
      `Multiple config files found for ${baseName}: ${joinWithOr(fileNames)}. Keep only one.`,
    );
  }

  if (matches.length === 0) {
    return undefined;
  }

  const filePath = matches[0];
  const fileName = path.basename(filePath);
  return {
    name,
    baseName,
    fileName,
    filePath,
    extension: getResolvedConfigExtension(fileName),
  };
}

export function resolveSiteConfigFile(
  projectDir: string,
  env: SiteEnv,
): ResolvedProjectConfigFile<SiteConfigName> {
  const baseName = SITE_CONFIG_BASE_NAMES[env];
  const resolved = resolveConfigFile(projectDir, baseName, baseName);
  if (!resolved) {
    throw new Error(
      `Missing required config file for ${baseName} (tried ${getSupportedConfigFileNamesText(baseName)})`,
    );
  }
  return resolved;
}

export function resolveProjectConfigFile(
  projectDir: string,
  name: ProjectConfigName,
): ResolvedProjectConfigFile<ProjectConfigName> | undefined {
  return resolveConfigFile(projectDir, name, PROJECT_CONFIG_BASE_NAMES[name]);
}
