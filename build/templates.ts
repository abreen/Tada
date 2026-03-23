import fs from 'fs';
import path from 'path';
import _ from 'lodash';
import { compile as compileJsonSchema, doValidation } from './json-schema';
import { makeLogger } from './log';
import { getPackageDir, getConfigDir } from './utils/paths';
import type { ValidateFunction } from 'ajv';
import type { Logger, SiteVariables } from './types';

const log: Logger = makeLogger(__filename);

// Store all templates in memory (don't read template files during build)
const templates: Record<string, string> = {};

// All parsed data (from .json files)
const jsonData: Record<string, unknown> = {};

// Compiled JSON Schema for the .json files
const validators: Record<string, ValidateFunction> = {};

// Keeps track of template call tree
const renderStack: string[] = [];
let errorStack: string[] | null = null;

// JSON data files that live in the user's config directory
const JSON_DATA_FILES: string[] = ['nav.json', 'authors.json'];

function getHtmlTemplatesDir(): string {
  return path.resolve(getPackageDir(), 'templates');
}

function getJsonDataDir(): string {
  return getConfigDir();
}

export function json(fileName: string): unknown {
  return jsonData[fileName];
}

export function render(
  fileName: string,
  params?: Record<string, unknown> | null,
): string | undefined {
  if (params != null) {
    // Allow the template to call render(), it will use our params
    params.render = (otherFileName: string) => render(otherFileName, params);

    // Allow the template to read the JSON files we previously read into memory
    params.json = json;
  }

  renderStack.push(fileName);
  try {
    return _.template(templates[fileName])(params ?? undefined);
  } catch (err) {
    if (errorStack == null) {
      errorStack = renderStack.slice();

      if (renderStack.length > 1) {
        throw err;
      }
    } else if (renderStack.length === 1) {
      const topItem = errorStack[errorStack.length - 1];
      throw new Error(`Render error in ${topItem}: ${err}`, { cause: err });
    }
  } finally {
    renderStack.pop();
  }
}

export function compileTemplates(
  siteVariables: SiteVariables,
  quiet: boolean = false,
): void {
  if (!quiet) {
    log.debug`Compiling templates`;
  }

  Object.keys(templates).forEach(k => delete templates[k]);
  Object.keys(jsonData).forEach(k => delete jsonData[k]);

  // Load HTML templates from the package
  const htmlDir = getHtmlTemplatesDir();
  fs.readdirSync(htmlDir).forEach(fileName => {
    const ext = path.extname(fileName).toLowerCase();
    if (ext === '.html') {
      log.debug`Reading ${fileName}`;
      templates[fileName] = fs.readFileSync(
        path.join(htmlDir, fileName),
        'utf-8',
      );
    }
  });

  // Load JSON data files from the project's config directory
  const jsonDir = getJsonDataDir();
  for (const fileName of JSON_DATA_FILES) {
    const filePath = path.join(jsonDir, fileName);
    if (!fs.existsSync(filePath)) {
      continue;
    }

    // Schema validation
    const schemaDir = path.resolve(getPackageDir(), 'schema');
    const schemaFile = `${path.parse(fileName).name}.schema.json`;
    const schemaPath = path.join(schemaDir, schemaFile);
    if (!fs.existsSync(schemaPath)) {
      throw new Error(`Missing JSON Schema for ${fileName}: ${schemaPath}`);
    }
    compileAndSetValidator(schemaPath, fileName);

    log.debug`Reading ${fileName}`;
    jsonData[fileName] = JSON.parse(
      _.template(fs.readFileSync(filePath, 'utf-8'))({
        ...(siteVariables.vars || {}),
        site: siteVariables,
        base: siteVariables.base,
        basePath: siteVariables.basePath,
      }),
    );

    doValidation(validators[fileName], jsonData[fileName], fileName);
  }
}

function compileAndSetValidator(schemaPath: string, fileName: string): void {
  const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf-8'));
  validators[fileName] = compileJsonSchema(schema);
}

export { getHtmlTemplatesDir, getJsonDataDir, JSON_DATA_FILES };
