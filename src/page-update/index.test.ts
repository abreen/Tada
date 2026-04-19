import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import { JSDOM } from 'jsdom';
import mount, { mountPageUpdate } from './index';
import { NAVIGATION_EVENT } from '../navigate/runtime';

const globals = globalThis as Record<string, unknown>;

let savedFetch: unknown;

beforeEach(() => {
  savedFetch = globalThis.fetch;
});

afterEach(() => {
  globalThis.fetch = savedFetch as typeof fetch;
});

function create(url = 'http://localhost/page?view=full') {
  const dom = new JSDOM('<body></body>', { url, pretendToBeVisual: true });
  return dom.window;
}

function setDocumentHidden(document: Document, state: { hidden: boolean }) {
  Object.defineProperty(document, 'hidden', {
    configurable: true,
    get: () => state.hidden,
  });
}

function responseWithHeaders(headers: Record<string, string>, ok = true) {
  return {
    ok,
    headers: {
      get(name: string) {
        return headers[name] ?? headers[name.toLowerCase()] ?? null;
      },
    },
  } as Response;
}

async function flush() {
  for (let i = 0; i < 6; i++) {
    await new Promise(resolve => setTimeout(resolve, 0));
  }
}

describe('page-update mount', () => {
  test('creates a floating toast container', () => {
    const win = create();
    const cleanup = mount(win);

    expect(win.document.querySelector('.page-update-container')).not.toBeNull();
    expect(win.document.querySelector('.page-update-toast')).not.toBeNull();

    cleanup?.();
  });

  test('returns a cleanup function', () => {
    const win = create();
    expect(typeof mount(win)).toBe('function');
  });
});

