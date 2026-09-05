import { expect, test } from 'bun:test';
import { instrumentCoverageSource } from './coverage-source';

test('coverage refers to original TypeScript lines after types are erased', () => {
  const source = [
    'interface Value {',
    '  count: number;',
    '}',
    '',
    'export function increment(value: Value): number {',
    '  return value.count + 1;',
    '}',
  ].join('\n');
  const { code, coverage } = instrumentCoverageSource(source, '/sample.ts');
  expect(
    Object.values(coverage.statementMap).map(loc => loc.start.line),
  ).toEqual([6]);
  expect(Object.values(coverage.fnMap).map(fn => fn.decl.start.line)).toEqual([
    5,
  ]);
  expect(code).not.toContain('interface Value');
});
