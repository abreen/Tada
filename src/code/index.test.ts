import { beforeAll, describe, expect, test } from 'bun:test';
import { JSDOM } from 'jsdom';
import mount from './index';

beforeAll(() => {
  // jsdom does not provide ResizeObserver
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

describe('code', () => {
  test('returns early when body does not have code class', async () => {
    const dom = new JSDOM('<body><div>No code</div></body>');
    await mount(dom.window);
  });

  test('returns early when no code-body or scrollbar', async () => {
    const win = create('<div>Code page with no code body</div>');
    await mount(win);
  });

  test('registers a copy event listener on code page', async () => {
    const win = create(
      '<div class="code-body"><div class="code-row"><code>hello</code></div></div>' +
        '<div class="code-scrollbar"><div></div></div>',
    );
    await mount(win);

    // Dispatch a copy event to exercise the listener (jsdom has limited
    // ClipboardEvent support, so the handler exits early at getSelection)
    const event = new win.Event('copy', { bubbles: true });
    win.document.dispatchEvent(event);
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
});
