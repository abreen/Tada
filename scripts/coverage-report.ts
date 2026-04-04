#!/usr/bin/env bun
import fs from 'fs';
import path from 'path';
import libCoverage from 'istanbul-lib-coverage';
import libReport from 'istanbul-lib-report';
import reports from 'istanbul-reports';
import { parse as parseLcov } from '@saintedlama/lcov-parse';

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
    map.addFileCoverage(fc);
  }
}

// Generate reports from merged coverage
fs.mkdirSync(outputDir, { recursive: true });
const context = libReport.createContext({ dir: outputDir, coverageMap: map });
reports.create('lcovonly', { file: 'lcov.info' }).execute(context);
reports.create('html', {}).execute(context);
reports.create('text', {}).execute(context);
