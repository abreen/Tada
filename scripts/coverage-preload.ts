import fs from 'fs';
import path from 'path';
import { createInstrumenter } from 'istanbul-lib-instrument';
import { plugin } from 'bun';

const packageDir = path.resolve(import.meta.dir, '..');
const coverageDir = path.join(packageDir, 'coverage', 'functional');
fs.mkdirSync(coverageDir, { recursive: true });

const instrumenter = createInstrumenter({
  esModules: true,
  compact: false,
  produceSourceMap: false,
});

const transpiler = new Bun.Transpiler({ loader: 'ts', target: 'bun' });

const buildDir = path.join(packageDir, 'build') + path.sep;
const srcDir = path.join(packageDir, 'src') + path.sep;

// Build a regex that matches .ts files only under build/ or src/
// Escape path separators for regex
function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const filterPattern = new RegExp(
  `^(${escapeRegex(buildDir)}|${escapeRegex(srcDir)}).*\\.ts$`,
);

plugin({
  name: 'istanbul-coverage',
  setup(build) {
    build.onLoad({ filter: filterPattern }, async args => {
      if (args.path.includes('.test.')) {
        // Read and return unmodified for test files
        return { contents: await Bun.file(args.path).text(), loader: 'ts' };
      }

      const source = await Bun.file(args.path).text();
      const js = transpiler.transformSync(source);
      const instrumented = instrumenter.instrumentSync(js, args.path);

      return { contents: instrumented, loader: 'js' };
    });
  },
});

function writeCoverage(): void {
  const coverage = (globalThis as Record<string, unknown>).__coverage__;
  if (coverage) {
    const outFile = path.join(
      coverageDir,
      `coverage-${process.pid}-${Date.now()}.json`,
    );
    fs.writeFileSync(outFile, JSON.stringify(coverage));
  }
}

process.on('beforeExit', writeCoverage);

// Watch mode processes are killed with SIGTERM, which doesn't trigger
// beforeExit. Write coverage before exiting on SIGTERM.
process.on('SIGTERM', () => {
  writeCoverage();
  process.exit(0);
});
