import fs from 'fs';
import path from 'path';
import { compile as compileJsonSchema, doValidation } from './json-schema.js';
import { getProjectDir } from './utils/paths.js';
import type { SiteVariables } from './types.js';
import siteSchema from './site.schema.json' with { type: 'json' };

const configDir = getProjectDir();

const DEFAULT: Partial<SiteVariables> = {
  basePath: '/',
  features: { search: true, code: true },
};

const isValid = compileJsonSchema(siteSchema);

function getJson(filePath: string): Record<string, unknown> {
  return JSON.parse(
    fs.readFileSync(path.resolve(configDir, filePath), 'utf-8'),
  );
}

function getSiteVariables(env: string): SiteVariables {
  const fileName = `site.${env}.json`;
  const fromFile = getJson(fileName);
  const variables = {
    ...DEFAULT,
    ...fromFile,
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
  if (variables.themeColor && !variables.faviconColor) {
    variables.faviconColor = variables.themeColor;
  }

  // Derive titlePostfix from title if not explicitly set
  if (variables.title && !variables.titlePostfix) {
    variables.titlePostfix = ` - ${variables.title}`;
  }

  doValidation(isValid, variables, fileName);
  return variables;
}

export function getDevSiteVariables(): SiteVariables {
  return getSiteVariables('dev');
}

export function getProdSiteVariables(): SiteVariables {
  return getSiteVariables('prod');
}
