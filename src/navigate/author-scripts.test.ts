import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { JSDOM } from 'jsdom';
import { deferred, flushMicrotasks } from '../../test-helpers';
import { createGlobals } from '../globals.test';
import type { Globals } from '../globals';
import type { MountOptions } from '../../types/client';

let modules: Record<string, Promise<unknown>> = {};
let reported: { message: string; error: unknown }[] = [];

mock.module('../globals', () => ({
  globals: createGlobals({
    importModule: specifier =>
      modules[specifier] ?? Promise.reject(new Error(`404 ${specifier}`)),
    reportError: (message: string, error: unknown) => {
      reported.push({ message, error });
    },
  } satisfies Partial<Globals>),
}));

const { mountAuthorScripts } = await import('./author-scripts');

function createWindow(hrefs: string[]): Window {
  const links = hrefs
    .map(href => `<link rel="modulepreload" href="${href}" data-tada-script>`)
    .join('');
  const dom = new JSDOM(
    `<!doctype html><body><div class="container">${links}</div></body>`,
    { url: 'http://localhost/page.html' },
  );
  return dom.window as unknown as Window;
}

function module(mount: unknown): Promise<unknown> {
  return Promise.resolve({ default: mount });
}

beforeEach(() => {
  modules = {};
  reported = [];
});

