import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawn } from 'child_process';

interface MutoolOutput {
  stdout: string;
  stderr: string;
}

export interface PdfPage {
  pageNumber: number;
  content: string;
}

export interface PdfExtractResult {
  pages: PdfPage[];
  hasExtractedText: boolean;
}

let mutoolAvailabilityPromise: Promise<void> | null = null;

function formatMutoolCommand(args: string[]): string {
  return ['mutool', ...args].map(arg => JSON.stringify(arg)).join(' ');
}

function runMutool(args: string[]): Promise<MutoolOutput> {
  return new Promise((resolve, reject) => {
    const child = spawn('mutool', args, { stdio: ['ignore', 'pipe', 'pipe'] });

    let settled = false;
    let stdout = '';
    let stderr = '';

    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      stdout += chunk;
    });

    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk: string) => {
      stderr += chunk;
    });

    child.on('error', (err: NodeJS.ErrnoException) => {
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

    child.on('close', (code: number | null) => {
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

export function assertMutoolAvailable(): Promise<void> {
  if (!mutoolAvailabilityPromise) {
    mutoolAvailabilityPromise = runMutool(['-v']).then(() => undefined);
  }

  return mutoolAvailabilityPromise;
}

interface NumberedPageFile {
  fileName: string;
  filePath: string;
  pageNum: number;
}

async function listNumberedPageFiles(
  dir: string,
  ext: string,
): Promise<NumberedPageFile[]> {
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
    .filter((entry): entry is NumberedPageFile => entry !== null)
    .sort((a, b) => a.pageNum - b.pageNum);
}

function normalizeExtractedText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

export function buildPdfPageRecords(pageTexts: string[]): PdfExtractResult {
  const pages: PdfPage[] = pageTexts
    .map((text, i) => {
      const normalized = normalizeExtractedText(text);
      if (!normalized) {
        return null;
      }

      return { pageNumber: i + 1, content: normalized };
    })
    .filter((entry): entry is PdfPage => entry !== null);

  return { pages, hasExtractedText: pages.length > 0 };
}

export async function extractPdfPages(
  pdfPath: string,
): Promise<PdfExtractResult> {
  await assertMutoolAvailable();

  const tempDir = await fs.promises.mkdtemp(
    path.join(os.tmpdir(), 'pdf-text-'),
  );
  const textPattern = path.join(tempDir, 'page-%04d.txt');
  let processingError: unknown = null;

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
          `Failed to clean up temporary PDF extraction directory ${tempDir}: ${(cleanupErr as Error).message}`,
        );
      }
    }
  }
}
