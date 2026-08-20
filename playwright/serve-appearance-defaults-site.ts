import {
  cpSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'fs';
import path from 'path';
import { installCustomFontFixtures } from './custom-font-fixtures';

const repoDir = path.resolve(import.meta.dir, '..');
const tada = path.join(repoDir, 'bin', 'tada.ts');
const coveragePreload = path.join(
  repoDir,
  'scripts',
  'coverage-preload-playwright.ts',
);
const siteDir = path.join(repoDir, 'playwright', '.appearance-defaults-site');
const coverageEnabled = process.argv.slice(2).includes('--coverage');

async function runTada(args: string[], cwd = siteDir): Promise<void> {
  const command = ['bun'];
  if (coverageEnabled) {
    command.push('--preload', coveragePreload);
  }
  command.push(tada, ...args);
  await runInDirectory(command, cwd);
}

async function runInDirectory(args: string[], cwd: string): Promise<void> {
  const proc = Bun.spawn(args, {
    cwd,
    stdio: ['inherit', 'inherit', 'inherit'],
    env: process.env,
  });
  const exitCode = await proc.exited;
  if (exitCode !== 0) {
    process.exit(exitCode);
  }
}

rmSync(siteDir, { recursive: true, force: true });
await runTada(
  [
    'init',
    siteDir,
    '--bare',
    '--no-interactive',
    '--default-time-zone',
    'America/New_York',
  ],
  repoDir,
);

const configPath = path.join(siteDir, 'site.dev.yaml');
const config = readFileSync(configPath, 'utf-8')
  .replace('basePath: /', 'basePath: /custom')
  .replace('defaultFont: sans', 'defaultFont: serif')
  .replace('defaultContrast: standard', 'defaultContrast: high');
writeFileSync(
  configPath,
  `${config}${installCustomFontFixtures(repoDir, siteDir)}`,
);
writeFileSync(
  path.join(siteDir, 'content', 'index.md'),
  `---
title: Home
---

[Next page](/next.html)

Body regular, *italic*, **bold**, and ***bold italic***.

\`code\`, *\`italic code\`*, **\`bold code\`**, and ***\`bold italic code\`***.
`,
);
writeFileSync(
  path.join(siteDir, 'content', 'next.md'),
  '---\ntitle: Next\n---\n\n[Home](/index.html)\n\n`code`\n',
);

await runTada(['dev']);
const distDir = path.join(siteDir, 'dist');
const mountedDistDir = path.join(distDir, 'custom');
mkdirSync(mountedDistDir);
for (const entry of readdirSync(distDir)) {
  if (entry !== 'custom') {
    cpSync(path.join(distDir, entry), path.join(mountedDistDir, entry), {
      recursive: true,
    });
  }
}
await runTada(['serve', '--port', '8082']);
