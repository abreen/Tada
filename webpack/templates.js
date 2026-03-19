const fs = require('fs');
const path = require('path');
const _ = require('lodash');
const { compile: compileJsonSchema, doValidation } = require('./json-schema');
const { makeLogger } = require('./log');

const log = makeLogger(__filename);

// Store all templates in memory (don't read template files during build)
const templates = {};

// All parsed data (from .json files)
const jsonData = {};

// Compiled JSON Schema for the .json files
const validators = {};

// Keeps track of template call tree
const renderStack = [];
let errorStack = null;

// JSON data files that live in the user's config directory
const JSON_DATA_FILES = ['nav.json', 'authors.json'];

function getHtmlTemplatesDir() {
  const { getPackageDir } = require('./utils/paths');
  return path.resolve(getPackageDir(), 'templates');
}

function getJsonDataDir() {
  const { getConfigDir } = require('./utils/paths');
  return getConfigDir();
}

function json(fileName) {
  return jsonData[fileName];
}

function render(fileName, params) {
  if (params != null) {
    // Allow the template to call render(), it will use our params
    params.render = otherFileName => render(otherFileName, params);

    // Allow the template to read the JSON files we previously read into memory
    params.json = json;
  }

  renderStack.push(fileName);
  try {
    return _.template(templates[fileName])(params);
  } catch (err) {
    if (errorStack == null) {
      errorStack = renderStack.slice();

      if (renderStack.length > 1) {
        throw err;
      }
    } else if (renderStack.length === 1) {
      const topItem = errorStack[errorStack.length - 1];
      throw new Error(`Render error in ${topItem}: ${err}`);
    }
  } finally {
    renderStack.pop();
  }
}

function compileTemplates(siteVariables, quiet = false) {
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
      throw new Error(`Missing required data file: ${filePath}`);
    }

    // Schema validation (schemas live in the package templates dir)
    const schemaFile = `${path.parse(fileName).name}.schema.json`;
    const schemaPath = path.join(htmlDir, schemaFile);
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

function compileAndSetValidator(schemaPath, fileName) {
  const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf-8'));
  validators[fileName] = compileJsonSchema(schema);
}

module.exports = {
  compileTemplates,
  render,
  getHtmlTemplatesDir,
  getJsonDataDir,
  json,
  JSON_DATA_FILES,
};
