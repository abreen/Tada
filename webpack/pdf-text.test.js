const fs = require('fs');
const os = require('os');
const path = require('path');
const { afterEach, beforeEach, describe, expect, test } = require('bun:test');
const pdfText = require('./pdf-text');

const TEST_ENV_KEYS = [
  'TEST_MUTOOL_FAIL',
  'TEST_MUTOOL_PAGE_1',
  'TEST_MUTOOL_PAGE_2',
  'TEST_MUTOOL_PAGE_3',
];

let originalPath = '';
let originalWarn = console.warn;
let tempDirs = [];

async function createFakeMutoolDir() {
  const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'mutool-test-'));
  const filePath = path.join(dir, 'mutool');
  const script = `#!/bin/sh
if [ "$1" = "-v" ]; then
  exit 0
fi

out=""
want_output=0
for arg in "$@"; do
  if [ "$want_output" = "1" ]; then
    out="$arg"
    want_output=0
    continue
  fi
  if [ "$arg" = "-o" ]; then
    want_output=1
  fi
done

if [ "$TEST_MUTOOL_FAIL" = "1" ]; then
  echo "forced failure" >&2
  exit 1
fi

write_page() {
  idx="$1"
  text="$2"
  if [ -z "$text" ]; then
    return
  fi
  file=$(printf "$out" "$idx")
  mkdir -p "$(dirname "$file")"
  printf '%s' "$text" > "$file"
}

write_page 1 "$TEST_MUTOOL_PAGE_1"
write_page 2 "$TEST_MUTOOL_PAGE_2"
write_page 3 "$TEST_MUTOOL_PAGE_3"
`;
  await fs.promises.writeFile(filePath, script, { mode: 0o755 });
  tempDirs.push(dir);
  return dir;
}

async function listExtractionDirs() {
  const entries = await fs.promises.readdir(os.tmpdir());
  return new Set(entries.filter(name => name.startsWith('pdf-text-')));
}

function setMutoolEnv(values) {
  for (const key of TEST_ENV_KEYS) {
    if (key in values) {
      process.env[key] = values[key];
    } else {
      delete process.env[key];
    }
  }
}

beforeEach(() => {
  originalPath = process.env.PATH || '';
  originalWarn = console.warn;
  pdfText.__test.resetMutoolAvailability();
  setMutoolEnv({});
});

afterEach(async () => {
  process.env.PATH = originalPath;
  console.warn = originalWarn;
  pdfText.__test.resetMutoolAvailability();
  setMutoolEnv({});
  await Promise.all(
    tempDirs.map(dir => fs.promises.rm(dir, { recursive: true, force: true })),
  );
  tempDirs = [];
});

describe('pdf-text', () => {
  test('buildPdfPageRecords keeps non-empty pages with page numbers', () => {
    const result = pdfText.__test.buildPdfPageRecords([
      ' Hello   world ',
      '\n\n',
      'Another\tpage',
    ]);

    expect(result).toEqual({
      pages: [
        { pageNumber: 1, content: 'Hello world' },
        { pageNumber: 3, content: 'Another page' },
      ],
      hasExtractedText: true,
    });
  });

  test('buildPdfRecordContent normalizes and prefixes the filename', () => {
    const result = pdfText.__test.buildPdfRecordContent('/tmp/docs/guide.pdf', [
      ' Hello   world ',
      '\n\n',
      'Another\tpage',
    ]);

    expect(result).toEqual({
      content: 'guide.pdf\n\nHello world\n\nAnother page',
      hasExtractedText: true,
    });
  });

  test('extractPdfText reads mutool output, drops empty pages, and cleans up', async () => {
    const fakeMutoolDir = await createFakeMutoolDir();
    process.env.PATH = `${fakeMutoolDir}:${originalPath}`;
    setMutoolEnv({
      TEST_MUTOOL_PAGE_1: '  Hello   world  ',
      TEST_MUTOOL_PAGE_2: '   ',
      TEST_MUTOOL_PAGE_3: 'Third\tpage',
    });

    const beforeDirs = await listExtractionDirs();
    const result = await pdfText.extractPdfText('/tmp/docs/guide.pdf');
    const afterDirs = await listExtractionDirs();

    expect(result).toBe('guide.pdf\n\nHello world\n\nThird page');
    expect(afterDirs).toEqual(beforeDirs);
  });

  test('extractPdfPages returns page-numbered records', async () => {
    const fakeMutoolDir = await createFakeMutoolDir();
    process.env.PATH = `${fakeMutoolDir}:${originalPath}`;
    setMutoolEnv({
      TEST_MUTOOL_PAGE_1: '  Hello   world  ',
      TEST_MUTOOL_PAGE_2: '   ',
      TEST_MUTOOL_PAGE_3: 'Third\tpage',
    });

    const result = await pdfText.extractPdfPages('/tmp/docs/guide.pdf');

    expect(result).toEqual({
      pages: [
        { pageNumber: 1, content: 'Hello world' },
        { pageNumber: 3, content: 'Third page' },
      ],
      hasExtractedText: true,
    });
  });

  test('extractPdfText warns and falls back to filename-only content', async () => {
    const fakeMutoolDir = await createFakeMutoolDir();
    process.env.PATH = `${fakeMutoolDir}:${originalPath}`;
    setMutoolEnv({ TEST_MUTOOL_PAGE_1: '   ' });

    const warnings = [];
    console.warn = message => warnings.push(String(message));

    const result = await pdfText.extractPdfText('/tmp/docs/guide.pdf');

    expect(result).toBe('guide.pdf');
    expect(warnings).toEqual([
      'mutool did not extract searchable text for /tmp/docs/guide.pdf; indexing filename only',
    ]);
  });

  test('extractPdfText cleans up temp directories when mutool fails', async () => {
    const fakeMutoolDir = await createFakeMutoolDir();
    process.env.PATH = `${fakeMutoolDir}:${originalPath}`;
    setMutoolEnv({ TEST_MUTOOL_FAIL: '1' });

    const beforeDirs = await listExtractionDirs();

    await expect(pdfText.extractPdfText('/tmp/docs/guide.pdf')).rejects.toThrow(
      'forced failure',
    );

    const afterDirs = await listExtractionDirs();
    expect(afterDirs).toEqual(beforeDirs);
  });
});
