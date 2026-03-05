const JsonSchemaCompiler = require('ajv');

const compiler = new JsonSchemaCompiler();

function compile(schema) {
  return compiler.compile(schema);
}

function doValidation(validator, input, fileName) {
  const valid = validator(input);
  if (!valid) {
    validator.errors.forEach(error => {
      console.error(error);
    });
    throw new Error(`JSON file failed validation: ${fileName}`);
  }
}

module.exports = { compile, doValidation };
