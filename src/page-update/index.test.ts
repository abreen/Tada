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
  const dom = new JSDOM(
    '<body><div id="page-update-container" role="status"></div></body>',
    { url, pretendToBeVisual: true },
  );
  return dom.window;
}

function isShowing(win: Window) {
  return (
    win.document.querySelector('#page-update-container .header-indicator') !==
    null
  );
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
  test('does nothing without a header container', () => {
    const dom = new JSDOM('<body></body>', { url: 'http://localhost/page' });
    const fetchMock = mock(async () => responseWithHeaders({ ETag: '"v1"' }));
    mockGlobals({ fetch: fetchMock });

    expect(mount(dom.window as unknown as Window)).toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test('starts with the indicator hidden', () => {
    const win = create();
    const cleanup = mount(win);

    expect(isShowing(win)).toBe(false);

    cleanup?.();
  });

  test('returns a cleanup function', () => {
    const win = create();
    expect(typeof mount(win)).toBe('function');
  });
});

describe('page-update behavior', () => {
  test('uses the first validator as the baseline without showing the indicator', async () => {
    const win = create();
    mockGlobals({
      fetch: mock(async () =>
        responseWithHeaders({ ETag: '"v1"', 'Last-Modified': 'old' }),
      ),
    });

    const cleanup = mountPageUpdate(win, { pollIntervalMs: 10 });
    await flush();

    expect(isShowing(win)).toBe(false);

    cleanup?.();
  });

  test('shows the indicator when the validator changes', async () => {
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

    expect(isShowing(win)).toBe(true);

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

    expect(isShowing(win)).toBe(true);

    cleanup?.();
  });

  test('stays silent when no validators are present', async () => {
    jest.useFakeTimers();
    const win = create();
    mockGlobals({ fetch: mock(async () => responseWithHeaders({})) });

    const cleanup = mountPageUpdate(win, { pollIntervalMs: 10 });
    await flush();
    await advancePolling(10);

    expect(isShowing(win)).toBe(false);

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

    const reload = win.document.querySelector(
      '#page-update-container button',
    ) as HTMLButtonElement;
    expect(reload.getAttribute('aria-label')).toBe('Reload page');
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

    expect(isShowing(win)).toBe(true);

    win.history.pushState({}, '', '/other');
    win.dispatchEvent(new win.Event(NAVIGATION_EVENT));
    await flush();

    expect(isShowing(win)).toBe(false);

    cleanup?.();
  });

  test('cleanup removes the indicator', async () => {
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
    expect(isShowing(win)).toBe(true);

    cleanup?.();

    expect(isShowing(win)).toBe(false);
    expect(win.document.getElementById('page-update-container')).not.toBeNull();
  });

  test('cleanup before an update leaves the container empty', () => {
    const win = create();
    mockGlobals({
      fetch: mock(async () => responseWithHeaders({ ETag: '"v1"' })),
    });

    const cleanup = mountPageUpdate(win, { pollIntervalMs: 10 });
    cleanup?.();

    expect(
      win.document.getElementById('page-update-container')!.innerHTML,
    ).toBe('');
  });
});

test('adopts navigation GET validators without an immediate HEAD', async () => {
  jest.useFakeTimers();
  const win = create();
  const fetchMock = mock(async () => responseWithHeaders({ ETag: '"new"' }));
  mockGlobals({ fetch: fetchMock });
  const cleanup = mountPageUpdate(win, { pollIntervalMs: 100 });
  await flush();
  win.history.pushState({}, '', '/other?view=full#part');
  win.dispatchEvent(
    new (win as unknown as { CustomEvent: typeof CustomEvent }).CustomEvent(
      NAVIGATION_EVENT,
      {
        detail: {
          path: '/other?view=full',
          validators: { etag: '"new"', lastModified: null },
        },
      },
    ),
  );
  await flush();
  expect(fetchMock).toHaveBeenCalledTimes(1);
  await advancePolling(100);
  expect(fetchMock).toHaveBeenLastCalledWith('/other?view=full', {
    method: 'HEAD',
    cache: 'no-cache',
  });
  expect(isShowing(win)).toBe(false);
  cleanup?.();
});

test('discards stale checks across A to B to A and suppresses queued baseline checks', async () => {
  jest.useFakeTimers();
  const win = create('http://localhost/a');
  const pending = deferred<Response>();
  const fetchMock = mock(() => pending.promise);
  mockGlobals({ fetch: fetchMock });
  const cleanup = mountPageUpdate(win, { pollIntervalMs: 100 });
  win.document.dispatchEvent(new win.Event('visibilitychange'));
  for (const path of ['/b', '/a']) {
    win.history.pushState({}, '', path);
    win.dispatchEvent(
      new (win as unknown as { CustomEvent: typeof CustomEvent }).CustomEvent(
        NAVIGATION_EVENT,
        { detail: { path, validators: { etag: '"get"', lastModified: null } } },
      ),
    );
  }
  pending.resolve(responseWithHeaders({ ETag: '"stale"' }));
  await flush();
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(isShowing(win)).toBe(false);
  await advancePolling(100);
  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect(isShowing(win)).toBe(true);
  cleanup?.();
});

test('navigation without validators defers baseline checking to the normal poll', async () => {
  jest.useFakeTimers();
  const win = create();
  const fetchMock = mock(async () => responseWithHeaders({ ETag: '"v1"' }));
  mockGlobals({ fetch: fetchMock });
  const cleanup = mountPageUpdate(win, { pollIntervalMs: 100 });
  await flush();
  win.dispatchEvent(new win.Event(NAVIGATION_EVENT));
  await flush();
  expect(fetchMock).toHaveBeenCalledTimes(1);
  await advancePolling(100);
  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect(isShowing(win)).toBe(false);
  cleanup?.();
});

test('visibility checks queued after navigation run when the stale request finishes', async () => {
  const win = create();
  const pending = deferred<Response>();
  const fetchMock = mock(() => pending.promise);
  mockGlobals({ fetch: fetchMock });
  const cleanup = mountPageUpdate(win);
  win.dispatchEvent(new win.Event(NAVIGATION_EVENT));
  win.document.dispatchEvent(new win.Event('visibilitychange'));
  pending.resolve(responseWithHeaders({ ETag: '"v1"' }));
  await flush();
  expect(fetchMock).toHaveBeenCalledTimes(2);
  cleanup?.();
});
