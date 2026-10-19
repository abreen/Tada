import { globals } from '../globals';
import type { Mount, Unmount } from '../../types/client';

// How long navigation waits for the new page's scripts and stylesheets
const AUTHOR_ASSET_TIMEOUT = 3000;

/**
 * Waits for a page's scripts or stylesheets to load before a client-side
 * navigation swaps it in, at most AUTHOR_ASSET_TIMEOUT, or until the
 * navigation is abandoned
 */
export async function waitForAuthorAssets(
  window: Window,
  loads: Promise<unknown>[],
  signal: AbortSignal,
): Promise<void> {
  let timer: number | undefined;
  let onAbort: (() => void) | undefined;
  await Promise.race([
    Promise.all(loads),
    new Promise<void>(resolve => {
      timer = window.setTimeout(resolve, AUTHOR_ASSET_TIMEOUT);
    }),
    new Promise<void>(resolve => {
      onAbort = resolve;
      signal.addEventListener('abort', onAbort, { once: true });
    }),
  ]);
  window.clearTimeout(timer);
  signal.removeEventListener('abort', onAbort!);
}

/**
 * Loads the scripts of a page that a client-side navigation is about to show,
 * before its content is swapped in. Top-level code, such as a
 * `customElements.define` call, then runs before the visitor sees the page,
 * so custom elements are upgraded as the content is inserted. A module that
 * fails or takes too long to load does not hold up navigation; failures are
 * reported when the page mounts its scripts.
 */
export async function loadAuthorModules(
  window: Window,
  newDoc: Document,
  pageUrl: string,
  signal: AbortSignal,
): Promise<void> {
  const loads = [
    ...newDoc.querySelectorAll('.container link[data-tada-script]'),
  ].flatMap(link => {
    const href = link.getAttribute('href');
    if (!href) {
      return [];
    }
    let url: string;
    try {
      url = new URL(href, pageUrl).href;
    } catch {
      // Reported when the page mounts its scripts
      return [];
    }
    return [
      Promise.resolve(globals.importModule(url)).then(
        () => {},
        () => {},
      ),
    ];
  });
  if (loads.length === 0) {
    return;
  }

  await waitForAuthorAssets(window, loads, signal);
}

/**
 * Mounts the scripts compiled from the site's src/ directory. They are listed
 * as module preload links at the end of the page content. Modules load in
 * parallel and their mounts start in page order, without waiting for each
 * other. This returns right away, so a slow script never holds up navigation.
 *
 * `isCurrent` reports whether the page is still shown. `register` receives
 * each mounted script's unmount function.
 */
export function mountAuthorScripts(
  window: Window,
  isCurrent: () => boolean,
  register: (unmount: Unmount) => void,
): void {
  if (!isCurrent()) {
    return;
  }
  const links = [
    ...window.document.querySelectorAll<HTMLLinkElement>(
      '.container link[data-tada-script]',
    ),
  ];
  const modules = links.map(link => {
    const loaded = globals.importModule(link.href) as Promise<{
      default?: unknown;
    }>;
    // Rejections are reported in order below
    loaded.catch(() => {});
    return loaded;
  });

  void (async () => {
    for (const [index, link] of links.entries()) {
      let mount: unknown;
      try {
        mount = (await modules[index]).default;
      } catch (err) {
        reportMountError(link, err);
        continue;
      }
      if (!isCurrent()) {
        return;
      }
      if (mount !== undefined) {
        startMount(window, link, mount, register);
      }
    }
  })();
}

function reportMountError(link: HTMLLinkElement, err: unknown): void {
  // Author code: reported in production builds too
  globals.reportError(
    `Failed to mount script ${link.getAttribute('href')}:`,
    err,
  );
}

function runCleanup(link: HTMLLinkElement, cleanup: unknown): void {
  if (typeof cleanup !== 'function') {
    return;
  }
  try {
    (cleanup as Unmount)();
  } catch (err) {
    globals.reportError(
      `Failed to clean up script ${link.getAttribute('href')}:`,
      err,
    );
  }
}

/**
 * Calls a script's default export. Its unmount is registered first, so leaving
 * the page aborts the signal even while an async mount is still running; a
 * cleanup function returned after that runs right away. Mounts don't wait for
 * each other.
 */
function startMount(
  window: Window,
  link: HTMLLinkElement,
  mount: unknown,
  register: (unmount: Unmount) => void,
): void {
  const controller = new AbortController();
  let cleanup: unknown;
  let unmounted = false;
  register(() => {
    unmounted = true;
    controller.abort();
    runCleanup(link, cleanup);
  });

  let result: ReturnType<Mount>;
  try {
    if (typeof mount !== 'function') {
      throw new Error('default export is not a function');
    }
    // Such as a library listed directly instead of a package that mounts it
    if (Function.prototype.toString.call(mount).startsWith('class')) {
      throw new Error('default export is a class, not a mount function');
    }
    result = (mount as Mount)({ window, signal: controller.signal });
  } catch (err) {
    controller.abort();
    reportMountError(link, err);
    return;
  }
  Promise.resolve(result).then(
    value => {
      if (unmounted) {
        runCleanup(link, value);
      } else {
        cleanup = value;
      }
    },
    (err: unknown) => {
      controller.abort();
      reportMountError(link, err);
    },
  );
}
