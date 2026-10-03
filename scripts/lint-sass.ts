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

const lintThemeSiteVariables: SiteVariables = {
  base: 'https://example.com',
  basePath: '/',
  title: 'Lint',
  titlePostfix: ' - Lint',
  themeColor: 'steelblue',
  defaultTimeZone: 'America/New_York',
  features: { search: true, favicon: true, footer: true, pickers: true },
  tintHue: 20,
  tintAmount: 100,
};

async function runStylelint(args: string[], input?: string): Promise<number> {
  const proc = Bun.spawn({
    cmd: ['bunx', ...stylelintArgs, ...args],
    cwd: packageDir,
    env: process.env,
    stdin: input === undefined ? 'ignore' : new Blob([input]),
    stdout: 'inherit',
    stderr: 'inherit',
  });

  return await proc.exited;
}

async function main() {
  let exitCode = await runStylelint([
    ...(fix ? ['--fix'] : []),
    'src/**/*.scss',
  ]);

  // The theme is a Lodash template, so lint its rendered output through stdin.
  // Fixes cannot be written back to the template, so --fix is not passed.
  exitCode ||= await runStylelint(
    ['--stdin-filename', 'templates/_theme.scss (rendered)'],
    renderThemeScss(lintThemeSiteVariables),
  );

  if (exitCode !== 0) {
    process.exit(exitCode);
  }
}

await main();
