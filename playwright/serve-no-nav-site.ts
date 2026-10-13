// Serves a site without a nav file. Pass `--no-search` to also turn search off,
// which leaves the header static instead of fixed.
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import path from 'path';

const repoDir = path.resolve(import.meta.dir, '..');
const tada = path.join(repoDir, 'bin', 'tada.ts');
const coveragePreload = path.join(
  repoDir,
  'scripts',
  'coverage-preload-playwright.ts',
);
const args = process.argv.slice(2);
const coverageEnabled = args.includes('--coverage');
const search = !args.includes('--no-search');
const port = search ? '8083' : '8084';
const siteDir = path.join(
  repoDir,
  'playwright',
  '.no-nav-sites',
  search ? 'search' : 'static',
);

async function runTada(cmdArgs: string[], cwd = siteDir): Promise<void> {
  const command = ['bun'];
  if (coverageEnabled) {
    command.push('--preload', coveragePreload);
  }
  command.push(tada, ...cmdArgs);
  const proc = Bun.spawn(command, {
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
mkdirSync(path.dirname(siteDir), { recursive: true });
await runTada(['init', siteDir, '--bare', '--no-interactive'], repoDir);

const configPath = path.join(siteDir, 'site.dev.yaml');
const config = Bun.YAML.parse(readFileSync(configPath, 'utf-8')) as {
  features: Record<string, boolean>;
};
config.features.search = search;
writeFileSync(configPath, Bun.YAML.stringify(config, null, 2));

// Long enough to scroll the heading out of view and show the back-to-top link
const paragraphs = Array.from(
  { length: 60 },
  (_, i) => `Paragraph ${i + 1} of the page body.`,
).join('\n\n');
writeFileSync(
  path.join(siteDir, 'content', 'index.md'),
  `---\ntitle: Long Page\n---\n\n[Other page](/other.html)\n\n${paragraphs}\n\n## Target\n\nThe fragment target.\n\n${paragraphs}\n`,
);

writeFileSync(
  path.join(siteDir, 'content', 'other.md'),
  '---\ntitle: Other Page\n---\n\n[Home](/index.html)\n',
);

await runTada(['dev']);
await runTada(['serve', '--port', port]);
