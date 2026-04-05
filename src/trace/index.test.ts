import { describe, expect, test, beforeEach, afterEach } from 'bun:test';
import { JSDOM } from 'jsdom';
import type { TraceManifest, TraceChunkEntry } from './types';
import mount from './index';

function makeManifest(overrides: Partial<TraceManifest> = {}): TraceManifest {
  return {
    totalSteps: 3,
    chunkSize: 10,
    sourceFile: 'Main.java',
    source: 'public class Main {}',
    lineToSteps: {},
    ...overrides,
  };
}

function makeChunk(
  entries: Array<{ line?: number; stdout?: string; svg?: string }>,
): TraceChunkEntry[] {
  return entries.map(e => ({
    line: e.line ?? 1,
    stdout: e.stdout ?? '',
    svg: e.svg ?? '<svg></svg>',
  }));
}

const defaultManifest = makeManifest();
const defaultChunk = makeChunk([
  { line: 1, stdout: '', svg: '<svg>step0</svg>' },
  { line: 2, stdout: 'hello', svg: '<svg>step1</svg>' },
  { line: 3, stdout: ' world', svg: '<svg>step2</svg>' },
]);

function widgetHtml(manifestUrl = '/trace/manifest.json'): string {
  return (
    `<div class="trace-widget" data-trace-manifest="${manifestUrl}">` +
    '<div class="trace-source">' +
    '<span class="line-number" data-line="1">1</span>' +
    '<span class="line-number" data-line="2">2</span>' +
    '<span class="line-number" data-line="3">3</span>' +
    '</div>' +
    '<div class="trace-controls">' +
    '<button class="trace-first">First</button>' +
    '<button class="trace-prev">Prev</button>' +
    '<span class="trace-step-counter"></span>' +
    '<button class="trace-next">Next</button>' +
    '<button class="trace-last">Last</button>' +
    '</div>' +
    '<pre class="trace-output"></pre>' +
    '<div class="trace-diagram"></div>' +
    '</div>'
  );
}

function createWindow(html: string) {
  const dom = new JSDOM(`<body>${html}</body>`, { url: 'http://localhost/' });
  return dom.window;
}

let originalFetch: typeof globalThis.fetch;

function setupFetch(responses: Record<string, unknown>): void {
  const map = new Map(Object.entries(responses));
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString();
    const data = map.get(url);
    if (data === undefined) {
      throw new Error(`Unexpected fetch: ${url}`);
    }
    return { json: async () => data } as Response;
  }) as typeof fetch;
}

async function flush(): Promise<void> {
  for (let i = 0; i < 10; i++) {
    await new Promise(r => setTimeout(r, 0));
  }
}

function setupDefaultFetch(): void {
  setupFetch({
    '/trace/manifest.json': defaultManifest,
    '/trace/chunk-0.json': defaultChunk,
  });
}

