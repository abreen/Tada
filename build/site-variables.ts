import fs from 'fs';
import path from 'path';
import { bundledLanguages } from 'shiki';
import type { BundledLanguage } from 'shiki';
import { getSiteConfigFile, type SiteEnv } from './config-files';
import { compile as compileJsonSchema, doValidation } from './json-schema';
import { getProjectDir } from './utils/paths';
import type { PlainTextLanguage, SiteVariables } from './types';
import siteSchema from '../schema/site.schema.json' with { type: 'json' };
import timezones from '../src/timezone/timezones.json' with { type: 'json' };

const configDir = getProjectDir();

const DEFAULT: Partial<SiteVariables> = {
  basePath: '/',
  features: { search: true, favicon: true, footer: true },
};

const isValid = compileJsonSchema(siteSchema);

function getJson(filePath: string): Record<string, unknown> {
  return JSON.parse(
    fs.readFileSync(path.resolve(configDir, filePath), 'utf-8'),
  );
}

const PLAIN_TEXT_LANGUAGES = ['plain', 'text', 'txt'] as const;

export function isPlainTextLanguage(lang: string): lang is PlainTextLanguage {
  return PLAIN_TEXT_LANGUAGES.some(value => value === lang);
}

export function isBundledLanguage(lang: string): lang is BundledLanguage {
  return Object.hasOwn(bundledLanguages, lang);
}

function isSupportedShikiLanguage(
  lang: string,
): lang is BundledLanguage | PlainTextLanguage {
  return isBundledLanguage(lang) || isPlainTextLanguage(lang);
}

export function validateExtensionToShikiLanguage(
  value: unknown,
  fileName: string,
): Record<string, BundledLanguage | PlainTextLanguage> | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }

  const validated: Record<string, BundledLanguage | PlainTextLanguage> = {};
  for (const [ext, lang] of Object.entries(value)) {
    if (typeof lang !== 'string') {
      continue;
    }
    if (!isSupportedShikiLanguage(lang)) {
      throw new Error(
        `${fileName}: extensionToShikiLanguage.${ext} "${lang}" is not a supported Shiki language`,
      );
    }
    validated[ext] = lang;
  }
  return validated;
}

export function validateShikiLanguages(
  value: unknown,
  fileName: string,
): BundledLanguage[] | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    return undefined;
  }

  const validated: BundledLanguage[] = [];
  for (let i = 0; i < value.length; i++) {
    const lang = value[i];
    if (typeof lang !== 'string') {
      throw new Error(`${fileName}: shikiLanguages[${i}] must be a string`);
    }
    if (isPlainTextLanguage(lang)) {
      throw new Error(
        `${fileName}: shikiLanguages[${i}] "${lang}" must be a bundled Shiki language`,
      );
    }
    if (!isBundledLanguage(lang)) {
      throw new Error(
        `${fileName}: shikiLanguages[${i}] "${lang}" is not a supported Shiki language`,
      );
    }
    validated.push(lang);
  }
  return validated;
}

export function getExtensionToShikiLanguage(
  siteVariables: SiteVariables,
): Record<string, BundledLanguage | PlainTextLanguage> {
  return siteVariables.extensionToShikiLanguage ?? {};
}

export function getRuntimeBundledShikiLanguages(
  siteVariables: SiteVariables,
): BundledLanguage[] {
  const configured = Object.values(getExtensionToShikiLanguage(siteVariables))
    .filter(isBundledLanguage)
    .concat(siteVariables.shikiLanguages ?? []);
  return [...new Set(configured)];
}

function getSiteVariables(env: SiteEnv): SiteVariables {
  const fileName = getSiteConfigFile(env);
  const fromFile = getJson(fileName);
  const extensionToShikiLanguage = validateExtensionToShikiLanguage(
    fromFile.extensionToShikiLanguage,
    fileName,
  );
  const shikiLanguages = validateShikiLanguages(
    fromFile.shikiLanguages,
    fileName,
  );
  const variables = {
    ...DEFAULT,
    ...fromFile,
    ...(extensionToShikiLanguage ? { extensionToShikiLanguage } : {}),
    ...(shikiLanguages ? { shikiLanguages } : {}),
    features: {
      ...DEFAULT.features,
      ...((fromFile.features as Record<string, unknown>) || {}),
    },
  } as SiteVariables;

  // Derive faviconSymbol from symbol if not explicitly set
  if (variables.symbol && !variables.faviconSymbol) {
    variables.faviconSymbol = variables.symbol;
  }

  // Derive faviconColor from themeColor if not explicitly set
  if (!variables.faviconColor) {
    variables.faviconColor = variables.themeColor;
  }

  // Derive titlePostfix from title if not explicitly set
  if (!variables.titlePostfix) {
    variables.titlePostfix = ` - ${variables.title}`;
  }

  doValidation(isValid, variables, fileName);

  if (!timezones.some(t => t.value === variables.defaultTimeZone)) {
    throw new Error(
      `${fileName}: defaultTimeZone "${variables.defaultTimeZone}" is not a valid time zone`,
    );
  }

  return variables;
}

export function getDevSiteVariables(): SiteVariables {
  return getSiteVariables('dev');
}

export function getProdSiteVariables(): SiteVariables {
  return getSiteVariables('prod');
}