describe('mountAuthorScripts', () => {
  test('mounts each listed module in order with the window and a signal', async () => {
    const calls: string[] = [];
    let options: MountOptions | undefined;
    modules['http://localhost/_scripts/a.js'] = module((o: MountOptions) => {
      options = o;
      calls.push('a');
    });
    modules['http://localhost/_scripts/b.js'] = module(() => {
      calls.push('b');
    });
    const window = createWindow(['/_scripts/a.js', '/_scripts/b.js']);

    mountAuthorScripts(
      window,
      () => true,
      () => {},
    );
    await flushMicrotasks();

    expect(calls).toEqual(['a', 'b']);
    expect(options?.window).toBe(window);
    expect(options?.signal.aborted).toBe(false);
  });

  test('registers an unmount that aborts the signal, then runs the cleanup', async () => {
    const events: string[] = [];
    modules['http://localhost/_scripts/a.js'] = module(
      ({ signal }: MountOptions) => {
        signal.addEventListener('abort', () => events.push('abort'));
        return () => events.push('cleanup');
      },
    );
    const unmounts: (() => void)[] = [];

    mountAuthorScripts(
      createWindow(['/_scripts/a.js']),
      () => true,
      unmount => unmounts.push(unmount),
    );
    await flushMicrotasks();
    expect(unmounts).toHaveLength(1);
    unmounts[0]();

    expect(events).toEqual(['abort', 'cleanup']);
  });

  test('returns without waiting for modules to load or mount', () => {
    modules['http://localhost/_scripts/a.js'] = new Promise(() => {});
    const result = mountAuthorScripts(
      createWindow(['/_scripts/a.js']),
      () => true,
      () => {},
    );
    expect(result).toBeUndefined();
  });

  test('does not mount after the visitor has left the page', async () => {
    const loaded = deferred<unknown>();
    const mount = mock(() => {});
    modules['http://localhost/_scripts/a.js'] = loaded.promise;
    let current = true;

    mountAuthorScripts(
      createWindow(['/_scripts/a.js']),
      () => current,
      () => {},
    );
    current = false;
    loaded.resolve({ default: mount });
    await flushMicrotasks();

    expect(mount).not.toHaveBeenCalled();
  });

  test('aborts the signal as soon as the visitor leaves, even mid-mount', async () => {
    const finished = deferred<() => void>();
    const events: string[] = [];
    modules['http://localhost/_scripts/a.js'] = module(
      ({ signal }: MountOptions) => {
        signal.addEventListener('abort', () => events.push('abort'));
        return finished.promise;
      },
    );
    const unmounts: (() => void)[] = [];

    mountAuthorScripts(
      createWindow(['/_scripts/a.js']),
      () => true,
      unmount => unmounts.push(unmount),
    );
    await flushMicrotasks();
    expect(unmounts).toHaveLength(1);

    // Leaving while the async mount is still running
    unmounts[0]();
    expect(events).toEqual(['abort']);

    // The cleanup it returns later runs right away
    finished.resolve(() => events.push('cleanup'));
    await flushMicrotasks();
    expect(events).toEqual(['abort', 'cleanup']);
  });

  test('a mount that never finishes does not hold up the next script', async () => {
    const mounted = mock(() => {});
    modules['http://localhost/_scripts/slow.js'] = module(
      () => new Promise(() => {}),
    );
    modules['http://localhost/_scripts/next.js'] = module(mounted);

    mountAuthorScripts(
      createWindow(['/_scripts/slow.js', '/_scripts/next.js']),
      () => true,
      () => {},
    );
    await flushMicrotasks();

    expect(mounted).toHaveBeenCalledTimes(1);
  });

  test('reports a cleanup function that throws as a cleanup failure', async () => {
    const error = new Error('cleanup broke');
    modules['http://localhost/_scripts/a.js'] = module(() => () => {
      throw error;
    });
    const unmounts: (() => void)[] = [];

    mountAuthorScripts(
      createWindow(['/_scripts/a.js']),
      () => true,
      unmount => unmounts.push(unmount),
    );
    await flushMicrotasks();
    expect(() => unmounts[0]()).not.toThrow();

    expect(reported).toEqual([
      { message: 'Failed to clean up script /_scripts/a.js:', error },
    ]);
  });

  test('reports a cleanup that throws after a late mount as a cleanup failure', async () => {
    const finished = deferred<() => void>();
    const error = new Error('cleanup broke');
    modules['http://localhost/_scripts/a.js'] = module(() => finished.promise);
    const unmounts: (() => void)[] = [];

    mountAuthorScripts(
      createWindow(['/_scripts/a.js']),
      () => true,
      unmount => unmounts.push(unmount),
    );
    await flushMicrotasks();
    unmounts[0]();
    finished.resolve(() => {
      throw error;
    });
    await flushMicrotasks();

    expect(reported).toEqual([
      { message: 'Failed to clean up script /_scripts/a.js:', error },
    ]);
  });

  test('reports failures, even in production builds, and mounts the rest', async () => {
    expect(__IS_DEV__).toBe(false);
    const mounted = mock(() => {});
    modules['http://localhost/_scripts/not-a-function.js'] = module(42);
    modules['http://localhost/_scripts/throws.js'] = module(() => {
      throw new Error('boom');
    });
    modules['http://localhost/_scripts/side-effects.js'] = Promise.resolve({});
    modules['http://localhost/_scripts/ok.js'] = module(mounted);

    mountAuthorScripts(
      createWindow([
        '/_scripts/missing.js',
        '/_scripts/not-a-function.js',
        '/_scripts/throws.js',
        '/_scripts/side-effects.js',
        '/_scripts/ok.js',
      ]),
      () => true,
      () => {},
    );
    await flushMicrotasks(30);

    expect(reported.map(report => report.message)).toEqual([
      'Failed to mount script /_scripts/missing.js:',
      'Failed to mount script /_scripts/not-a-function.js:',
      'Failed to mount script /_scripts/throws.js:',
    ]);
    expect(String(reported[1].error)).toContain(
      'default export is not a function',
    );
    expect(mounted).toHaveBeenCalledTimes(1);
  });

  test('reports a class default export, such as a library listed directly', async () => {
    class Chart {}
    modules['http://localhost/_scripts/chart.js'] = module(Chart);

    mountAuthorScripts(
      createWindow(['/_scripts/chart.js']),
      () => true,
      () => {},
    );
    await flushMicrotasks(10);

    expect(reported.map(report => report.message)).toEqual([
      'Failed to mount script /_scripts/chart.js:',
    ]);
    expect(String(reported[0].error)).toContain(
      'default export is a class, not a mount function',
    );
  });
});
