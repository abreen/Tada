#!/usr/bin/env bun
import fs from 'fs';
import path from 'path';
import libCoverage from 'istanbul-lib-coverage';
import libReport from 'istanbul-lib-report';
import reports from 'istanbul-reports';
import { parse as parseLcov } from '@saintedlama/lcov-parse';
import { createInstrumenter } from 'istanbul-lib-instrument';

const coverageDir = path.resolve(import.meta.dir, '..', 'coverage');
const functionalDir = path.join(coverageDir, 'functional');
const unitLcovPath = path.join(coverageDir, 'unit', 'lcov.info');
const outputDir = path.join(coverageDir, 'report');

const map = libCoverage.createCoverageMap({});

// Merge functional test coverage (Istanbul JSON files)
if (fs.existsSync(functionalDir)) {
  for (const file of fs.readdirSync(functionalDir)) {
    if (!file.endsWith('.json')) {
      continue;
    }
    const data = JSON.parse(
      fs.readFileSync(path.join(functionalDir, file), 'utf8'),
    );
    map.merge(data);
  }
}

// Merge unit test coverage (Bun lcov output)
if (fs.existsSync(unitLcovPath)) {
  const lcov = fs.readFileSync(unitLcovPath, 'utf8');
  const records = await parseLcov(lcov);

  for (const record of records) {
    const absPath = path.resolve(coverageDir, '..', record.file);
    const fc = libCoverage.createFileCoverage(absPath);
    for (const { line, hit } of record.lines.details) {
      const idx = Object.keys(fc.data.statementMap).length;
      fc.data.statementMap[idx] = {
        start: { line, column: 0 },
        end: { line, column: 0 },
      };
      fc.data.s[idx] = hit;
    }
    for (const { line, name, hit } of record.functions.details) {
      const idx = Object.keys(fc.data.fnMap).length;
      fc.data.fnMap[idx] = {
        name: name ?? `fn_${line}`,
        decl: {
          start: { line: line ?? 0, column: 0 },
          end: { line: line ?? 0, column: 0 },
        },
        loc: {
          start: { line: line ?? 0, column: 0 },
          end: { line: line ?? 0, column: 0 },
        },
      };
      fc.data.f[idx] = hit ?? 0;
    }
    for (const detail of record.branches?.details ?? []) {
      const key = `${detail.line}:${detail.block}:${detail.branch}`;
      if (!fc.data.branchMap[key]) {
        fc.data.branchMap[key] = {
          type: 'branch',
          loc: {
            start: { line: detail.line, column: 0 },
            end: { line: detail.line, column: 0 },
          },
          locations: [
            {
              start: { line: detail.line, column: 0 },
              end: { line: detail.line, column: 0 },
            },
          ],
        };
        fc.data.b[key] = [];
      }
      fc.data.b[key].push(detail.taken);
    }
    map.addFileCoverage(fc);
  }
}

// Add zero-coverage entries for source files not touched by any test
const transpiler = new Bun.Transpiler({ loader: 'ts', target: 'bun' });
const instrumenter = createInstrumenter({
  esModules: true,
  compact: false,
  produceSourceMap: false,
});

const packageDir = path.resolve(import.meta.dir, '..');
for (const dir of ['build', 'src']) {
  const base = path.join(packageDir, dir);
  const entries = fs.readdirSync(base, {
    recursive: true,
    withFileTypes: true,
  });
  for (const entry of entries) {
    if (
      !entry.isFile() ||
      !entry.name.endsWith('.ts') ||
      entry.name.endsWith('.d.ts') ||
      entry.name.includes('.test.')
    ) {
      continue;
    }
    const absPath = path.join(entry.parentPath, entry.name);
    if (map.data[absPath]) {
      continue;
    }
    const source = fs.readFileSync(absPath, 'utf8');
    const js = transpiler.transformSync(source);
    instrumenter.instrumentSync(js, absPath);
    const emptyCoverage = instrumenter.lastFileCoverage();
    map.addFileCoverage(emptyCoverage);
  }
}

// Generate reports from merged coverage
fs.mkdirSync(outputDir, { recursive: true });
const context = libReport.createContext({ dir: outputDir, coverageMap: map });
reports.create('lcovonly', { file: 'lcov.info' }).execute(context);
reports.create('html', {}).execute(context);
reports.create('text', {}).execute(context);