describe('page-update behavior', () => {
  test('uses the first validator as the baseline without showing the toast', async () => {
    const win = create();
    globals.fetch = mock(async () =>
      responseWithHeaders({ ETag: '"v1"', 'Last-Modified': 'old' }),
    );

    const cleanup = mountPageUpdate(win, { pollIntervalMs: 10 });
    await flush();

    expect(
      win.document
        .querySelector('.page-update-toast')
        ?.classList.contains('is-showing'),
    ).toBe(false);

    cleanup?.();
  });

  test('shows the toast when the validator changes', async () => {
    const win = create();
    let count = 0;
    globals.fetch = mock(async () => {
      count += 1;
      return responseWithHeaders({ ETag: count === 1 ? '"v1"' : '"v2"' });
    });

    const cleanup = mountPageUpdate(win, { pollIntervalMs: 10 });
    await flush();
    await new Promise(resolve => setTimeout(resolve, 20));
    await flush();

    expect(
      win.document
        .querySelector('.page-update-toast')
        ?.classList.contains('is-showing'),
    ).toBe(true);

    cleanup?.();
  });

  test('falls back to Last-Modified when ETag is missing', async () => {
    const win = create();
    let count = 0;
    globals.fetch = mock(async () => {
      count += 1;
      return responseWithHeaders({
        'Last-Modified': count === 1 ? 'old' : 'new',
      });
    });

    const cleanup = mountPageUpdate(win, { pollIntervalMs: 10 });
    await flush();
    await new Promise(resolve => setTimeout(resolve, 20));
    await flush();

    expect(
      win.document
        .querySelector('.page-update-toast')
        ?.classList.contains('is-showing'),
    ).toBe(true);

    cleanup?.();
  });

  test('stays silent when no validators are present', async () => {
    const win = create();
    globals.fetch = mock(async () => responseWithHeaders({}));

    const cleanup = mountPageUpdate(win, { pollIntervalMs: 10 });
    await flush();
    await new Promise(resolve => setTimeout(resolve, 20));
    await flush();

    expect(
      win.document
        .querySelector('.page-update-toast')
        ?.classList.contains('is-showing'),
    ).toBe(false);

    cleanup?.();
  });

  test('dismiss hides the toast for the same detected validator', async () => {
    const win = create();
    let count = 0;
    globals.fetch = mock(async () => {
      count += 1;
      return responseWithHeaders({ ETag: count === 1 ? '"v1"' : '"v2"' });
    });

    const cleanup = mountPageUpdate(win, { pollIntervalMs: 10 });
    await flush();
    await new Promise(resolve => setTimeout(resolve, 20));
    await flush();

    const dismiss = win.document.querySelectorAll(
      '.page-update-toast button',
    )[1] as HTMLButtonElement;
    dismiss.click();
    await new Promise(resolve => setTimeout(resolve, 20));
    await flush();

    expect(
      win.document
        .querySelector('.page-update-toast')
        ?.classList.contains('is-showing'),
    ).toBe(false);

    cleanup?.();
  });

  test('shows the toast again when a later validator differs from a dismissed one', async () => {
    const win = create();
    const visibility = { hidden: false };
    setDocumentHidden(win.document, visibility);
    let count = 0;
    globals.fetch = mock(async () => {
      count += 1;
      if (count === 1) {
        return responseWithHeaders({ ETag: '"v1"' });
      }
      if (count < 4) {
        return responseWithHeaders({ ETag: '"v2"' });
      }
      return responseWithHeaders({ ETag: '"v3"' });
    });

    const cleanup = mountPageUpdate(win, { pollIntervalMs: 1000 });
    await flush();

    win.document.dispatchEvent(new win.Event('visibilitychange'));
    await flush();

    const dismiss = win.document.querySelectorAll(
      '.page-update-toast button',
    )[1] as HTMLButtonElement;
    dismiss.click();

    win.document.dispatchEvent(new win.Event('visibilitychange'));
    await flush();

    visibility.hidden = true;
    win.document.dispatchEvent(new win.Event('visibilitychange'));
    visibility.hidden = false;
    win.document.dispatchEvent(new win.Event('visibilitychange'));
    await flush();

    expect(
      win.document
        .querySelector('.page-update-toast')
        ?.classList.contains('is-showing'),
    ).toBe(true);

    cleanup?.();
  });

  test('reload uses the injected refresh function', async () => {
    const win = create();
    let count = 0;
    globals.fetch = mock(async () => {
      count += 1;
      return responseWithHeaders({ ETag: count === 1 ? '"v1"' : '"v2"' });
    });

    const refreshPage = mock(async () => {});
    const cleanup = mountPageUpdate(win, { pollIntervalMs: 10, refreshPage });
    await flush();
    await new Promise(resolve => setTimeout(resolve, 20));
    await flush();

    const reload = win.document.querySelectorAll(
      '.page-update-toast button',
    )[0] as HTMLButtonElement;
    reload.click();
    await flush();

    expect(refreshPage).toHaveBeenCalledWith(win);

    cleanup?.();
  });

  test('stops polling while hidden and checks immediately when visible again', async () => {
    const win = create();
    const visibility = { hidden: false };
    setDocumentHidden(win.document, visibility);

    const fetchMock = mock(async () => responseWithHeaders({ ETag: '"v1"' }));
    globals.fetch = fetchMock;

    const cleanup = mountPageUpdate(win, { pollIntervalMs: 1000 });
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    visibility.hidden = true;
    win.document.dispatchEvent(new win.Event('visibilitychange'));
    const hiddenCount = fetchMock.mock.calls.length;
    await new Promise(resolve => setTimeout(resolve, 30));
    await flush();
    expect(fetchMock.mock.calls.length).toBe(hiddenCount);

    visibility.hidden = false;
    win.document.dispatchEvent(new win.Event('visibilitychange'));
    await flush();
    expect(fetchMock.mock.calls.length).toBe(hiddenCount + 1);

    cleanup?.();
  });

  test('resets state after internal navigation', async () => {
    const win = create();
    let count = 0;
    globals.fetch = mock(async () => {
      count += 1;
      return responseWithHeaders({ ETag: count === 1 ? '"v1"' : '"v2"' });
    });

    const cleanup = mountPageUpdate(win, { pollIntervalMs: 10 });
    await flush();
    await new Promise(resolve => setTimeout(resolve, 20));
    await flush();

    expect(
      win.document
        .querySelector('.page-update-toast')
        ?.classList.contains('is-showing'),
    ).toBe(true);

    win.history.pushState({}, '', '/other');
    win.dispatchEvent(new win.Event(NAVIGATION_EVENT));
    await flush();

    expect(
      win.document
        .querySelector('.page-update-toast')
        ?.classList.contains('is-showing'),
    ).toBe(false);

    cleanup?.();
  });

  test('cleanup removes the toast container', () => {
    const win = create();
    globals.fetch = mock(async () => responseWithHeaders({ ETag: '"v1"' }));

    const cleanup = mountPageUpdate(win, { pollIntervalMs: 10 });
    cleanup?.();

    expect(win.document.querySelector('.page-update-container')).toBeNull();
  });
});
