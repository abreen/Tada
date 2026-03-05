const fs = require('fs');
const path = require('path');
const { compile: compileJsonSchema, doValidation } = require('./json-schema');
const configDir = path.resolve(__dirname, '..', 'config');

const DEFAULT = { basePath: '/', features: { search: true, code: true } };

const isValid = compileJsonSchema(require('./site.schema.json'));

function getJson(filePath) {
  return JSON.parse(
    fs.readFileSync(path.resolve(configDir, filePath), 'utf-8'),
  );
}

function getSiteVariables(env) {
  const fileName = `site.${env}.json`;
  const fromFile = getJson(fileName);
  const variables = {
    ...DEFAULT,
    ...fromFile,
    features: { ...DEFAULT.features, ...(fromFile.features || {}) },
  };
  doValidation(isValid, variables, fileName);
  return variables;
}

function getDevSiteVariables() {
  return getSiteVariables('dev');
}

function getProdSiteVariables() {
  return getSiteVariables('prod');
}

module.exports = { getDevSiteVariables, getProdSiteVariables };
