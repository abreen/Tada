#!/usr/bin/env bun
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { execSync } = require('child_process');
const { version } = require('../package.json');
const {
  validateSymbol,
  validateHslColor,
  validateUrl,
  validateBasePath,
  createSiteConfig,
} = require('./validators');

const SYSTEM_TIME_ZONE = Intl.DateTimeFormat().resolvedOptions().timeZone;

const packageDir = path.resolve(__dirname, '..');

const COMMANDS = {
  init: 'Create a new Tada site',
  dev: 'Build the site for development',
  prod: 'Build the site for production',
  watch: 'Watch for changes and rebuild',
  serve: 'Start a local development server',
  clean: 'Remove the dist/ directory',
};

const INIT_QUESTIONS = {
  title: {
    prompt: 'Site title',
    defaultValue: 'Introduction to Computer Science',
    validate: v => (v ? null : 'Title is required'),
  },
  symbol: {
    prompt: 'Logo symbol (1-5 uppercase chars)',
    defaultValue: 'CS 0',
    validate: validateSymbol,
  },
  themeColor: {
    prompt: 'Theme color',
    defaultValue: 'hsl(195 70% 40%)',
    validate: validateHslColor,
  },
  tintHue: {
    prompt: 'Background tint hue (0-360)',
    defaultValue: '20',
    validate: v => {
      const n = Number(v);
      if (!Number.isInteger(n) || n < 0 || n > 360) {
        return 'Must be an integer from 0 to 360';
      }
      return null;
    },
  },
  tintAmount: {
    prompt: 'Background tint amount (0-100)',
    defaultValue: '100',
    validate: v => {
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
    validate: v => (v ? null : 'Time zone is required'),
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
  console.log('  init <dirname>     Initialize a new site');
  for (const [cmd, desc] of Object.entries(COMMANDS)) {
    if (cmd === 'init') {
      console.log('       [--default]     Use defaults for all config options');
      continue;
    }
    console.log(`  ${cmd.padEnd(18)} ${desc}`);
  }
}

const webpackCli = require.resolve('webpack-cli/bin/cli.js');

function run(cmd) {
  execSync(cmd, { cwd: process.cwd(), stdio: 'inherit' });
}

function copyDirRecursive(src, dest) {
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

// --- init command ---

function ask(rl, question, { defaultValue, validate } = {}) {
  const suffix = defaultValue != null ? ` (default: ${defaultValue})` : '';
  return new Promise(resolve => {
    function prompt() {
      rl.question(`${question}${suffix}? `, answer => {
        const value = answer.trim() || defaultValue || '';
        if (validate) {
          const error = validate(value);
          if (error) {
            console.error(`Error: ${error}`);
            prompt();
            return;
          }
        }
        resolve(value);
      });
    }
    prompt();
  });
}

async function initCommand(args) {
  const useDefaults = args.includes('--default');
  const dirname = args.filter(a => !a.startsWith('--'))[0];

  if (!dirname) {
    console.error('Error: Provide a name for the new directory');
    console.log('Usage: tada init <dirname> [--default]');
    process.exit(1);
  }

  const projectDir = path.resolve(process.cwd(), dirname);
  if (fs.existsSync(projectDir)) {
    console.error(`Error: "${dirname}" already exists`);
    process.exit(1);
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  let message = `Creating a new Tada site in ${projectDir}`;
  if (useDefaults) {
    console.log(message + ' using default config');
  } else {
    console.log(message);
  }

  const config = {};

  for (const [key, { prompt, defaultValue, validate }] of Object.entries(
    INIT_QUESTIONS,
  )) {
    if (useDefaults) {
      config[key] = defaultValue;
    } else {
      config[key] = await ask(rl, prompt, { defaultValue, validate });
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

  rl.close();

  // Derive internal domain from production base URL
  const prodDomain = new URL(prodBase).hostname;

  // Create project directory
  fs.mkdirSync(path.join(projectDir, 'config'), { recursive: true });

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
  });

  fs.writeFileSync(
    path.join(projectDir, 'config/site.dev.json'),
    JSON.stringify(devConfig, null, 2) + '\n',
  );

  fs.writeFileSync(
    path.join(projectDir, 'config/site.prod.json'),
    JSON.stringify(prodConfig, null, 2) + '\n',
  );

  // Copy nav and authors data files to the project's config directory
  fs.copyFileSync(
    path.join(packageDir, 'config/nav.json'),
    path.join(projectDir, 'config/nav.json'),
  );
  fs.copyFileSync(
    path.join(packageDir, 'config/authors.json'),
    path.join(projectDir, 'config/authors.json'),
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

  console.log(`\nGenerated a new site in ${projectDir}`);
  console.log(`\nNext steps:`);
  console.log(`  cd ${dirname}`);
  console.log(`  tada dev`);
  console.log(`  tada serve`);
}

// --- main ---

const command = process.argv[2];

switch (command) {
  case 'init':
    initCommand(process.argv.slice(3));
    break;

  case 'dev':
    run(
      `bun ${webpackCli} --config ${path.join(packageDir, 'webpack/config.dev.js')}`,
    );
    break;

  case 'prod':
    run(
      `bun ${webpackCli} --config ${path.join(packageDir, 'webpack/config.prod.js')}`,
    );
    break;

  case 'watch':
    run(`bun ${path.join(packageDir, 'webpack/watch.js')}`);
    break;

  case 'serve':
    run(`bun ${path.join(packageDir, 'webpack/serve.js')}`);
    break;

  case 'clean':
    fs.rmSync(path.resolve(process.cwd(), 'dist'), {
      recursive: true,
      force: true,
    });
    console.log('Cleaned dist/');
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
