const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

let mutoolAvailabilityPromise = null;

function formatMutoolCommand(args) {
  return ['mutool', ...args].map(arg => JSON.stringify(arg)).join(' ');
}

function runMutool(args) {
  return new Promise((resolve, reject) => {
    const child = spawn('mutool', args, { stdio: ['ignore', 'pipe', 'pipe'] });

    let settled = false;
    let stdout = '';
    let stderr = '';

    child.stdout.setEncoding('utf8');
    child.stdout.on('data', chunk => {
      stdout += chunk;
    });

    child.stderr.setEncoding('utf8');
    child.stderr.on('data', chunk => {
      stderr += chunk;
    });

    child.on('error', err => {
      if (settled) {
        return;
      }
      settled = true;

      if (err && err.code === 'ENOENT') {
        reject(
          new Error(
            'mutool is required for PDF text extraction but was not found on PATH',
          ),
        );
        return;
      }

      reject(err);
    });

    child.on('close', code => {
      if (settled) {
        return;
      }
      settled = true;

      if (code !== 0) {
        const output = stderr.trim() || stdout.trim();
        const suffix = output.length > 0 ? `: ${output}` : '';
        reject(
          new Error(
            `${formatMutoolCommand(args)} failed (code ${code})${suffix}`,
          ),
        );
        return;
      }

      resolve({ stdout, stderr });
    });
  });
}

function assertMutoolAvailable() {
  if (!mutoolAvailabilityPromise) {
    mutoolAvailabilityPromise = runMutool(['-v']).then(() => undefined);
  }

  return mutoolAvailabilityPromise;
}

async function listNumberedPageFiles(dir, ext) {
  const suffix = `.${ext}`;
  const entries = await fs.promises.readdir(dir);

  return entries
    .filter(name => name.startsWith('page-') && name.endsWith(suffix))
    .map(name => {
      const pageNumText = name.slice(5, -suffix.length);
      const pageNum = Number.parseInt(pageNumText, 10);
      if (!Number.isInteger(pageNum)) {
        return null;
      }

      return { fileName: name, filePath: path.join(dir, name), pageNum };
    })
    .filter(entry => entry !== null)
    .sort((a, b) => a.pageNum - b.pageNum);
}

function normalizeExtractedText(text) {
  return text.replace(/\s+/g, ' ').trim();
}

function buildPdfPageRecords(pageTexts) {
  const pages = pageTexts
    .map((text, i) => {
      const normalized = normalizeExtractedText(text);
      if (!normalized) {
        return null;
      }

      return { pageNumber: i + 1, content: normalized };
    })
    .filter(Boolean);

  return { pages, hasExtractedText: pages.length > 0 };
}

function buildPdfRecordContent(pdfPath, pageTexts) {
  const fileName = path.basename(pdfPath);
  const normalizedPages = pageTexts.map(normalizeExtractedText).filter(Boolean);

  if (normalizedPages.length === 0) {
    return { content: fileName, hasExtractedText: false };
  }

  return {
    content: `${fileName}\n\n${normalizedPages.join('\n\n')}`,
    hasExtractedText: true,
  };
}

async function extractPdfPages(pdfPath) {
  await assertMutoolAvailable();

  const tempDir = await fs.promises.mkdtemp(
    path.join(os.tmpdir(), 'pdf-text-'),
  );
  const textPattern = path.join(tempDir, 'page-%04d.txt');
  let processingError = null;

  try {
    await runMutool(['draw', '-q', '-F', 'text', '-o', textPattern, pdfPath]);

    const textFiles = await listNumberedPageFiles(tempDir, 'txt');
    const pageTexts = await Promise.all(
      textFiles.map(textFile =>
        fs.promises.readFile(textFile.filePath, 'utf8'),
      ),
    );
    const result = buildPdfPageRecords(pageTexts);

    if (!result.hasExtractedText) {
      console.warn(
        `mutool did not extract searchable text for ${pdfPath}; indexing filename only`,
      );
    }

    return result;
  } catch (err) {
    processingError = err;
    throw err;
  } finally {
    try {
      await fs.promises.rm(tempDir, { recursive: true, force: true });
    } catch (cleanupErr) {
      if (!processingError) {
        console.warn(
          `Failed to clean up temporary PDF extraction directory ${tempDir}: ${cleanupErr.message}`,
        );
      }
    }
  }
}

async function extractPdfText(pdfPath) {
  const { pages } = await extractPdfPages(pdfPath);
  const pageTexts = pages.map(p => p.content);
  return buildPdfRecordContent(pdfPath, pageTexts).content;
}

function resetMutoolAvailability() {
  mutoolAvailabilityPromise = null;
}

module.exports = {
  assertMutoolAvailable,
  extractPdfPages,
  extractPdfText,
  __test: {
    buildPdfPageRecords,
    buildPdfRecordContent,
    listNumberedPageFiles,
    normalizeExtractedText,
    resetMutoolAvailability,
  },
};
