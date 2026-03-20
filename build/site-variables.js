const fs = require('fs');
const path = require('path');
const { compile: compileJsonSchema, doValidation } = require('./json-schema');
const { getProjectDir } = require('./utils/paths');
const configDir = getProjectDir();

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

function getDevSiteVariables() {
  return getSiteVariables('dev');
}

function getProdSiteVariables() {
  return getSiteVariables('prod');
}

module.exports = { getDevSiteVariables, getProdSiteVariables };
