import { rmSync } from 'fs';
import path from 'path';

const repoDir = path.resolve(import.meta.dir, '..');
const tada = path.join(repoDir, 'bin', 'tada.ts');
const siteDir = path.join(repoDir, 'playwright', '.test-site');

async function run(args: string[], cwd = repoDir): Promise<void> {
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

await run([
  'bun',
  tada,
  'init',
  siteDir,
  '--no-interactive',
  '--default-time-zone',
  'America/New_York',
]);
await run(['bun', tada, 'dev'], siteDir);
await run(['bun', tada, 'serve', '--port', '8081'], siteDir);
