import fs from 'fs';
import path from 'path';
import { createInstrumenter } from 'istanbul-lib-instrument';
import { plugin, type PluginBuilder } from 'bun';

interface BunBuildPlugin {
  name: string;
  setup(build: PluginBuilder): void;
}

interface CoverageHooks {
  createBundlePlugin(): BunBuildPlugin;
}

interface CoverageGlobal {
  __tadaCoverage?: CoverageHooks;
}

const packageDir = path.resolve(import.meta.dir, '..');
const buildDir = path.join(packageDir, 'build') + path.sep;
const srcDir = path.join(packageDir, 'src') + path.sep;
const transpiler = new Bun.Transpiler({ loader: 'ts', target: 'bun' });
const instrumenter = createInstrumenter({
  esModules: true,
  compact: false,
  produceSourceMap: false,
});

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const sourceFilter = new RegExp(
  `^(${escapeRegex(buildDir)}|${escapeRegex(srcDir)}).*\\.ts$`,
);

function shouldInstrument(filePath: string): boolean {
  return sourceFilter.test(filePath) && !filePath.includes('.test.');
}

async function loadSource(filePath: string) {
  return Bun.file(filePath).text();
}

async function instrumentFile(filePath: string) {
  const source = await loadSource(filePath);
  const js = transpiler.transformSync(source);
  return instrumenter.instrumentSync(js, filePath);
}

function createCoveragePlugin(name: string): BunBuildPlugin {
  return {
    name,
    setup(build) {
      build.onLoad({ filter: sourceFilter }, async args => {
        if (!shouldInstrument(args.path)) {
          return { contents: await loadSource(args.path), loader: 'ts' };
        }

        return { contents: await instrumentFile(args.path), loader: 'js' };
      });
    },
  };
}

export function installCoveragePreload(suite: 'functional' | 'playwright') {
  const coverageDir = path.join(packageDir, 'coverage', suite);
  fs.mkdirSync(coverageDir, { recursive: true });

  plugin(createCoveragePlugin(`istanbul-${suite}-runtime-coverage`));

  (globalThis as CoverageGlobal).__tadaCoverage = {
    createBundlePlugin() {
      return createCoveragePlugin(`istanbul-${suite}-bundle-coverage`);
    },
  };

  let written = false;

  function writeCoverage(): void {
    if (written) {
      return;
    }

    const coverage = (globalThis as Record<string, unknown>).__coverage__;
    if (!coverage) {
      return;
    }

    written = true;
    const outFile = path.join(
      coverageDir,
      `coverage-${process.pid}-${Date.now()}.json`,
    );
    fs.writeFileSync(outFile, JSON.stringify(coverage));
  }

  process.on('beforeExit', writeCoverage);

  function writeAndExit(): void {
    writeCoverage();
    process.exit(0);
  }

  process.on('SIGINT', writeAndExit);
  process.on('SIGTERM', writeAndExit);
}
