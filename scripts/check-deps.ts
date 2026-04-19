import { resolvePythonCommand } from '../python/command';

if (!Bun.which('javac')) {
  console.error('Warning: javac is required to develop this project.');
}

if (!Bun.which('mutool')) {
  console.error('Warning: mutool (MuPDF) is required to run functional tests.');
}

if (!resolvePythonCommand()) {
  console.error('Warning: Python is required to run functional tests.');
}
