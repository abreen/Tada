import { $ } from 'bun';

const pythonCommand = Bun.which('python3')
  ? 'python3'
  : Bun.which('python')
    ? 'python'
    : null;

if (!pythonCommand) {
  console.error(
    'Error: python3 or python is required to set up functional test dependencies.',
  );
  process.exit(1);
}

await $`${pythonCommand} -m pip install -q -r functional_tests/requirements.txt`;
