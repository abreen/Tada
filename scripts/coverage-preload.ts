import fs from 'fs';
import path from 'path';
import { instrumentCoverageSource } from './coverage-source';
import { coverageSourceRoots, isCoverageSource } from './coverage-data';
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

const writeFileSync = fs.writeFileSync.bind(fs);
const mkdirSync = fs.mkdirSync.bind(fs);

const packageDir = path.resolve(import.meta.dir, '..');

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const sourceFilter = new RegExp(
  `^(${coverageSourceRoots.map(root => escapeRegex(path.join(packageDir, root) + path.sep)).join('|')}).*\\.ts$`,
);

function shouldInstrument(filePath: string): boolean {
  return isCoverageSource(filePath, packageDir);
}

async function loadSource(filePath: string) {
  return Bun.file(filePath).text();
}

async function instrumentFile(filePath: string) {
  const source = await loadSource(filePath);
  return instrumentCoverageSource(source, filePath).code;
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

export function installCoveragePreload(
  suite: 'unit' | 'functional' | 'playwright',
) {
  const coverageDir = path.join(packageDir, 'coverage', suite);
  mkdirSync(coverageDir, { recursive: true });

  plugin(createCoveragePlugin(`istanbul-${suite}-runtime-coverage`));

  (globalThis as CoverageGlobal).__tadaCoverage = {
    createBundlePlugin() {
      return createCoveragePlugin(`istanbul-${suite}-bundle-coverage`);
    },
  };

  let written = false;
  const outFile = path.join(
    coverageDir,
    `coverage-${process.pid}-${Date.now()}.json`,
  );

  function writeCoverage(): void {
    if (written && suite !== 'unit') {
      return;
    }

    const coverage = (globalThis as Record<string, unknown>).__coverage__;
    if (!coverage) {
      return;
    }

    written = true;
    writeFileSync(outFile, JSON.stringify(coverage));
  }

  process.on('beforeExit', writeCoverage);
  process.on('exit', writeCoverage);

  function writeAndExit(): void {
    writeCoverage();
    process.exit(0);
  }

  process.on('SIGINT', writeAndExit);
  process.on('SIGTERM', writeAndExit);
  return writeCoverage;
}
