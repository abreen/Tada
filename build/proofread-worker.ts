// Runs Harper off the main thread, so pages keep rendering while it checks them
import fs from 'fs';
import { fileURLToPath } from 'url';
import type { Dialect, LocalLinter } from 'harper.js';
import { toLintConfig, toTextIssues } from './utils/proofread-html';
import type {
  ProofreadRequest,
  ProofreadResponse,
} from './utils/proofread-html';
import type { ProofreadDialect } from './types';

declare const self: {
  postMessage(message: ProofreadResponse): void;
  onmessage: ((event: MessageEvent<ProofreadRequest>) => void) | null;
};

interface Harper {
  linter: LocalLinter;
  dialects: Record<ProofreadDialect, Dialect>;
  /** Harper's lint config before any rules are configured */
  defaultConfig: Record<string, boolean | null>;
}

async function loadHarper(): Promise<Harper> {
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
  return {
    linter,
    dialects: {
      american: Dialect.American,
      british: Dialect.British,
      australian: Dialect.Australian,
      canadian: Dialect.Canadian,
      indian: Dialect.Indian,
    },
    defaultConfig: await linter.getDefaultLintConfig(),
  };
}

function respond(response: ProofreadResponse) {
  self.postMessage(response);
}

const ready = loadHarper();
ready.catch((error: unknown) =>
  respond({ type: 'failed', message: (error as Error).message }),
);

async function handle(request: ProofreadRequest) {
  let harper: Harper;
  try {
    harper = await ready;
  } catch {
    // The failed load was already reported
    return;
  }
  const { linter } = harper;
  if (request.type === 'configure') {
    await linter.setDialect(harper.dialects[request.dialect]);
    await linter.clearWords();
    await linter.importWords(request.words);
    // Rules start from the defaults, so a rule removed from the config resets
    const { config, unknown } = toLintConfig(
      harper.defaultConfig,
      request.rules,
    );
    await linter.setLintConfig(config);
    if (unknown.length > 0) {
      respond({
        type: 'warning',
        message: `Harper has no proofread rules named ${unknown.join(', ')}`,
      });
    }
    return;
  }
  // Lints grouped by the name of the rule that found them, as in the config
  const lintsByRule = await linter.organizedLints(request.text, {
    language: 'plaintext',
  });
  const found = Object.entries(lintsByRule)
    .flatMap(([rule, lints]) =>
      lints.map(lint => {
        const span = lint.span();
        const result = {
          start: span.start,
          end: span.end,
          kind: lint.lint_kind(),
          rule,
          message: lint.message(),
          messageHtml: lint.message_html(),
        };
        span.free();
        lint.free();
        return result;
      }),
    )
    .sort((a, b) => a.start - b.start);
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
      respond({
        type: 'failed',
        id: event.data.type === 'check' ? event.data.id : undefined,
        message: (error as Error).message,
      }),
    );
};
