import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

const browserGlobalRules = [
  {
    name: 'window',
    message: 'Pass Window as a parameter instead of using the global window.',
  },
  {
    name: 'document',
    message:
      'Use the provided Window or Document parameter instead of the global document.',
  },
  {
    name: 'location',
    message: 'Read location through the provided Window or globals module.',
  },
  {
    name: 'history',
    message: 'Read history through the provided Window or globals module.',
  },
  {
    name: 'navigator',
    message: 'Read navigator through the provided Window or globals module.',
  },
  {
    name: 'localStorage',
    message: 'Use the provided Window instead of the global localStorage.',
  },
  {
    name: 'sessionStorage',
    message: 'Use the provided Window instead of the global sessionStorage.',
  },
  { name: 'fetch', message: 'Use src/globals.ts instead of the global fetch.' },
  {
    name: 'ResizeObserver',
    message: 'Use src/globals.ts instead of the global ResizeObserver.',
  },
];

const browserGlobalPropertyRules = [
  {
    object: 'globalThis',
    property: 'window',
    message: 'Pass Window as a parameter instead of using the global window.',
  },
  {
    object: 'globalThis',
    property: 'document',
    message:
      'Use the provided Window or Document parameter instead of the global document.',
  },
  {
    object: 'globalThis',
    property: 'location',
    message: 'Read location through the provided Window or globals module.',
  },
  {
    object: 'globalThis',
    property: 'history',
    message: 'Read history through the provided Window or globals module.',
  },
  {
    object: 'globalThis',
    property: 'navigator',
    message: 'Read navigator through the provided Window or globals module.',
  },
  {
    object: 'globalThis',
    property: 'localStorage',
    message: 'Use the provided Window instead of the global localStorage.',
  },
  {
    object: 'globalThis',
    property: 'sessionStorage',
    message: 'Use the provided Window instead of the global sessionStorage.',
  },
  {
    object: 'globalThis',
    property: 'fetch',
    message: 'Use src/globals.ts instead of the global fetch.',
  },
  {
    object: 'globalThis',
    property: 'ResizeObserver',
    message: 'Use src/globals.ts instead of the global ResizeObserver.',
  },
];

const unitTestGlobalRules = [
  ...browserGlobalRules,
  {
    name: 'process',
    message:
      'Mock build/globals.ts instead of using process directly in unit tests.',
  },
  {
    name: 'Bun',
    message:
      'Mock build/globals.ts instead of using Bun directly in unit tests.',
  },
];

const unitTestGlobalPropertyRules = [
  ...browserGlobalPropertyRules,
  {
    object: 'globalThis',
    property: 'process',
    message:
      'Mock build/globals.ts instead of using process directly in unit tests.',
  },
  {
    object: 'globalThis',
    property: 'Bun',
    message:
      'Mock build/globals.ts instead of using Bun directly in unit tests.',
  },
];

const unitTestFsImports = [
  {
    name: 'fs',
    allowTypeImports: true,
    message:
      'Unit tests must mock fs with mock.module(...) or move filesystem coverage to functional_tests/.',
  },
  {
    name: 'node:fs',
    allowTypeImports: true,
    message:
      'Unit tests must mock fs with mock.module(...) or move filesystem coverage to functional_tests/.',
  },
  {
    name: 'fs/promises',
    allowTypeImports: true,
    message:
      'Unit tests must mock fs with mock.module(...) or move filesystem coverage to functional_tests/.',
  },
  {
    name: 'node:fs/promises',
    allowTypeImports: true,
    message:
      'Unit tests must mock fs with mock.module(...) or move filesystem coverage to functional_tests/.',
  },
];

export default [
  { ignores: ['dist/', 'example/', 'node_modules/'] },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-expressions': [
        'error',
        { allowTaggedTemplates: true },
      ],
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },
  {
    files: ['**/*.test.ts'],
    rules: {
      'no-restricted-globals': ['error', ...unitTestGlobalRules],
      'no-restricted-imports': ['error', { paths: unitTestFsImports }],
      'no-restricted-properties': ['error', ...unitTestGlobalPropertyRules],
    },
  },
  {
    files: ['src/**/*.ts'],
    ignores: ['src/**/*.test.ts', 'src/globals.ts', 'src/index.ts'],
    rules: {
      'no-restricted-globals': ['error', ...browserGlobalRules],
      'no-restricted-properties': ['error', ...browserGlobalPropertyRules],
    },
  },
];
