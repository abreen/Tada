import fs from 'fs';
import path from 'path';
import { renderThemeScss } from '../build/bundle';
import { getPackageDir } from '../build/utils/paths';
import type { SiteVariables } from '../build/types';

const packageDir = getPackageDir();
const configFile = path.join(packageDir, 'stylelint.config.mjs');
const fix = process.argv.includes('--fix');
const stylelintArgs = [
  'stylelint',
  '--config',
  configFile,
  '--formatter',
  'string',
  '--max-warnings',
  '0',
];

if (fix) {
  stylelintArgs.push('--fix');
}

const lintThemeSiteVariables: SiteVariables = {
  base: 'https://example.com',
  basePath: '/',
  title: 'Lint',
  titlePostfix: ' - Lint',
  themeColor: 'steelblue',
  defaultTimeZone: 'America/New_York',
  features: { search: true, favicon: true, footer: true },
  tintHue: 20,
  tintAmount: 100,
};

async function runStylelint(args: string[]): Promise<number> {
  const proc = Bun.spawn({
    cmd: ['bunx', ...stylelintArgs, ...args],
    cwd: packageDir,
    env: process.env,
    stdin: 'ignore',
    stdout: 'inherit',
    stderr: 'inherit',
  });

  return await proc.exited;
}

async function main() {
  let themeDir: string | undefined;
  let exitCode = 0;

  try {
    exitCode ||= await runStylelint(['src/**/*.scss']);

    themeDir = renderThemeScss(lintThemeSiteVariables);
    const renderedThemePath = path.join(themeDir, 'config/_theme.scss');
    exitCode ||= await runStylelint([renderedThemePath]);
  } finally {
    if (themeDir) {
      fs.rmSync(themeDir, { recursive: true, force: true });
    }
  }

  if (exitCode !== 0) {
    process.exit(exitCode);
  }
}

await main();
