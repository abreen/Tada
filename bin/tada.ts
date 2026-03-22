#!/usr/bin/env bun
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { parseArgs } from 'util';
import packageJson from '../package.json' with { type: 'json' };
import {
  validateSymbol,
  validateColor,
  validateHue,
  validateUrl,
  validateBasePath,
  createSiteConfig,
} from './validators';

const { version } = packageJson;

const SYSTEM_TIME_ZONE = Intl.DateTimeFormat().resolvedOptions().timeZone;

const packageDir = path.resolve(__dirname, '..');

function requireSiteConfig(env: string): void {
  const configPath = path.resolve(process.cwd(), `site.${env}.json`);
  if (!fs.existsSync(configPath)) {
    console.error(`Error: Missing config file: site.${env}.json`);
    process.exit(1);
  }
}

const COMMANDS = {
  init: null,
  dev: 'Build the site for development',
  prod: 'Build the site for production',
  watch: 'Watch for changes and rebuild',
  serve: 'Start a local development server',
  clean: null,
  diff: null,
};

interface InitQuestion {
  prompt: string;
  defaultValue: string;
  validate: (value: string) => string | null;
}

const INIT_QUESTIONS: Record<string, InitQuestion> = {
  title: {
    prompt: 'Site title',
    defaultValue: 'Introduction to Computer Science',
    validate: (v: string) => (v ? null : 'Title is required'),
  },
  symbol: {
    prompt: 'Logo symbol (1-5 uppercase chars)',
    defaultValue: 'CS 0',
    validate: validateSymbol,
  },
  themeColor: {
    prompt: 'Theme color',
    defaultValue: 'hsl(195 70% 40%)',
    validate: validateColor,
  },
  tintHue: {
    prompt: 'Background tint hue (0-360)',
    defaultValue: '20',
    validate: validateHue,
  },
  tintAmount: {
    prompt: 'Background tint amount (0-100)',
    defaultValue: '100',
    validate: (v: string) => {
      const n = Number(v);
      if (!Number.isInteger(n) || n < 0 || n > 100) {
        return 'Must be an integer from 0 to 100';
      }
      return null;
    },
  },
  defaultTimeZone: {
    prompt: 'Default time zone',
    defaultValue: SYSTEM_TIME_ZONE,
    validate: (v: string) => (v ? null : 'Time zone is required'),
  },
  prodBase: {
    prompt: 'Production base URL',
    defaultValue: 'https://example.edu',
    validate: validateUrl,
  },
  prodBasePath: {
    prompt: 'Production base path',
    defaultValue: '/',
    validate: validateBasePath,
  },
};

function printUsage() {
  console.log(`tada v${version}\n`);
  console.log('Usage: tada <command>\n');
  console.log('Commands:');
  for (const [cmd, desc] of Object.entries(COMMANDS)) {
    if (cmd === 'init') {
      console.log('  init <dirname>     Initialize a new site');
      console.log(
        '       [--no-interactive]  (Skip prompts; use defaults or flags)',
      );
      console.log(
        '       [--bare]            (Create a minimal site with one page)',
      );
      console.log('       [--title, --symbol, --theme-color, --tint-hue,');
      console.log('        --tint-amount, --default-time-zone, --prod-base,');
      console.log('        --prod-base-path]');
      continue;
    } else if (cmd === 'clean') {
      console.log('  clean              Remove the dist/ directory');
      console.log(
        '       [--prod]            Also prune old prod builds (keeps latest 2)',
      );
      continue;
    } else if (cmd === 'diff') {
      console.log(
        '  diff               Show changed files since last prod build',
      );
      console.log('       [N M]               Compare version N vs version M');
      console.log(
        '       [--copy <dir>]      Copy changed files to a directory',
      );
      continue;
    }
    console.log(`  ${cmd.padEnd(18)} ${desc}`);
  }
}

function run(cmd: string): void {
  execSync(cmd, { cwd: process.cwd(), stdio: 'inherit' });
}

