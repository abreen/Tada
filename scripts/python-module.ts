import { runPythonModuleSync } from '../python/module';

const [moduleName, ...args] = process.argv.slice(2);

if (!moduleName) {
  console.error('Usage: bun run scripts/python-module.ts <module> [args...]');
  process.exit(1);
}

process.exit(runPythonModuleSync(moduleName, args, { stdio: 'inherit' }));
