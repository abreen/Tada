#!/usr/bin/env bun
import fs from 'fs';
import path from 'path';
import libCoverage from 'istanbul-lib-coverage';
import libReport from 'istanbul-lib-report';
import reports from 'istanbul-reports';

const coverageDir = path.resolve(import.meta.dir, '..', 'coverage');
const functionalDir = path.join(coverageDir, 'functional');
const unitLcovPath = path.join(coverageDir, 'unit', 'lcov.info');
const outputDir = path.join(coverageDir, 'report');

// Merge all functional test coverage JSON files into one coverage map
const map = libCoverage.createCoverageMap({});

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

// Write functional coverage as lcov
const functionalLcovPath = path.join(coverageDir, 'functional.lcov');
const context = libReport.createContext({ dir: coverageDir, coverageMap: map });
const lcovReport = reports.create('lcovonly', { file: 'functional.lcov' });
lcovReport.execute(context);

// Merge with unit test lcov if it exists
const mergedLcovPath = path.join(coverageDir, 'lcov.info');
let merged = fs.readFileSync(functionalLcovPath, 'utf8');
if (fs.existsSync(unitLcovPath)) {
  merged += fs.readFileSync(unitLcovPath, 'utf8');
}
fs.writeFileSync(mergedLcovPath, merged);

// Generate HTML report from functional coverage (the interesting one)
fs.mkdirSync(outputDir, { recursive: true });
const htmlContext = libReport.createContext({
  dir: outputDir,
  coverageMap: map,
});
const htmlReport = reports.create('html', {});
htmlReport.execute(htmlContext);

// Print text summary
const textReport = reports.create('text', {});
textReport.execute(htmlContext);
