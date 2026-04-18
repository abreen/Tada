import { existsSync } from 'fs';
import path from 'path';

const repoDir = path.resolve(import.meta.dir, '..');
const exampleDir = path.join(repoDir, 'example');

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

if (!existsSync(exampleDir)) {
  await run(['bun', 'run', 'init-example']);
}

await run(['bun', path.join(repoDir, 'bin', 'tada.ts'), 'watch'], exampleDir);
