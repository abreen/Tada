import fs from 'fs';
import _ from 'lodash';
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

interface ConfigTemplateContext {
  vars: Record<string, unknown>;
  site: SiteVariables;
}

const EXACT_INTERPOLATION_RE = /^\s*<%=\s*([\s\S]+?)\s*%>\s*$/;

export function parseConfigText(text: string, fileName: string): unknown {
  try {
    return Bun.YAML.parse(text);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${fileName}: ${message}`, { cause: error });
  }
}

function getTemplateErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function renderConfigTemplateString(
  value: string,
  context: ConfigTemplateContext,
  fileName: string,
): string {
  try {
    return _.template(value)(context);
  } catch (error) {
    throw new Error(
      `${fileName}: Lodash template error in config: ${getTemplateErrorMessage(error)}`,
      { cause: error },
    );
  }
}

function evaluateConfigTemplateExpression(
  expression: string,
  context: ConfigTemplateContext,
  fileName: string,
): unknown {
  let captured: unknown;

  try {
    _.template(`<% __capture(( ${expression} )); %>`)({
      ...context,
      __capture(value: unknown) {
        captured = value;
      },
    });
  } catch (error) {
    throw new Error(
      `${fileName}: Lodash template error in config: ${getTemplateErrorMessage(error)}`,
      { cause: error },
    );
  }

  return captured;
}

function interpolateConfigValue(
  value: unknown,
  context: ConfigTemplateContext,
  fileName: string,
): unknown {
  if (typeof value === 'string') {
    if (!value.includes('<%')) {
      return value;
    }

    const exactInterpolation = value.match(EXACT_INTERPOLATION_RE);
    if (exactInterpolation) {
      return evaluateConfigTemplateExpression(
        exactInterpolation[1],
        context,
        fileName,
      );
    }

    return renderConfigTemplateString(value, context, fileName);
  }

  if (Array.isArray(value)) {
    return value.map(item => interpolateConfigValue(item, context, fileName));
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        interpolateConfigValue(item, context, fileName),
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
  {
    interpolate = false,
    siteVariables,
  }: { interpolate?: boolean; siteVariables?: SiteVariables } = {},
): LoadedProjectConfigFile<T, Name> {
  const rawText = fs.readFileSync(resolved.filePath, 'utf-8');
  const parsed = parseConfigText(rawText, resolved.fileName);
  const value = interpolate
    ? interpolateConfigValue(
        parsed,
        { vars: siteVariables?.vars || {}, site: siteVariables! },
        resolved.fileName,
      )
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
