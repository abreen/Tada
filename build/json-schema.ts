import JsonSchemaCompiler from 'ajv';
import type { ValidateFunction, ErrorObject } from 'ajv';

const compiler = new JsonSchemaCompiler();

export function compile(schema: object): ValidateFunction {
  return compiler.compile(schema);
}

function formatValidationError(error: ErrorObject): string {
  const path = error.instancePath || '/';
  const parts: string[] = [path];
  if (error.keyword === 'additionalProperties') {
    parts.push(
      `unknown property "${(error.params as { additionalProperty: string }).additionalProperty}"`,
    );
  } else {
    parts.push(error.message || 'unknown error');
  }
  return parts.join(': ');
}

export function doValidation(
  validator: ValidateFunction,
  input: unknown,
  fileName: string,
): void {
  const valid = validator(input);
  if (!valid) {
    const details = validator.errors!.map(formatValidationError).join('\n');
    throw new Error(`${fileName} failed validation:\n${details}`);
  }
}
