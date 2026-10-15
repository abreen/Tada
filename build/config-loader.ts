import fs from 'fs';
import {
  getSiteVars,
  parseYamlWithVariables,
  substituteVariables,
} from './variables';
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
    // YAML rejects JSON surrogate pair escapes such as emoji in `\ud83c\udf89` form
    if (fileName.endsWith('.json')) {
      try {
        return JSON.parse(text);
      } catch {
        // Report the YAML error, as for any other config
      }
    }
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${fileName}: ${message}`, { cause: error });
  }
}

/** Substitutes site variables in every string value of a parsed config */
export function interpolateConfigValue(
  value: unknown,
  vars: Record<string, unknown>,
  fileName: string,
): unknown {
  if (typeof value === 'string') {
    return substituteVariables(value, vars, fileName);
  }

  if (Array.isArray(value)) {
    return value.map(item => interpolateConfigValue(item, vars, fileName));
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        interpolateConfigValue(item, vars, fileName),
      ]),
    );
  }

  return value;
}

function loadResolvedConfigFile<
  T = unknown,
  Name extends ConfigName = ConfigName,
>(
  resolved: ResolvedProjectConfigFile<Name>,
  /** Substitutes variables in string values when given */
  siteVariables?: SiteVariables,
): LoadedProjectConfigFile<T, Name> {
  return {
    ...resolved,
    value: readConfigFile(
      resolved.filePath,
      resolved.fileName,
      siteVariables,
    ) as T,
  };
}

/**
 * Parses a YAML or JSON config file, naming it `fileName` in errors.
 * Substitutes variables in string values when given site variables.
 */
export function readConfigFile(
  filePath: string,
  fileName: string,
  siteVariables?: SiteVariables,
): unknown {
  const rawText = fs.readFileSync(filePath, 'utf-8');
  const parse = (text: string) => parseConfigText(text, fileName);
  return siteVariables
    ? interpolateConfigValue(
        parseYamlWithVariables(rawText, fileName, parse),
        getSiteVars(siteVariables),
        fileName,
      )
    : parse(rawText);
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
  return loadResolvedConfigFile(resolved, siteVariables);
}
