import {
  afterEach,
  beforeEach,
  describe,
  expect,
  jest,
  mock,
  test,
} from 'bun:test';
import { JSDOM } from 'jsdom';
import { createGlobals } from '../globals.test';
import { deferred, flushMicrotasks } from '../../test-helpers';

const NAVIGATION_EVENT = 'tada:navigation';

mock.module('../navigate/runtime', () => ({
  NAVIGATION_EVENT,
  refreshCurrentPage: mock(async () => {}),
}));

const {
  default: mount,
  mountPageUpdate,
  PAGE_UPDATE_REFRESH_EVENT,
} = await import('./index');

function mockGlobals(overrides: Partial<import('../globals').Globals> = {}) {
  mock.module('../globals', () => ({ globals: createGlobals(overrides) }));
}

function create(url = 'http://localhost/page?view=full') {
  const dom = new JSDOM('<body></body>', { url, pretendToBeVisual: true });
  return dom.window;
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
  await flushMicrotasks(6);
}

async function advancePolling(ms: number) {
  jest.advanceTimersByTime(ms);
  await flush();
}

beforeEach(() => {
  mockGlobals();
});

afterEach(() => {
  jest.useRealTimers();
});

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
    mockGlobals({
      fetch: mock(async () =>
        responseWithHeaders({ ETag: '"v1"', 'Last-Modified': 'old' }),
      ),
    });

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
    jest.useFakeTimers();
    const win = create();
    let count = 0;
    mockGlobals({
      fetch: mock(async () => {
        count += 1;
        return responseWithHeaders({ ETag: count === 1 ? '"v1"' : '"v2"' });
      }),
    });

    const cleanup = mountPageUpdate(win, { pollIntervalMs: 10 });
    await flush();
    await advancePolling(10);

    expect(
      win.document
        .querySelector('.page-update-toast')
        ?.classList.contains('is-showing'),
    ).toBe(true);

    cleanup?.();
  });

  test('falls back to Last-Modified when ETag is missing', async () => {
    jest.useFakeTimers();
    const win = create();
    let count = 0;
    mockGlobals({
      fetch: mock(async () => {
        count += 1;
        return responseWithHeaders({
          'Last-Modified': count === 1 ? 'old' : 'new',
        });
      }),
    });

    const cleanup = mountPageUpdate(win, { pollIntervalMs: 10 });
    await flush();
    await advancePolling(10);

    expect(
      win.document
        .querySelector('.page-update-toast')
        ?.classList.contains('is-showing'),
    ).toBe(true);

    cleanup?.();
  });

  test('stays silent when no validators are present', async () => {
    jest.useFakeTimers();
    const win = create();
    mockGlobals({ fetch: mock(async () => responseWithHeaders({})) });

    const cleanup = mountPageUpdate(win, { pollIntervalMs: 10 });
    await flush();
    await advancePolling(10);

    expect(
      win.document
        .querySelector('.page-update-toast')
        ?.classList.contains('is-showing'),
    ).toBe(false);

    cleanup?.();
  });

  test('dismiss hides the toast for the same detected validator', async () => {
    jest.useFakeTimers();
    const win = create();
    let count = 0;
    mockGlobals({
      fetch: mock(async () => {
        count += 1;
        return responseWithHeaders({ ETag: count === 1 ? '"v1"' : '"v2"' });
      }),
    });

    const cleanup = mountPageUpdate(win, { pollIntervalMs: 10 });
    await flush();
    await advancePolling(10);

    const dismiss = win.document.querySelectorAll(
      '.page-update-toast button',
    )[1] as HTMLButtonElement;
    dismiss.click();
    await advancePolling(10);

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
    let count = 0;
    mockGlobals({
      fetch: mock(async () => {
        count += 1;
        if (count === 1) {
          return responseWithHeaders({ ETag: '"v1"' });
        }
        if (count < 4) {
          return responseWithHeaders({ ETag: '"v2"' });
        }
        return responseWithHeaders({ ETag: '"v3"' });
      }),
      isDocumentHidden() {
        return visibility.hidden;
      },
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

  test('reload uses the injected refresh function and then dispatches a refresh event', async () => {
    jest.useFakeTimers();
    const win = create();
    let count = 0;
    mockGlobals({
      fetch: mock(async () => {
        count += 1;
        return responseWithHeaders({ ETag: count === 1 ? '"v1"' : '"v2"' });
      }),
    });

    const refreshDone = deferred<void>();
    const refreshPage = mock(async () => {
      await refreshDone.promise;
    });
    let refreshEvents = 0;
    win.addEventListener(PAGE_UPDATE_REFRESH_EVENT, () => {
      refreshEvents += 1;
    });

    const cleanup = mountPageUpdate(win, { pollIntervalMs: 10, refreshPage });
    await flush();
    await advancePolling(10);

    const reload = win.document.querySelectorAll(
      '.page-update-toast button',
    )[0] as HTMLButtonElement;
    reload.click();
    await flush();

    expect(refreshPage).toHaveBeenCalledWith(win);
    expect(refreshEvents).toBe(0);

    refreshDone.resolve();
    await flush();

    expect(refreshEvents).toBe(1);

    cleanup?.();
  });

  test('stops polling while hidden and checks immediately when visible again', async () => {
    jest.useFakeTimers();
    const win = create();
    const visibility = { hidden: false };
    const fetchMock = mock(async () => responseWithHeaders({ ETag: '"v1"' }));
    mockGlobals({
      fetch: fetchMock,
      isDocumentHidden() {
        return visibility.hidden;
      },
    });

    const cleanup = mountPageUpdate(win, { pollIntervalMs: 1000 });
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    visibility.hidden = true;
    win.document.dispatchEvent(new win.Event('visibilitychange'));
    const hiddenCount = fetchMock.mock.calls.length;
    await advancePolling(1000);
    expect(fetchMock.mock.calls.length).toBe(hiddenCount);

    visibility.hidden = false;
    win.document.dispatchEvent(new win.Event('visibilitychange'));
    await flush();
    expect(fetchMock.mock.calls.length).toBe(hiddenCount + 1);

    cleanup?.();
  });

  test('resets state after internal navigation', async () => {
    jest.useFakeTimers();
    const win = create();
    let count = 0;
    mockGlobals({
      fetch: mock(async () => {
        count += 1;
        return responseWithHeaders({ ETag: count === 1 ? '"v1"' : '"v2"' });
      }),
    });

    const cleanup = mountPageUpdate(win, { pollIntervalMs: 10 });
    await flush();
    await advancePolling(10);

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
    mockGlobals({
      fetch: mock(async () => responseWithHeaders({ ETag: '"v1"' })),
    });

    const cleanup = mountPageUpdate(win, { pollIntervalMs: 10 });
    cleanup?.();

    expect(win.document.querySelector('.page-update-container')).toBeNull();
  });
});
