import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import { JSDOM } from 'jsdom';
import { createGlobals } from '../globals.test';
import mount from './index';

const resizeObserverState = {
  disconnectCalls: 0,
  observeCalls: 0,
  unobserveCalls: 0,
};

function mockGlobals(overrides: Partial<import('../globals').Globals> = {}) {
  mock.module('../globals', () => ({
    globals: createGlobals({
      createResizeObserver() {
        return {
          observe(_target: Element) {
            resizeObserverState.observeCalls += 1;
          },
          disconnect() {
            resizeObserverState.disconnectCalls += 1;
          },
        };
      },
      ...overrides,
    }),
  }));
}

function create(html: string) {
  const dom = new JSDOM(`<body class="code">${html}</body>`);
  return dom.window;
}

function getEventCtor(doc: Document): typeof Event {
  return (doc.defaultView as unknown as Record<string, unknown>)[
    'Event'
  ] as typeof Event;
}

type TrackableEventTarget = EventTarget & {
  addEventListener: EventTarget['addEventListener'];
  removeEventListener: EventTarget['removeEventListener'];
};

function trackEventListeners(target: EventTarget) {
  const counts = new Map<string, number>();
  const trackedTarget = target as TrackableEventTarget;
  const originalAdd = trackedTarget.addEventListener;
  const originalRemove = trackedTarget.removeEventListener;
  const callAdd = (
    type: string,
    listener: EventListenerOrEventListenerObject | null,
    options?: boolean | AddEventListenerOptions,
  ) =>
    originalAdd.call(
      trackedTarget,
      type,
      listener as EventListenerOrEventListenerObject,
      options,
    );
  const callRemove = (
    type: string,
    listener: EventListenerOrEventListenerObject | null,
    options?: boolean | EventListenerOptions,
  ) =>
    originalRemove.call(
      trackedTarget,
      type,
      listener as EventListenerOrEventListenerObject,
      options,
    );

  trackedTarget.addEventListener = ((type, listener, options) => {
    if (listener) {
      counts.set(type, (counts.get(type) ?? 0) + 1);
    }
    return callAdd(type, listener, options);
  }) as typeof trackedTarget.addEventListener;

  trackedTarget.removeEventListener = ((type, listener, options) => {
    if (listener) {
      counts.set(type, (counts.get(type) ?? 0) - 1);
    }
    return callRemove(type, listener, options);
  }) as typeof trackedTarget.removeEventListener;

  return {
    count(type: string) {
      return counts.get(type) ?? 0;
    },
    restore() {
      trackedTarget.addEventListener = originalAdd;
      trackedTarget.removeEventListener = originalRemove;
    },
  };
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

afterEach(() => {
  resizeObserverState.observeCalls = 0;
  resizeObserverState.unobserveCalls = 0;
  resizeObserverState.disconnectCalls = 0;
});

beforeEach(() => {
  mockGlobals();
});

describe('code', () => {
  test('returns early when body does not have code class', async () => {
    const dom = new JSDOM('<body><div>No code</div></body>');
    await mount(dom.window);
  });

  test('returns early when no code-body or scrollbar', async () => {
    const win = create('<div>Code page with no code body</div>');
    const documentTracker = trackEventListeners(win.document);

    const cleanup = await mount(win);

    expect(cleanup).toBeUndefined();
    expect(documentTracker.count('copy')).toBe(0);

    documentTracker.restore();
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

  test('returns a cleanup function that disconnects the resize observer', async () => {
    const win = create(
      '<div class="code-body"><div class="code-row"><code>x</code></div></div>' +
        '<div class="code-scrollbar"><div></div></div>',
    );

    const cleanup = await mount(win);

    expect(typeof cleanup).toBe('function');
    expect(resizeObserverState.observeCalls).toBe(1);

    cleanup!();

    expect(resizeObserverState.disconnectCalls).toBe(1);
  });

  test('cleanup removes per-mount listeners across remounts', async () => {
    const win = create(
      '<div class="file-header"><a download="test.py" href="/test.py">Download</a></div>' +
        '<div class="code-body"><div class="code-row"><code>x</code></div></div>' +
        '<div class="code-scrollbar"><div></div></div>',
    );
    Object.defineProperty(win, 'showSaveFilePicker', {
      configurable: true,
      value: async () => ({
        async createWritable() {
          return { async close() {}, async write() {} };
        },
      }),
    });

    const documentTracker = trackEventListeners(win.document);
    const downloadTracker = trackEventListeners(
      win.document.querySelector('a[download]')!,
    );
    const codeBodyTracker = trackEventListeners(
      win.document.querySelector('.code-body')!,
    );
    const scrollbarTracker = trackEventListeners(
      win.document.querySelector('.code-scrollbar')!,
    );

    const cleanup1 = await mount(win);

    expect(documentTracker.count('copy')).toBe(1);
    expect(downloadTracker.count('click')).toBe(1);
    expect(codeBodyTracker.count('scroll')).toBe(1);
    expect(scrollbarTracker.count('scroll')).toBe(1);

    cleanup1!();

    expect(documentTracker.count('copy')).toBe(0);
    expect(downloadTracker.count('click')).toBe(0);
    expect(codeBodyTracker.count('scroll')).toBe(0);
    expect(scrollbarTracker.count('scroll')).toBe(0);

    const cleanup2 = await mount(win);

    expect(documentTracker.count('copy')).toBe(1);
    expect(downloadTracker.count('click')).toBe(1);
    expect(codeBodyTracker.count('scroll')).toBe(1);
    expect(scrollbarTracker.count('scroll')).toBe(1);

    cleanup2!();

    expect(documentTracker.count('copy')).toBe(0);
    expect(downloadTracker.count('click')).toBe(0);
    expect(codeBodyTracker.count('scroll')).toBe(0);
    expect(scrollbarTracker.count('scroll')).toBe(0);

    documentTracker.restore();
    downloadTracker.restore();
    codeBodyTracker.restore();
    scrollbarTracker.restore();
  });

  test('cleanup detaches the copy handler', async () => {
    const win = create(
      '<div class="code-body">' +
        '<div class="code-row"><code><span data-prose-source="original text">rendered</span></code></div>' +
        '</div>' +
        '<div class="code-scrollbar"><div></div></div>',
    );

    const cleanup = await mount(win);

    cleanup!();

    selectAll(win, win.document.querySelector('.code-body')!);
    const event = makeCopyEvent(win.document);
    win.document.dispatchEvent(event);

    expect(event.clipboardData!.getData('text/plain')).toBe('');
  });
});
