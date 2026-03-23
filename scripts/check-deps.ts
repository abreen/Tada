if (!Bun.which('bun')) {
  console.error('Warning: Bun is required to develop this project.');
}

if (!Bun.which('javac')) {
  console.error('Warning: javac is required to develop this project.');
}

if (!Bun.which('python3')) {
  console.error('Warning: python3 is required to run functional tests.');
}
