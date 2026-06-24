import fs from 'fs';
import {
  resolveProjectConfigFile,
  resolveSiteConfigFile,
  type ConfigName,
  type ProjectConfigName,
  type ResolvedProjectConfigFile,
  type SiteConfigName,
  type SiteEnv,
} from './config-files';
import type { SiteVariables } from './types';
import { resolveStructuredExpressions } from './utils/structured-expressions';

export interface LoadedProjectConfigFile<
  T = unknown,
  Name extends ConfigName = ConfigName,
> extends ResolvedProjectConfigFile<Name> {
  value: T;
}

export function parseConfigText(text: string, fileName: string): unknown {
  try {
    return Bun.YAML.parse(text);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${fileName}: ${message}`, { cause: error });
  }
}
export function resolveProjectConfigExpressions(
  value: unknown,
  siteVariables: SiteVariables,
  fileName: string,
): unknown {
  return resolveStructuredExpressions(
    value,
    { site: siteVariables, vars: siteVariables.vars || {} },
    fileName,
  );
}

function loadResolvedConfigFile<
  T = unknown,
  Name extends ConfigName = ConfigName,
>(
  resolved: ResolvedProjectConfigFile<Name>,
  {
    interpolate = false,
    siteVariables,
  }: { interpolate?: boolean; siteVariables?: SiteVariables } = {},
): LoadedProjectConfigFile<T, Name> {
  const rawText = fs.readFileSync(resolved.filePath, 'utf-8');
  const parsed = parseConfigText(rawText, resolved.fileName);
  const value = interpolate
    ? resolveProjectConfigExpressions(parsed, siteVariables!, resolved.fileName)
    : parsed;

  return { ...resolved, value: value as T };
}

export function loadSiteConfig(
  projectDir: string,
  env: SiteEnv,
): LoadedProjectConfigFile<unknown, SiteConfigName> {
  const resolved = resolveSiteConfigFile(projectDir, env);
  return loadResolvedConfigFile(resolved);
}

export function loadProjectConfig(
  projectDir: string,
  name: ProjectConfigName,
  siteVariables: SiteVariables,
): LoadedProjectConfigFile<unknown, ProjectConfigName> | undefined {
  const resolved = resolveProjectConfigFile(projectDir, name);
  if (!resolved) {
    return undefined;
  }
  return loadResolvedConfigFile(resolved, { interpolate: true, siteVariables });
}
