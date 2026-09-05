import { expect, test } from 'bun:test';
import path from 'node:path';
import { instrumentCoverageSource } from './coverage-source';
import { isCoverageSource, mergeSourceCoverage } from './coverage-data';

const root = path.resolve('coverage-fixture');
const sample =
  'interface Value { count: number }\nexport function add(v: Value) {\n  const x = v.count; return x + 1;\n}\nexport const unused = () => 0;';
const source = () =>
  instrumentCoverageSource(sample, path.join(root, 'build', 'sample.ts'))
    .coverage;

test('production scope includes all roots and consistently excludes support files', () => {
  for (const file of [
    'build/main.ts',
    'src/main.ts',
    'bin/tada.ts',
    'python/module.ts',
  ]) {
    expect(isCoverageSource(file, root)).toBe(true);
    expect(isCoverageSource(path.join(root, file), root)).toBe(true);
  }
  for (const file of [
    'build/types.d.ts',
    'src/a.test.ts',
    'src/test-helpers.ts',
    'unit-test-preload.ts',
    'scripts/test.ts',
    '../build/a.ts',
    'buildish/a.ts',
  ]) {
    expect(isCoverageSource(file, root)).toBe(false);
  }
});

test('compatible suites merge counters without duplicating original-source locations', () => {
  const baseline = source();
  const unit = source();
  const runtime = source();
  for (const [id, location] of Object.entries(unit.statementMap)) {
    unit.s[id] = location.start.line === 3 ? 1 : 0;
    runtime.s[id] = location.start.line === 5 ? 2 : 0;
  }
  unit.f[0] = 1;
  const report = mergeSourceCoverage(
    root,
    [baseline],
    [{ [unit.path]: unit }, { [runtime.path]: runtime }],
  );
  const file = report.fileCoverageFor(baseline.path);
  expect(file.getLineCoverage()).toEqual({ 3: 1, 5: 2 });
  expect(file.toSummary().lines).toMatchObject({
    total: 2,
    covered: 2,
    pct: 100,
  });
  expect(file.data.statementMap).toEqual(baseline.statementMap);
  expect(file.data.fnMap).toEqual(baseline.fnMap);
  expect(file.data.branchMap).toEqual(baseline.branchMap);
  expect(file.toSummary().functions).toMatchObject({ total: 2, covered: 1 });
  expect(baseline.s).toEqual(source().s);
  expect(unit.s).not.toEqual(file.data.s);
});

test('untouched entrypoints stay in denominator and foreign streams cannot widen scope', () => {
  const cli = instrumentCoverageSource(
    'export const cli = 1;',
    path.join(root, 'bin', 'tada.ts'),
  ).coverage;
  const python = instrumentCoverageSource(
    'export const launch = 1;',
    path.join(root, 'python', 'module.ts'),
  ).coverage;
  const helper = instrumentCoverageSource(
    'export const helper = 1;',
    path.join(root, 'src', 'test-helpers.ts'),
  ).coverage;
  const report = mergeSourceCoverage(
    root,
    [cli, python, helper],
    [{ [helper.path]: helper }],
  );
  expect(report.files().sort()).toEqual([cli.path, python.path].sort());
  expect(report.getCoverageSummary().lines).toMatchObject({
    total: 2,
    covered: 0,
    pct: 0,
  });
});

test('native line-only or stale source maps cannot silently corrupt merged totals', () => {
  const baseline = source();
  const incompatible = source();
  incompatible.statementMap[0] = {
    start: { line: 3, column: 0 },
    end: { line: 3, column: 0 },
  };
  expect(() =>
    mergeSourceCoverage(root, [baseline], [{ [baseline.path]: incompatible }]),
  ).toThrow('Incompatible coverage');
});

test('complementary branch hits share one denominator across suites', () => {
  const make = () =>
    instrumentCoverageSource(
      'export const pick = (v: boolean) => v ? 1 : 2;',
      path.join(root, 'src', 'pick.ts'),
    ).coverage;
  const unit = make();
  const browser = make();
  unit.b[0] = [1, 0];
  browser.b[0] = [0, 2];
  const report = mergeSourceCoverage(
    root,
    [make()],
    [{ [unit.path]: unit }, { [browser.path]: browser }],
  );
  expect(report.getCoverageSummary().branches).toMatchObject({
    total: 2,
    covered: 2,
    pct: 100,
  });
});
