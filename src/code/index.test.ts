import { beforeAll, describe, expect, test } from 'bun:test';
import { JSDOM } from 'jsdom';
import mount from './index';

beforeAll(() => {
  if (typeof globalThis.ResizeObserver === 'undefined') {
    (globalThis as Record<string, unknown>).ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
});

function create(html: string) {
  const dom = new JSDOM(`<body class="code">${html}</body>`);
  return dom.window;
}

function getEventCtor(doc: Document): typeof Event {
  return (doc.defaultView as unknown as Record<string, unknown>)[
    'Event'
  ] as typeof Event;
}

function makeCopyEvent(doc: Document): ClipboardEvent {
  // jsdom does not support the DataTransfer constructor, so build a
  // minimal stand-in and attach it to a plain Event.
  const data: Record<string, string> = {};
  const dt = {
    setData(type: string, value: string) {
      data[type] = value;
    },
    getData(type: string) {
      return data[type] ?? '';
    },
  };
  const Evt = getEventCtor(doc);
  const event = new Evt('copy', {
    bubbles: true,
    cancelable: true,
  }) as ClipboardEvent;
  Object.defineProperty(event, 'clipboardData', { value: dt });
  return event;
}

function selectAll(win: Window, root: Node): void {
  const range = win.document.createRange();
  range.selectNodeContents(root);
  const selection = win.getSelection()!;
  selection.removeAllRanges();
  selection.addRange(range);
}

describe('code', () => {
  test('returns early when body does not have code class', async () => {
    const dom = new JSDOM('<body><div>No code</div></body>');
    await mount(dom.window);
  });

  test('returns early when no code-body or scrollbar', async () => {
    const win = create('<div>Code page with no code body</div>');
    await mount(win);
  });

  test('copy handler exits early when no selection', async () => {
    const win = create(
      '<div class="code-body"><div class="code-row"><code>hello</code></div></div>' +
        '<div class="code-scrollbar"><div></div></div>',
    );
    await mount(win);

    const event = makeCopyEvent(win.document);
    win.document.dispatchEvent(event);
    // No error, handler exited gracefully
  });

  test('copy handler extracts text from code rows with prose source', async () => {
    const win = create(
      '<div class="code-body">' +
        '<div class="code-row"><span class="line-number">1</span><code>line one</code></div>' +
        '<div class="code-row"><span class="line-number">2</span><code><span data-prose-source="line two src">line two</span></code></div>' +
        '</div>' +
        '<div class="code-scrollbar"><div></div></div>',
    );
    await mount(win);

    selectAll(win, win.document.querySelector('.code-body')!);
    const event = makeCopyEvent(win.document);
    win.document.dispatchEvent(event);

    expect(event.clipboardData!.getData('text/plain')).toBe(
      'line one\nline two src',
    );
  });

  test('copy handler replaces prose source elements with pre', async () => {
    const win = create(
      '<div class="code-body">' +
        '<div class="code-row"><code><span data-prose-source="original text">rendered</span></code></div>' +
        '</div>' +
        '<div class="code-scrollbar"><div></div></div>',
    );
    await mount(win);

    selectAll(win, win.document.querySelector('.code-body')!);
    const event = makeCopyEvent(win.document);
    win.document.dispatchEvent(event);

    expect(event.clipboardData!.getData('text/plain')).toBe('original text');
  });

  test('copy handler removes line-number spans', async () => {
    const win = create(
      '<div class="code-body">' +
        '<div class="code-row"><span class="line-number">1</span><code><span data-prose-source="only code">only code</span></code></div>' +
        '</div>' +
        '<div class="code-scrollbar"><div></div></div>',
    );
    await mount(win);

    selectAll(win, win.document.querySelector('.code-body')!);
    const event = makeCopyEvent(win.document);
    win.document.dispatchEvent(event);

    expect(event.clipboardData!.getData('text/plain')).toBe('only code');
  });

  test('copy handler returns early without prose source elements', async () => {
    const win = create(
      '<div class="code-body">' +
        '<div class="code-row"><code>just code</code></div>' +
        '</div>' +
        '<div class="code-scrollbar"><div></div></div>',
    );
    await mount(win);

    selectAll(win, win.document.querySelector('.code-body')!);
    const event = makeCopyEvent(win.document);
    win.document.dispatchEvent(event);

    // No prose source elements, handler returns early without modifying clipboard
    expect(event.clipboardData!.getData('text/plain')).toBe('');
  });

  test('handles download link when present', async () => {
    const win = create(
      '<div class="file-header"><a download="test.py" href="/test.py">Download</a></div>' +
        '<div class="code-body"><div class="code-row"><code>x</code></div></div>' +
        '<div class="code-scrollbar"><div></div></div>',
    );
    await mount(win);

    const link = win.document.querySelector('a[download]');
    expect(link).not.toBeNull();
  });

  test('scroll on code-body syncs to scrollbar', async () => {
    const win = create(
      '<div class="code-body"><div class="code-row"><code>x</code></div></div>' +
        '<div class="code-scrollbar"><div></div></div>',
    );
    await mount(win);

    const codeBody = win.document.querySelector('.code-body') as HTMLElement;
    const scrollbar = win.document.querySelector(
      '.code-scrollbar',
    ) as HTMLElement;

    Object.defineProperty(codeBody, 'scrollLeft', {
      value: 42,
      writable: true,
    });
    codeBody.dispatchEvent(new (getEventCtor(win.document))('scroll'));

    expect(scrollbar.scrollLeft).toBe(42);
  });

  test('scroll on scrollbar syncs to code-body', async () => {
    const win = create(
      '<div class="code-body"><div class="code-row"><code>x</code></div></div>' +
        '<div class="code-scrollbar"><div></div></div>',
    );
    await mount(win);

    const codeBody = win.document.querySelector('.code-body') as HTMLElement;
    const scrollbar = win.document.querySelector(
      '.code-scrollbar',
    ) as HTMLElement;

    Object.defineProperty(scrollbar, 'scrollLeft', {
      value: 99,
      writable: true,
    });
    scrollbar.dispatchEvent(new (getEventCtor(win.document))('scroll'));

    expect(codeBody.scrollLeft).toBe(99);
  });

  test('sets up scrollbar syncing between code-body and scrollbar', async () => {
    const win = create(
      '<div class="code-body"><div class="code-row"><code>x</code></div></div>' +
        '<div class="code-scrollbar"><div></div></div>',
    );
    await mount(win);

    const codeBody = win.document.querySelector('.code-body') as HTMLElement;
    const scrollbar = win.document.querySelector(
      '.code-scrollbar',
    ) as HTMLElement;
    expect(codeBody).not.toBeNull();
    expect(scrollbar).not.toBeNull();
  });
});
