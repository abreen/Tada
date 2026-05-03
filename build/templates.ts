import fs from 'fs';
import path from 'path';
import _ from 'lodash';
import {
  PROJECT_CONFIG_NAMES,
  getProjectConfigBaseName,
  type ProjectConfigName,
} from './config-files';
import {
  loadProjectConfig,
  type LoadedProjectConfigFile,
} from './config-loader';
import { compile as compileJsonSchema, doValidation } from './json-schema';
import { makeLogger } from './log';
import { getPackageDir, getProjectDir } from './utils/paths';
import type { ValidateFunction } from 'ajv';
import type { Logger, SiteVariables } from './types';

const log: Logger = makeLogger(import.meta.url);

// Store all templates in memory (don't read template files during build)
const templates: Record<string, string> = {};

// All parsed project config files
const projectConfig: Partial<Record<ProjectConfigName, unknown>> = {};
const loadedProjectConfig: Partial<
  Record<ProjectConfigName, LoadedProjectConfigFile>
> = {};

// Compiled JSON Schema for the project config files
const validators: Partial<Record<ProjectConfigName, ValidateFunction>> = {};

// Keeps track of template call tree
const renderStack: string[] = [];
let errorStack: string[] | null = null;

function getHtmlTemplatesDir(): string {
  return path.resolve(getPackageDir(), 'templates');
}

function getProjectConfigDir(): string {
  return getProjectDir();
}

export function config(name: ProjectConfigName): unknown {
  return projectConfig[name];
}

export function getConfigFileName(name: ProjectConfigName): string | undefined {
  return loadedProjectConfig[name]?.fileName;
}

export function render(
  fileName: string,
  params?: Record<string, unknown> | null,
): string | undefined {
  if (params != null) {
    // Allow the template to call render(), it will use our params
    params.render = (otherFileName: string) => render(otherFileName, params);

    // Allow templates to read the project config files we previously read into memory
    params.config = config;
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
  for (const name of PROJECT_CONFIG_NAMES) {
    delete projectConfig[name];
    delete loadedProjectConfig[name];
    delete validators[name];
  }

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

  // Load project config files from the project's config directory
  const projectConfigDir = getProjectConfigDir();
  for (const name of PROJECT_CONFIG_NAMES) {
    const loaded = loadProjectConfig(projectConfigDir, name, siteVariables);
    if (!loaded) {
      continue;
    }

    // Schema validation
    const schemaDir = path.resolve(getPackageDir(), 'schema');
    const schemaFile = `${getProjectConfigBaseName(name)}.schema.json`;
    const schemaPath = path.join(schemaDir, schemaFile);
    if (!fs.existsSync(schemaPath)) {
      throw new Error(
        `Missing JSON Schema for ${loaded.fileName}: ${schemaPath}`,
      );
    }
    compileAndSetValidator(schemaPath, name);

    log.debug`Reading ${loaded.fileName}`;
    projectConfig[name] = loaded.value;
    loadedProjectConfig[name] = loaded;

    doValidation(validators[name]!, projectConfig[name], loaded.fileName);
  }
}

function compileAndSetValidator(
  schemaPath: string,
  name: ProjectConfigName,
): void {
  const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf-8'));
  validators[name] = compileJsonSchema(schema);
}

export { getProjectConfigDir };
