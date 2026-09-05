import { afterAll } from 'bun:test';
import { installCoveragePreload } from './coverage-preload.ts';
const writeCoverage = installCoveragePreload('unit');
// Bun test does not reliably emit process exit events. A global afterAll runs
// after each test file; overwrite the same snapshot to retain the latest totals.
afterAll(writeCoverage);