describe('trace', () => {
  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test('returns early when no trace widgets exist', () => {
    let fetchCalled = false;
    globalThis.fetch = (async () => {
      fetchCalled = true;
      return {} as Response;
    }) as unknown as typeof fetch;

    const win = createWindow('<div>no widgets</div>');
    mount(win);
    expect(fetchCalled).toBe(false);
  });

  test('returns early when widget has no data-trace-manifest', async () => {
    let fetchCalled = false;
    globalThis.fetch = (async () => {
      fetchCalled = true;
      return {} as Response;
    }) as unknown as typeof fetch;

    const win = createWindow('<div class="trace-widget"></div>');
    mount(win);
    await flush();
    expect(fetchCalled).toBe(false);
  });

  test('fetches manifest and first chunk on init', async () => {
    const fetched: string[] = [];
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      fetched.push(url);
      if (url.includes('manifest.json')) {
        return { json: async () => defaultManifest } as Response;
      }
      return { json: async () => defaultChunk } as Response;
    }) as typeof fetch;

    const win = createWindow(widgetHtml());
    mount(win);
    await flush();

    expect(fetched).toContain('/trace/manifest.json');
    expect(fetched).toContain('/trace/chunk-0.json');
  });

  test('displays step counter as 1/N', async () => {
    setupDefaultFetch();
    const win = createWindow(widgetHtml());
    mount(win);
    await flush();

    const counter = win.document.querySelector('.trace-step-counter');
    expect(counter!.textContent).toBe('1/3');
  });

  test('step counter min-width matches total step digits', async () => {
    const manifest = makeManifest({ totalSteps: 100 });
    const chunk = makeChunk(Array.from({ length: 10 }, () => ({ line: 1 })));
    setupFetch({
      '/trace/manifest.json': manifest,
      '/trace/chunk-0.json': chunk,
    });

    const win = createWindow(widgetHtml());
    mount(win);
    await flush();

    const counter = win.document.querySelector(
      '.trace-step-counter',
    ) as HTMLElement;
    // 3 digits * 2 + 1 = 7ch
    expect(counter.style.minWidth).toBe('7ch');
  });

  test('first and prev buttons disabled at step 0', async () => {
    setupDefaultFetch();
    const win = createWindow(widgetHtml());
    mount(win);
    await flush();

    const first = win.document.querySelector(
      '.trace-first',
    ) as HTMLButtonElement;
    const prev = win.document.querySelector('.trace-prev') as HTMLButtonElement;
    expect(first.disabled).toBe(true);
    expect(prev.disabled).toBe(true);
  });

  test('next and last buttons enabled at step 0', async () => {
    setupDefaultFetch();
    const win = createWindow(widgetHtml());
    mount(win);
    await flush();

    const next = win.document.querySelector('.trace-next') as HTMLButtonElement;
    const last = win.document.querySelector('.trace-last') as HTMLButtonElement;
    expect(next.disabled).toBe(false);
    expect(last.disabled).toBe(false);
  });

  test('highlights the active source line', async () => {
    setupDefaultFetch();
    const win = createWindow(widgetHtml());
    mount(win);
    await flush();

    const active = win.document.querySelector('.trace-line-active');
    expect(active).not.toBeNull();
    expect(active!.getAttribute('data-line')).toBe('1');
  });

  test('renders initial SVG in diagram', async () => {
    setupDefaultFetch();
    const win = createWindow(widgetHtml());
    mount(win);
    await flush();

    const diagram = win.document.querySelector('.trace-diagram') as HTMLElement;
    expect(diagram.innerHTML).toBe('<svg>step0</svg>');
  });

  test('renders initial stdout in output', async () => {
    const chunk = makeChunk([
      { line: 1, stdout: 'initial output', svg: '<svg></svg>' },
      { line: 2, svg: '<svg></svg>' },
    ]);
    setupFetch({
      '/trace/manifest.json': makeManifest({ totalSteps: 2 }),
      '/trace/chunk-0.json': chunk,
    });

    const win = createWindow(widgetHtml());
    mount(win);
    await flush();

    const output = win.document.querySelector('.trace-output') as HTMLElement;
    expect(output.textContent).toBe('initial output');
  });

  test('clicking next advances to the next step', async () => {
    setupDefaultFetch();
    const win = createWindow(widgetHtml());
    mount(win);
    await flush();

    const next = win.document.querySelector('.trace-next') as HTMLButtonElement;
    next.click();
    await flush();

    const counter = win.document.querySelector('.trace-step-counter');
    expect(counter!.textContent).toBe('2/3');
  });

  test('clicking next updates source highlight', async () => {
    setupDefaultFetch();
    const win = createWindow(widgetHtml());
    mount(win);
    await flush();

    const next = win.document.querySelector('.trace-next') as HTMLButtonElement;
    next.click();
    await flush();

    const active = win.document.querySelector('.trace-line-active');
    expect(active!.getAttribute('data-line')).toBe('2');
  });

  test('clicking next updates SVG diagram', async () => {
    setupDefaultFetch();
    const win = createWindow(widgetHtml());
    mount(win);
    await flush();

    const next = win.document.querySelector('.trace-next') as HTMLButtonElement;
    next.click();
    await flush();

    const diagram = win.document.querySelector('.trace-diagram') as HTMLElement;
    expect(diagram.innerHTML).toBe('<svg>step1</svg>');
  });

  test('output accumulates stdout across steps', async () => {
    setupDefaultFetch();
    const win = createWindow(widgetHtml());
    mount(win);
    await flush();

    const next = win.document.querySelector('.trace-next') as HTMLButtonElement;
    const output = win.document.querySelector('.trace-output') as HTMLElement;

    next.click();
    await flush();
    expect(output.textContent).toBe('hello');

    next.click();
    await flush();
    expect(output.textContent).toBe('hello world');
  });

  test('clicking last goes to the final step', async () => {
    setupDefaultFetch();
    const win = createWindow(widgetHtml());
    mount(win);
    await flush();

    const last = win.document.querySelector('.trace-last') as HTMLButtonElement;
    last.click();
    await flush();

    const counter = win.document.querySelector('.trace-step-counter');
    expect(counter!.textContent).toBe('3/3');
  });

  test('next and last disabled at the last step', async () => {
    setupDefaultFetch();
    const win = createWindow(widgetHtml());
    mount(win);
    await flush();

    const last = win.document.querySelector('.trace-last') as HTMLButtonElement;
    last.click();
    await flush();

    const next = win.document.querySelector('.trace-next') as HTMLButtonElement;
    expect(next.disabled).toBe(true);
    expect(last.disabled).toBe(true);
  });

  test('first and prev enabled after advancing', async () => {
    setupDefaultFetch();
    const win = createWindow(widgetHtml());
    mount(win);
    await flush();

    const next = win.document.querySelector('.trace-next') as HTMLButtonElement;
    next.click();
    await flush();

    const first = win.document.querySelector(
      '.trace-first',
    ) as HTMLButtonElement;
    const prev = win.document.querySelector('.trace-prev') as HTMLButtonElement;
    expect(first.disabled).toBe(false);
    expect(prev.disabled).toBe(false);
  });

  test('clicking first returns to step 0', async () => {
    setupDefaultFetch();
    const win = createWindow(widgetHtml());
    mount(win);
    await flush();

    const last = win.document.querySelector('.trace-last') as HTMLButtonElement;
    last.click();
    await flush();

    const first = win.document.querySelector(
      '.trace-first',
    ) as HTMLButtonElement;
    first.click();
    await flush();

    const counter = win.document.querySelector('.trace-step-counter');
    expect(counter!.textContent).toBe('1/3');
  });

  test('clicking prev goes back one step', async () => {
    setupDefaultFetch();
    const win = createWindow(widgetHtml());
    mount(win);
    await flush();

    const last = win.document.querySelector('.trace-last') as HTMLButtonElement;
    last.click();
    await flush();

    const prev = win.document.querySelector('.trace-prev') as HTMLButtonElement;
    prev.click();
    await flush();

    const counter = win.document.querySelector('.trace-step-counter');
    expect(counter!.textContent).toBe('2/3');
  });

  test('only one line is highlighted at a time', async () => {
    setupDefaultFetch();
    const win = createWindow(widgetHtml());
    mount(win);
    await flush();

    const next = win.document.querySelector('.trace-next') as HTMLButtonElement;
    next.click();
    await flush();

    const allActive = win.document.querySelectorAll('.trace-line-active');
    expect(allActive.length).toBe(1);
    expect(allActive[0].getAttribute('data-line')).toBe('2');
  });

  test('loads additional chunks when stepping across boundaries', async () => {
    const manifest = makeManifest({ totalSteps: 4, chunkSize: 2 });
    const chunk0 = makeChunk([
      { line: 1, svg: '<svg>s0</svg>' },
      { line: 2, svg: '<svg>s1</svg>' },
    ]);
    const chunk1 = makeChunk([
      { line: 3, stdout: 'out', svg: '<svg>s2</svg>' },
      { line: 1, svg: '<svg>s3</svg>' },
    ]);
    setupFetch({
      '/trace/manifest.json': manifest,
      '/trace/chunk-0.json': chunk0,
      '/trace/chunk-1.json': chunk1,
    });

    const win = createWindow(widgetHtml());
    mount(win);
    await flush();

    const last = win.document.querySelector('.trace-last') as HTMLButtonElement;
    last.click();
    await flush();

    const counter = win.document.querySelector('.trace-step-counter');
    expect(counter!.textContent).toBe('4/4');
    const diagram = win.document.querySelector('.trace-diagram') as HTMLElement;
    expect(diagram.innerHTML).toBe('<svg>s3</svg>');
  });

  test('does not re-fetch already loaded chunks', async () => {
    const fetched: string[] = [];
    const manifest = makeManifest({ totalSteps: 4, chunkSize: 2 });
    const chunk0 = makeChunk([
      { line: 1, svg: '<svg>s0</svg>' },
      { line: 2, svg: '<svg>s1</svg>' },
    ]);
    const chunk1 = makeChunk([
      { line: 3, svg: '<svg>s2</svg>' },
      { line: 1, svg: '<svg>s3</svg>' },
    ]);

    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      fetched.push(url);
      if (url.includes('manifest.json')) {
        return { json: async () => manifest } as Response;
      }
      if (url.includes('chunk-0')) {
        return { json: async () => chunk0 } as Response;
      }
      return { json: async () => chunk1 } as Response;
    }) as typeof fetch;

    const win = createWindow(widgetHtml());
    mount(win);
    await flush();

    const last = win.document.querySelector('.trace-last') as HTMLButtonElement;
    last.click();
    await flush();

    const first = win.document.querySelector(
      '.trace-first',
    ) as HTMLButtonElement;
    first.click();
    await flush();

    const chunk0Fetches = fetched.filter(u => u.includes('chunk-0'));
    expect(chunk0Fetches.length).toBe(1);
  });

  test('initializes multiple widgets', async () => {
    setupDefaultFetch();
    const html = widgetHtml() + widgetHtml();
    const win = createWindow(html);
    mount(win);
    await flush();

    const counters = win.document.querySelectorAll('.trace-step-counter');
    expect(counters.length).toBe(2);
    expect(counters[0].textContent).toBe('1/3');
    expect(counters[1].textContent).toBe('1/3');
  });

  test('arrow keys move focus between enabled buttons', async () => {
    setupDefaultFetch();
    const win = createWindow(widgetHtml());
    mount(win);
    await flush();

    // Advance to step 1 so all four buttons are enabled
    const nextBtn = win.document.querySelector(
      '.trace-next',
    ) as HTMLButtonElement;
    nextBtn.click();
    await flush();

    const firstBtn = win.document.querySelector(
      '.trace-first',
    ) as HTMLButtonElement;
    firstBtn.focus();

    firstBtn.dispatchEvent(
      new win.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }),
    );

    expect(win.document.activeElement).not.toBe(firstBtn);
  });

  test('disabled buttons get tabIndex -1', async () => {
    setupDefaultFetch();
    const win = createWindow(widgetHtml());
    mount(win);
    await flush();

    const first = win.document.querySelector(
      '.trace-first',
    ) as HTMLButtonElement;
    const prev = win.document.querySelector('.trace-prev') as HTMLButtonElement;
    expect(first.tabIndex).toBe(-1);
    expect(prev.tabIndex).toBe(-1);
  });

  test('at least one enabled button has tabIndex 0', async () => {
    setupDefaultFetch();
    const win = createWindow(widgetHtml());
    mount(win);
    await flush();

    const next = win.document.querySelector('.trace-next') as HTMLButtonElement;
    const last = win.document.querySelector('.trace-last') as HTMLButtonElement;
    expect(next.tabIndex === 0 || last.tabIndex === 0).toBe(true);
  });
});
