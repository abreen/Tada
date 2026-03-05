const fs = require('fs');
const { inspect } = require('node:util');
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

function getTemplatesDir() {
  return path.resolve(__dirname, '../templates');
}

function json(fileName) {
  return jsonData[fileName];
}

function render(fileName, params) {
  log.debug`Rendering ${fileName} with params ${params}`;
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

function compileTemplates(siteVariables) {
  Object.keys(templates).forEach(k => delete templates[k]);
  Object.keys(jsonData).forEach(k => delete jsonData[k]);

  const templatesDir = getTemplatesDir();

  fs.readdirSync(templatesDir).forEach(fileName => {
    const ext = path.extname(fileName).toLowerCase();
    const isSchema = fileName.toLowerCase().endsWith('.schema.json');
    if (isSchema) {
      return;
    }

    const filePath = path.join(templatesDir, fileName);

    if (ext === '.html') {
      templates[fileName] = fs.readFileSync(filePath, 'utf-8');
    } else if (ext === '.json') {
      const schemaFile = `${path.parse(fileName).name}.schema.json`;
      const schemaPath = path.join(templatesDir, schemaFile);
      if (fs.existsSync(schemaPath)) {
        compileAndSetValidator(schemaPath, fileName);
      }

      jsonData[fileName] = JSON.parse(
        _.template(fs.readFileSync(filePath, 'utf-8'))({
          ...(siteVariables.vars || {}),
          site: siteVariables,
          base: siteVariables.base,
          basePath: siteVariables.basePath,
        }),
      );

      if (validators[fileName]) {
        doValidation(validators[fileName], jsonData[fileName], fileName);
      } else {
        log.warn`Missing JSON Schema for ${fileName}`;
      }
    }
  });
}

function compileAndSetValidator(schemaPath, fileName) {
  const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf-8'));
  validators[fileName] = compileJsonSchema(schema);
}

module.exports = { compileTemplates, render, getTemplatesDir, json };
