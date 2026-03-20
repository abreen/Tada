const JsonSchemaCompiler = require('ajv');

const compiler = new JsonSchemaCompiler();

function compile(schema) {
  return compiler.compile(schema);
}

function formatValidationError(error) {
  const path = error.instancePath || '/';
  const parts = [path];
  if (error.keyword === 'additionalProperties') {
    parts.push(`unknown property "${error.params.additionalProperty}"`);
  } else {
    parts.push(error.message);
  }
  return parts.join(': ');
}

function doValidation(validator, input, fileName) {
  const valid = validator(input);
  if (!valid) {
    const details = validator.errors.map(formatValidationError).join('\n');
    throw new Error(`${fileName} failed validation:\n${details}`);
  }
}

module.exports = { compile, doValidation };
