import { globals } from '../globals';
import type { Mount, Unmount } from '../../types/client';

// How long navigation waits for the new page's scripts and stylesheets
const AUTHOR_ASSET_TIMEOUT = 3000;

// Turns off a stylesheet that is loading for a page not yet shown
export const DISABLED_MEDIA = 'not all';

interface ScriptLink {
  link: Element;
  /** The script's URL, or null if its href can't be parsed */
  url: string | null;
}

/**
 * The scripts a page lists as module preload links at the end of its
 * content, with URLs resolved against `baseUrl`, the page's URL
 */
function findScriptLinks(root: ParentNode, baseUrl: string): ScriptLink[] {
  return [...root.querySelectorAll('.container link[data-tada-script]')].map(
    link => {
      const href = link.getAttribute('href') ?? '';
      try {
        return { link, url: new URL(href, baseUrl).href };
      } catch {
        return { link, url: null };
      }
    },
  );
}

/**
 * Waits for a page's scripts or stylesheets to load before a client-side
 * navigation swaps it in, at most AUTHOR_ASSET_TIMEOUT, or until the
 * navigation is abandoned
 */
async function waitForAuthorAssets(
  window: Window,
  loads: Promise<unknown>[],
  signal: AbortSignal,
): Promise<void> {
  if (loads.length === 0 || signal.aborted) {
    return;
  }
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
 * Loads what a page that a client-side navigation is about to show needs from
 * the site's src/ scripts: their stylesheets and the scripts themselves. Both
 * load in parallel, and navigation waits for them before swapping in the page.
 */
export async function loadAuthorAssets(
  window: Window,
  newDoc: Document,
  pageUrl: string,
  signal: AbortSignal,
): Promise<void> {
  await Promise.all([
    loadAuthorStylesheets(window, newDoc, signal),
    loadAuthorModules(window, newDoc, pageUrl, signal),
  ]);
}

/**
 * Adds the new page's stylesheets from src/ scripts and waits for them to
 * load, turned off until updateHead turns them on, so the new content never
 * shows unstyled. A stylesheet that fails or takes too long to load does not
 * hold up navigation. If the navigation is abandoned, its stylesheets are
 * removed.
 */
async function loadAuthorStylesheets(
  window: Window,
  newDoc: Document,
  signal: AbortSignal,
): Promise<void> {
  const { document } = window;
  // Stylesheets still turned off belong to an abandoned navigation, such as
  // one superseded before its view transition swapped the content. Left in
  // place, the next swap would turn them on as duplicates.
  for (const link of document.querySelectorAll(
    `link[data-tada-style][media="${DISABLED_MEDIA}"]`,
  )) {
    link.remove();
  }
  const existing = new Set(
    Array.from(document.querySelectorAll('link[data-tada-style]')).map(link =>
      link.getAttribute('href'),
    ),
  );
  const pending: HTMLLinkElement[] = [];
  const loads: Promise<void>[] = [];
  for (const link of newDoc.querySelectorAll('link[data-tada-style]')) {
    if (existing.has(link.getAttribute('href'))) {
      continue;
    }
    const added = link.cloneNode(true) as HTMLLinkElement;
    added.media = DISABLED_MEDIA;
    loads.push(
      new Promise(resolve => {
        added.addEventListener('load', () => resolve(), { once: true });
        added.addEventListener('error', () => resolve(), { once: true });
      }),
    );
    pending.push(added);
    document.head.appendChild(added);
  }
  await waitForAuthorAssets(window, loads, signal);

  if (signal.aborted) {
    for (const link of pending) {
      link.remove();
    }
  }
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
  const loads = findScriptLinks(newDoc, pageUrl).flatMap(({ url }) =>
    url === null
      ? []
      : [
          Promise.resolve(globals.importModule(url)).then(
            () => {},
            () => {},
          ),
        ],
  );
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
  const links = findScriptLinks(window.document, window.document.baseURI);
  const modules = links.map(({ url }) => {
    const loaded = (
      url === null
        ? Promise.reject(new Error('invalid URL'))
        : globals.importModule(url)
    ) as Promise<{ default?: unknown }>;
    // Rejections are reported in order below
    loaded.catch(() => {});
    return loaded;
  });

  void (async () => {
    for (const [index, { link }] of links.entries()) {
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

function reportMountError(link: Element, err: unknown): void {
  // Author code: reported in production builds too
  globals.reportError(
    `Failed to mount script ${link.getAttribute('href')}:`,
    err,
  );
}

function runCleanup(link: Element, cleanup: unknown): void {
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
  link: Element,
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
