import { makeLogger } from './log';
import {
  proofreadHtml,
  type ProofreadRequest,
  type ProofreadResponse,
  type TextIssue,
} from './utils/proofread-html';
import type { TadaSourceRecord } from './source-records';
import type { ProofreadConfig, SiteVariables } from './types';

const log = makeLogger(import.meta.url);

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
 * Checks text with Harper in a worker. Requests are posted at once, so the
 * worker checks pages while later ones render; results arrive once the main
 * thread is free.
 */
export class Proofreader {
  private readonly worker: Worker;
  private readonly pending = new Map<number, (issues: TextIssue[]) => void>();
  private nextId = 0;
  private failed = false;
  private words: string | null = null;

  constructor() {
    log.info`Loading Harper`;
    this.worker = new Worker(new URL('./proofread-worker.ts', import.meta.url));
    // Bun's Worker can let the process exit while it is running
    (this.worker as Worker & { unref(): void }).unref();
    this.worker.onmessage = (event: MessageEvent<ProofreadResponse>) => {
      const response = event.data;
      if (response.type === 'failed' && response.id !== undefined) {
        // Only this text goes unchecked
        log.warn`Harper failed to check some text: ${response.message}`;
        this.pending.get(response.id)?.([]);
        this.pending.delete(response.id);
        return;
      }
      if (response.type === 'failed') {
        this.fail(response.message);
        return;
      }
      this.pending.get(response.id)?.(response.issues);
      this.pending.delete(response.id);
    };
    this.worker.onerror = event => this.fail(event.message);
  }

  private post(request: ProofreadRequest) {
    this.worker.postMessage(request);
  }

  // Pages are still built when Harper fails; they are just not proofread
  private fail(message: string) {
    if (!this.failed) {
      log.warn`Harper failed, so pages will not be proofread: ${message}`;
    }
    this.failed = true;
    for (const resolve of this.pending.values()) {
      resolve([]);
    }
    this.pending.clear();
  }

  setWords(words: string[]) {
    const key = JSON.stringify(words);
    if (key !== this.words) {
      this.post({ type: 'words', words });
      this.words = key;
    }
  }

  check = (text: string): Promise<TextIssue[]> => {
    if (this.failed) {
      return Promise.resolve([]);
    }
    const id = this.nextId++;
    const issues = new Promise<TextIssue[]>(resolve =>
      this.pending.set(id, resolve),
    );
    this.post({ type: 'check', id, text });
    return issues;
  };
}

let proofreader: Proofreader | null = null;

/**
 * Starts Harper loading, if the site proofreads, and returns the proofreader
 * that watch mode keeps for the whole session
 */
export function startProofreader(
  siteVariables: SiteVariables,
): Proofreader | null {
  const config = getProofreadConfig(siteVariables);
  if (!config) {
    return null;
  }
  proofreader ??= new Proofreader();
  proofreader.setWords(config.words ?? []);
  return proofreader;
}

/**
 * Sends the text of a content record's HTML pages to the proofreader right
 * away, and underlines the problems it finds in place once they arrive
 */
export function proofreadRecord(
  record: TadaSourceRecord,
  proofreader: Proofreader,
): Promise<void>[] {
  if (record.kind !== 'content') {
    return [];
  }
  return [...record.outputs]
    .filter(
      (entry): entry is [string, string] =>
        entry[0].endsWith('.html') && typeof entry[1] === 'string',
    )
    .map(async ([outputPath, html]) => {
      record.outputs.set(
        outputPath,
        await proofreadHtml(html, proofreader.check),
      );
    });
}