function copyDirRecursive(src: string, dest: string): void {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

const FLAG_TO_KEY: Record<string, string> = {
  title: 'title',
  symbol: 'symbol',
  'theme-color': 'themeColor',
  'tint-hue': 'tintHue',
  'tint-amount': 'tintAmount',
  'default-time-zone': 'defaultTimeZone',
  'prod-base': 'prodBase',
  'prod-base-path': 'prodBasePath',
};

async function initCommand(args: string[]): Promise<void> {
  let values: Record<string, string | boolean | undefined>;
  let positionals: string[];

  try {
    ({ values, positionals } = parseArgs({
      args,
      options: {
        'no-interactive': { type: 'boolean', default: false },
        bare: { type: 'boolean', default: false },
        title: { type: 'string', default: INIT_QUESTIONS.title.defaultValue },
        symbol: { type: 'string', default: INIT_QUESTIONS.symbol.defaultValue },
        'theme-color': {
          type: 'string',
          default: INIT_QUESTIONS.themeColor.defaultValue,
        },
        'tint-hue': {
          type: 'string',
          default: INIT_QUESTIONS.tintHue.defaultValue,
        },
        'tint-amount': {
          type: 'string',
          default: INIT_QUESTIONS.tintAmount.defaultValue,
        },
        'default-time-zone': {
          type: 'string',
          default: INIT_QUESTIONS.defaultTimeZone.defaultValue,
        },
        'prod-base': {
          type: 'string',
          default: INIT_QUESTIONS.prodBase.defaultValue,
        },
        'prod-base-path': {
          type: 'string',
          default: INIT_QUESTIONS.prodBasePath.defaultValue,
        },
      },
      strict: true,
      allowPositionals: true,
    }));
  } catch (e: unknown) {
    console.error(`Error: ${(e as Error).message}`);
    process.exit(1);
  }

  const noInteractive = values['no-interactive'] as boolean;
  const bare = values.bare as boolean;
  const dirname = positionals[0];

  if (!dirname) {
    console.error('Error: Provide a name for the new directory');
    console.log('Usage: tada init <dirname> [--no-interactive] [--bare]');
    process.exit(1);
  }

  const projectDir = path.resolve(process.cwd(), dirname);
  if (fs.existsSync(projectDir)) {
    console.error(`Error: "${dirname}" already exists`);
    process.exit(1);
  }

  const message = `Creating a new Tada site in ${projectDir}`;
  if (noInteractive && bare) {
    console.log(message + ' using default config (bare)');
  } else if (noInteractive) {
    console.log(message + ' using default config');
  } else if (bare) {
    console.log(message + ' (bare)');
  } else {
    console.log(message);
  }

  const config: Record<string, string> = {};

  if (noInteractive) {
    for (const [flag, key] of Object.entries(FLAG_TO_KEY)) {
      const value = values[flag] as string;
      const error = INIT_QUESTIONS[key].validate(value);
      if (error) {
        console.error(`Error: --${flag}: ${error}`);
        process.exit(1);
      }
      config[key] = value;
    }
  } else {
    const questions = Object.entries(INIT_QUESTIONS);
    let qi = 0;
    let { prompt, defaultValue, validate } = questions[qi][1];
    let suffix = defaultValue != null ? ` (default: ${defaultValue})` : '';
    process.stdout.write(`${prompt}${suffix}? `);

    for await (const line of console) {
      const value = line.trim() || defaultValue || '';

      if (validate) {
        const error = validate(value);
        if (error) {
          console.error(`Error: ${error}`);
          process.stdout.write(`${prompt}${suffix}? `);
          continue;
        }
      }

      config[questions[qi][0]] = value;
      qi++;

      if (qi >= questions.length) {
        break;
      }

      ({ prompt, defaultValue, validate } = questions[qi][1]);

      suffix = defaultValue != null ? ` (default: ${defaultValue})` : '';

      process.stdout.write(`${prompt}${suffix}? `);
    }
  }

  const {
    title,
    symbol,
    themeColor,
    tintHue,
    tintAmount,
    defaultTimeZone,
    prodBase,
    prodBasePath,
  } = config;

  // Derive internal domain from production base URL
  const prodDomain = new URL(prodBase).hostname;

  // Create project directory
  fs.mkdirSync(projectDir);

  // Generate site configs
  const devConfig = createSiteConfig({
    title,
    symbol,
    themeColor,
    tintHue,
    tintAmount,
    defaultTimeZone,
    base: 'http://localhost:8080',
    basePath: '/',
    internalDomains: ['localhost'],
    features: { search: true, code: true, favicon: false },
  });

  const prodConfig = createSiteConfig({
    title,
    symbol,
    themeColor,
    tintHue,
    tintAmount,
    defaultTimeZone,
    base: prodBase,
    basePath: prodBasePath,
    internalDomains: [prodDomain],
    features: { search: true, code: true, favicon: true },
  });

  fs.writeFileSync(
    path.join(projectDir, 'site.dev.json'),
    JSON.stringify(devConfig, null, 2) + '\n',
  );

  fs.writeFileSync(
    path.join(projectDir, 'site.prod.json'),
    JSON.stringify(prodConfig, null, 2) + '\n',
  );

  if (bare) {
    fs.mkdirSync(path.join(projectDir, 'content'), { recursive: true });
    fs.writeFileSync(
      path.join(projectDir, 'content', 'index.md'),
      'title: Home\n\nWelcome to your new site.\n',
    );
    fs.mkdirSync(path.join(projectDir, 'public'), { recursive: true });
    fs.writeFileSync(
      path.join(projectDir, 'nav.json'),
      JSON.stringify(
        [
          {
            title: 'Navigation',
            links: [{ text: 'Home', internal: '/index.html' }],
          },
        ],
        null,
        2,
      ) + '\n',
    );
  } else {
    // Copy nav and authors data files to the project root
    fs.copyFileSync(
      path.join(packageDir, 'config/nav.json'),
      path.join(projectDir, 'nav.json'),
    );
    fs.copyFileSync(
      path.join(packageDir, 'config/authors.json'),
      path.join(projectDir, 'authors.json'),
    );

    // Copy content/ and public/ from the package
    copyDirRecursive(
      path.join(packageDir, 'content'),
      path.join(projectDir, 'content'),
    );
    copyDirRecursive(
      path.join(packageDir, 'public'),
      path.join(projectDir, 'public'),
    );
  }

  console.log(`\nGenerated a new site in ${projectDir}`);
  console.log(`\nNext steps:`);
  console.log(`  cd ${dirname}`);
  console.log(`  tada dev`);
  console.log(`  tada serve`);
}

async function cleanCommand(args: string[]): Promise<void> {
  fs.rmSync(path.resolve(process.cwd(), 'dist'), {
    recursive: true,
    force: true,
  });
  console.log('Cleaned dist/');

  if (args.includes('--prod')) {
    const prodBase = path.resolve(process.cwd(), 'dist-prod');
    if (fs.existsSync(prodBase)) {
      const { getVersions, pruneOldVersions } = await import(
        path.join(packageDir, 'build/build-manifest.ts')
      );
      const before = getVersions(prodBase);
      pruneOldVersions(prodBase);
      const after = getVersions(prodBase);
      const removed = before.length - after.length;

      if (removed > 0) {
        console.log(
          `Pruned ${removed} old prod build(s), kept v${after.join(' and v')}`,
        );
      }
    }
  }
}

async function diffCommand(args: string[]): Promise<void> {
  const { loadManifest, diffManifests, copyChangedFiles, getVersions } =
    await import(path.join(packageDir, 'build/build-manifest.ts'));

  const projectDir = process.cwd();
  const prodBase = path.resolve(projectDir, 'dist-prod');
  const versions = getVersions(prodBase);

  if (versions.length === 0) {
    console.error('Error: No prod builds found. Run "tada prod" first.');
    process.exit(1);
  }

  const copyIdx = args.indexOf('--copy');
  const versionArgs = copyIdx === -1 ? args : args.slice(0, copyIdx);
  const numericArgs = versionArgs
    .map(a => parseInt(a, 10))
    .filter(n => !isNaN(n));

  let oldVer: number;
  let newVer: number;

  if (numericArgs.length === 2) {
    [oldVer, newVer] = numericArgs.sort((a, b) => a - b);
  } else if (numericArgs.length === 0) {
    if (versions.length < 2) {
      console.error(
        'Error: Need at least two prod builds to diff. Run "tada prod" again.',
      );
      process.exit(1);
    }
    oldVer = versions[versions.length - 2];
    newVer = versions[versions.length - 1];
  } else {
    console.error('Error: Provide zero or two version numbers.');
    console.log('Usage: tada diff [N M] [--copy <dir>]');
    process.exit(1);
  }

  const oldManifestPath = path.join(prodBase, `v${oldVer}.manifest.json`);
  const newManifestPath = path.join(prodBase, `v${newVer}.manifest.json`);

  const oldManifest = loadManifest(oldManifestPath);
  if (!oldManifest) {
    console.error(`Error: No manifest for v${oldVer}.`);
    process.exit(1);
  }
  const newManifest = loadManifest(newManifestPath);
  if (!newManifest) {
    console.error(`Error: No manifest for v${newVer}.`);
    process.exit(1);
  }

  const diff = diffManifests(oldManifest, newManifest);
  const totalChanges =
    diff.added.length + diff.changed.length + diff.removed.length;

  console.log(`Comparing v${oldVer} and v${newVer}`);

  if (totalChanges === 0) {
    console.log('\nNo changes between builds.');
    return;
  }

  if (diff.added.length > 0) {
    console.log(`\nAdded (${diff.added.length}):`);
    for (const f of diff.added) {
      console.log(`  + ${f}`);
    }
  }
  if (diff.changed.length > 0) {
    console.log(`\nChanged (${diff.changed.length}):`);
    for (const f of diff.changed) {
      console.log(`  ~ ${f}`);
    }
  }
  if (diff.removed.length > 0) {
    console.log(`\nRemoved (${diff.removed.length}):`);
    for (const f of diff.removed) {
      console.log(`  - ${f}`);
    }
  }

  console.log(`\nTotal: ${totalChanges} file(s) differ`);

  if (copyIdx !== -1) {
    const outDirArg = args[copyIdx + 1];
    if (!outDirArg) {
      console.error('Error: --copy requires a directory argument');
      process.exit(1);
    }

    const newDistDir = path.join(prodBase, `v${newVer}`);
    const resolvedOutDir = path.resolve(projectDir, outDirArg);
    copyChangedFiles(diff, newDistDir, resolvedOutDir);

    const manifestSrc = path.join(prodBase, `v${newVer}.manifest.json`);
    fs.copyFileSync(manifestSrc, path.join(resolvedOutDir, 'manifest.json'));

    const copiedCount = diff.added.length + diff.changed.length;
    console.log(
      `\nCopied ${copiedCount} file(s) + manifest.json to ${outDirArg}`,
    );

    if (diff.removed.length > 0) {
      console.log(
        `\nNote: ${diff.removed.length} file(s) were removed from the build.`,
      );
    }
  }
}

/*
 * Start of script
 */

const command = process.argv[2];

switch (command) {
  case 'init':
    initCommand(process.argv.slice(3));
    break;

  case 'dev':
    requireSiteConfig('dev');
    run(`bun ${path.join(packageDir, 'build/pipeline.ts')} dev`);
    break;

  case 'prod':
    requireSiteConfig('prod');
    run(`bun ${path.join(packageDir, 'build/pipeline.ts')} prod`);
    break;

  case 'watch': {
    requireSiteConfig('dev');
    const watchArgs = process.argv.slice(3).join(' ');
    run(
      `bun ${path.join(packageDir, 'build/watch.ts')}${watchArgs ? ' ' + watchArgs : ''}`,
    );
    break;
  }

  case 'serve': {
    const serveArgs = process.argv.slice(3).join(' ');
    run(
      `bun ${path.join(packageDir, 'build/serve.ts')}${serveArgs ? ' ' + serveArgs : ''}`,
    );
    break;
  }

  case 'clean':
    cleanCommand(process.argv.slice(3));
    break;

  case 'diff':
    diffCommand(process.argv.slice(3));
    break;

  case '--version':
  case '-v':
    console.log(`tada v${version}`);
    break;

  default:
    printUsage();
    if (command && command !== '--help' && command !== '-h') {
      process.exit(1);
    }
    break;
}
