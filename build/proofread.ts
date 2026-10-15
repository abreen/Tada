import fs from 'fs';
import { fileURLToPath } from 'url';
import type { LocalLinter } from 'harper.js';
import { makeLogger } from './log';
import {
  proofreadHtml,
  type IssueKind,
  type TextIssue,
} from './utils/proofread-html';
import type { TadaSourceRecord } from './source-records';
import type { OutputContent, ProofreadConfig, SiteVariables } from './types';

const log = makeLogger(import.meta.url);

const SPELLING_KINDS = new Set(['Spelling', 'Typo']);

let linterPromise: Promise<LocalLinter | null> | null = null;
let importedWords: string | null = null;

async function loadLinter(): Promise<LocalLinter> {
  const { LocalLinter, Dialect, createBinaryModuleFromUrl } =
    await import('harper.js');
  // Harper fetches its WebAssembly from a URL; a blob URL avoids fetching a
  // file: URL, which is not supported on every platform
  const wasmPath = fileURLToPath(
    new URL('harper_wasm_bg.wasm', import.meta.resolve('harper.js')),
  );
  const wasm = new Blob([fs.readFileSync(wasmPath)], {
    type: 'application/wasm',
  });
  const binary = createBinaryModuleFromUrl(URL.createObjectURL(wasm));
  const linter = new LocalLinter({ binary, dialect: Dialect.American });
  await linter.setup();
  return linter;
}

/** Harper, loaded the first time watch mode proofreads, or null if it failed to load */
async function getLinter(words: string[]): Promise<LocalLinter | null> {
  if (!linterPromise) {
    log.info`Loading Harper`;
    linterPromise = loadLinter().catch((error: unknown) => {
      log.warn`Harper failed to load, so pages will not be proofread: ${(error as Error).message}`;
      return null;
    });
  }
  const linter = await linterPromise;
  if (!linter) {
    return null;
  }
  const key = JSON.stringify(words);
  if (key !== importedWords) {
    await linter.clearWords();
    await linter.importWords(words);
    importedWords = key;
  }
  return linter;
}

/** Maps code point offsets, which Harper reports, to UTF-16 offsets */
export function toUtf16Offsets(text: string): (offset: number) => number {
  if (!/[\uD800-\uDFFF]/.test(text)) {
    return offset => offset;
  }
  const offsets: number[] = [];
  let utf16 = 0;
  for (const char of text) {
    offsets.push(utf16);
    utf16 += char.length;
  }
  offsets.push(utf16);
  return offset => offsets[Math.min(offset, offsets.length - 1)];
}

async function checkText(
  linter: LocalLinter,
  text: string,
): Promise<TextIssue[]> {
  const toUtf16 = toUtf16Offsets(text);
  const issues: TextIssue[] = [];
  for (const lint of await linter.lint(text, { language: 'plaintext' })) {
    const span = lint.span();
    const kind: IssueKind = SPELLING_KINDS.has(lint.lint_kind())
      ? 'spelling'
      : 'grammar';
    issues.push({ start: toUtf16(span.start), end: toUtf16(span.end), kind });
    span.free();
    lint.free();
  }
  return issues;
}

/** The site's proofread options, or null if `proofread: false` turns it off */
export function getProofreadConfig(
  siteVariables: SiteVariables,
): ProofreadConfig | null {
  const { proofread } = siteVariables;
  if (proofread === false) {
    return null;
  }
  return typeof proofread === 'object' ? proofread : {};
}

/**
 * Underlines spelling and grammar problems in the HTML pages of the given
 * content records, in place. Only watch mode calls this.
 */
export async function proofreadRecords(
  records: Iterable<TadaSourceRecord>,
  config: ProofreadConfig,
): Promise<void> {
  const pages: [Map<string, OutputContent>, string, string][] = [];
  for (const record of records) {
    if (record.kind !== 'content') {
      continue;
    }
    for (const [outputPath, content] of record.outputs) {
      if (outputPath.endsWith('.html') && typeof content === 'string') {
        pages.push([record.outputs, outputPath, content]);
      }
    }
  }
  if (pages.length === 0) {
    return;
  }

  const linter = await getLinter(config.words ?? []);
  if (!linter) {
    return;
  }
  log.info`Proofreading ${pages.length} ${pages.length === 1 ? 'page' : 'pages'}`;
  for (const [outputs, outputPath, html] of pages) {
    outputs.set(
      outputPath,
      await proofreadHtml(html, text => checkText(linter, text)),
    );
  }
}
