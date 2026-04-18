if (!Bun.which('bun')) {
  console.error('Warning: Bun is required to develop this project.');
}

if (!Bun.which('javac')) {
  console.error('Warning: javac is required to develop this project.');
}

if (!Bun.which('mutool')) {
  console.error('Warning: mutool (MuPDF) is required to run functional tests.');
}

if (!Bun.which('python3') && !Bun.which('python')) {
  console.error(
    'Warning: python3 or python is required to run functional tests.',
  );
}
