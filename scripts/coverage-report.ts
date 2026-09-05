#!/usr/bin/env bun
import fs from 'fs';
import path from 'path';
import {
  coverageSourceRoots,
  isCoverageSource,
  mergeSourceCoverage,
} from './coverage-data';
import libReport from 'istanbul-lib-report';
import reports from 'istanbul-reports';
import { instrumentCoverageSource } from './coverage-source';

const coverageDir = path.resolve(import.meta.dir, '..', 'coverage');
const packageDir = path.resolve(import.meta.dir, '..');
const functionalDir = path.join(coverageDir, 'functional');
const playwrightDir = path.join(coverageDir, 'playwright');
const unitDir = path.join(coverageDir, 'unit');
const outputDir = path.join(coverageDir, 'report');
const streams = [];
for (const suiteDir of [unitDir, functionalDir, playwrightDir]) {
  if (!fs.existsSync(suiteDir)) {
    continue;
  }
  for (const file of fs.readdirSync(suiteDir)) {
    if (file.endsWith('.json')) {
      streams.push(
        JSON.parse(fs.readFileSync(path.join(suiteDir, file), 'utf8')),
      );
    }
  }
}
// Discover every production file before merging hits so touched and untouched
// files share the exact same executable-line denominator.
const sources = [];
for (const dir of coverageSourceRoots) {
  const entries = fs.readdirSync(path.join(packageDir, dir), {
    recursive: true,
    withFileTypes: true,
  });
  for (const entry of entries) {
    const absPath = path.join(entry.parentPath, entry.name);
    if (!entry.isFile() || !isCoverageSource(absPath, packageDir)) {
      continue;
    }
    sources.push(
      instrumentCoverageSource(fs.readFileSync(absPath, 'utf8'), absPath)
        .coverage,
    );
  }
}
const map = mergeSourceCoverage(packageDir, sources, streams);

// Generate reports from merged coverage
fs.mkdirSync(outputDir, { recursive: true });
const context = libReport.createContext({ dir: outputDir, coverageMap: map });
reports.create('lcovonly', { file: 'lcov.info' }).execute(context);
reports.create('html', {}).execute(context);
reports.create('text', { skipEmpty: true }).execute(context);
