// Runs Harper off the main thread, so pages keep rendering while it checks them
import fs from 'fs';
import { fileURLToPath } from 'url';
import type { LocalLinter } from 'harper.js';
import { toTextIssues } from './utils/proofread-html';
import type {
  ProofreadRequest,
  ProofreadResponse,
} from './utils/proofread-html';

declare const self: {
  postMessage(message: ProofreadResponse): void;
  onmessage: ((event: MessageEvent<ProofreadRequest>) => void) | null;
};

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

function respond(response: ProofreadResponse) {
  self.postMessage(response);
}

const ready = loadLinter();
ready.catch((error: unknown) =>
  respond({ type: 'failed', message: (error as Error).message }),
);

async function handle(request: ProofreadRequest) {
  let linter: LocalLinter;
  try {
    linter = await ready;
  } catch {
    // The failed load was already reported
    return;
  }
  if (request.type === 'words') {
    await linter.clearWords();
    await linter.importWords(request.words);
    return;
  }
  const lints = await linter.lint(request.text, { language: 'plaintext' });
  const found = lints.map(lint => {
    const span = lint.span();
    const result = {
      start: span.start,
      end: span.end,
      kind: lint.lint_kind(),
      message: lint.message(),
      messageHtml: lint.message_html(),
    };
    span.free();
    lint.free();
    return result;
  });
  respond({
    type: 'issues',
    id: request.id,
    issues: toTextIssues(request.text, found),
  });
}

// Requests are handled one at a time, in the order they arrive
let queue = Promise.resolve();

self.onmessage = (event: MessageEvent<ProofreadRequest>) => {
  queue = queue
    .then(() => handle(event.data))
    .catch((error: unknown) =>
      respond({ type: 'failed', message: (error as Error).message }),
    );
};
