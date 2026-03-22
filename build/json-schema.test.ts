import { describe, expect, test } from 'bun:test';
import { compile, doValidation } from './json-schema';

const schema = {
  type: 'object',
  properties: { name: { type: 'string' }, age: { type: 'number' } },
  required: ['name'],
  additionalProperties: false,
};

describe('compile', () => {
  test('returns a validate function', () => {
    const validator = compile(schema);
    expect(typeof validator).toBe('function');
  });
});

describe('doValidation', () => {
  test('does not throw for valid input', () => {
    const validator = compile(schema);
    expect(() =>
      doValidation(validator, { name: 'Alice' }, 'test.json'),
    ).not.toThrow();
  });

  test('does not throw when optional fields are present', () => {
    const validator = compile(schema);
    expect(() =>
      doValidation(validator, { name: 'Alice', age: 30 }, 'test.json'),
    ).not.toThrow();
  });

  test('throws when required field is missing', () => {
    const validator = compile(schema);
    expect(() => doValidation(validator, {}, 'test.json')).toThrow(
      'test.json failed validation',
    );
  });

  test('throws with additionalProperties message', () => {
    const validator = compile(schema);
    expect(() =>
      doValidation(validator, { name: 'Alice', extra: true }, 'test.json'),
    ).toThrow('unknown property "extra"');
  });

  test('throws with field path in error', () => {
    const nestedSchema = {
      type: 'object',
      properties: { name: { type: 'string' } },
    };
    const validator = compile(nestedSchema);
    expect(() => doValidation(validator, { name: 123 }, 'data.json')).toThrow(
      'data.json failed validation',
    );
  });
});
