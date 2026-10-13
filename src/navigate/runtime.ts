import { getResponseValidators, type ResponseValidators } from '../validators';
import {
  mountAppearancePickerForPage,
  mountPerPageComponents,
  teardownPerPageComponents,
} from './lifecycle';
import { globals } from '../globals';
import { prefersReducedMotion } from '../util';
import { getHashTarget } from '../hash-target';
import { swapHeaderTitle } from '../header';
import { setScrollRestored } from './restored-scroll';

export const NAVIGATION_EVENT = 'tada:navigation';

const LOADING_CURSOR_DELAY = 400;

let currentAbortController: AbortController | null = null;
let historyIndex = 0;
let currentPath = '';
let applyingFragment = false;

const scrollByIndex = new Map<number, number>();
const scrollByLocation = new Map<string, number>();

interface NavigationOptions {
  url: string;
  scrollTarget: number | string | null;
  pushHistory: boolean;
  useViewTransition?: boolean;
}

function updateHead(document: Document, newDoc: Document): void {
  document.title = newDoc.title;

  const metaTags = ['description', 'author'];
  for (const name of metaTags) {
    const newMeta = newDoc.querySelector(`meta[name="${name}"]`);
    const oldMeta = document.querySelector(`meta[name="${name}"]`);
    if (newMeta && oldMeta) {
      oldMeta.setAttribute('content', newMeta.getAttribute('content') ?? '');
    } else if (newMeta && !oldMeta) {
      document.head.appendChild(newMeta.cloneNode(true));
    } else if (!newMeta && oldMeta) {
      oldMeta.remove();
    }
  }

  const ogTags = ['og:title', 'og:author'];
  for (const prop of ogTags) {
    const newMeta = newDoc.querySelector(`meta[property="${prop}"]`);
    const oldMeta = document.querySelector(`meta[property="${prop}"]`);
    if (newMeta && oldMeta) {
      oldMeta.setAttribute('content', newMeta.getAttribute('content') ?? '');
    } else if (newMeta && !oldMeta) {
      document.head.appendChild(newMeta.cloneNode(true));
    } else if (!newMeta && oldMeta) {
      oldMeta.remove();
    }
  }

  const existingHrefs = new Set(
    Array.from(document.querySelectorAll('link[rel="stylesheet"]')).map(link =>
      link.getAttribute('href'),
    ),
  );

  for (const link of newDoc.querySelectorAll('link[rel="stylesheet"]')) {
    if (!existingHrefs.has(link.getAttribute('href'))) {
      document.head.appendChild(link.cloneNode(true));
    }
  }

  // Stylesheets from the site's src/ scripts belong to the pages that load
  // them, so they don't style the next page. The new page's were loaded
  // turned off before the swap (see loadAuthorStylesheets).
  for (const link of document.querySelectorAll<HTMLLinkElement>(
    `link[data-tada-style][media="${DISABLED_MEDIA}"]`,
  )) {
    link.removeAttribute('media');
  }
  const newAuthorHrefs = new Set(
    Array.from(newDoc.querySelectorAll('link[data-tada-style]')).map(link =>
      link.getAttribute('href'),
    ),
  );
  for (const link of document.querySelectorAll('link[data-tada-style]')) {
    if (!newAuthorHrefs.has(link.getAttribute('href'))) {
      link.remove();
    }
  }
}

const DISABLED_MEDIA = 'not all';

// How long navigation waits for the new page's stylesheets from src/ scripts
const AUTHOR_STYLESHEET_TIMEOUT = 3000;

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
  if (pending.length === 0) {
    return;
  }

  let timer: number | undefined;
  let onAbort: (() => void) | undefined;
  await Promise.race([
    Promise.all(loads),
    new Promise<void>(resolve => {
      timer = window.setTimeout(resolve, AUTHOR_STYLESHEET_TIMEOUT);
    }),
    new Promise<void>(resolve => {
      onAbort = resolve;
      signal.addEventListener('abort', onAbort, { once: true });
    }),
  ]);
  window.clearTimeout(timer);
  signal.removeEventListener('abort', onAbort!);

  if (signal.aborted) {
    for (const link of pending) {
      link.remove();
    }
  }
}

// Parsed and imported scripts are marked as already started, so browsers
// never run them. Replacing each with a fresh element runs it like a cold load.
function runAuthorScripts(document: Document, container: Element): void {
  for (const script of container.querySelectorAll('script')) {
    const fresh = document.createElement('script');
    for (const { name, value } of script.attributes) {
      fresh.setAttribute(name, value);
    }
    // Keep external scripts in document order, as on a cold load
    if (fresh.src && !script.hasAttribute('async')) {
      fresh.async = false;
    }
    fresh.textContent = script.textContent;
    script.replaceWith(fresh);
  }
}

function swapContent(document: Document, newDoc: Document): void {
  const newContainer = newDoc.querySelector('.container');
  const oldContainer = document.querySelector('.container');
  if (newContainer && oldContainer) {
    const imported = document.importNode(newContainer, true);
    oldContainer.replaceChildren(...imported.childNodes);
  }

  document.body.className = newDoc.body.className;
}

export function clearSearch(document: Document): void {
  const input = document.querySelector(
    'input.search.quick-search',
  ) as HTMLInputElement | null;
  if (input && input.value) {
    const EventCtor = document.defaultView?.Event ?? Event;
    input.value = '';
    input.dispatchEvent(new EventCtor('input', { bubbles: true }));
  }
}

// How far the header covers the top of the viewport; a static header that has
// scrolled away covers none of it
function getHeaderCoverage(document: Document): number {
  const bottom = document
    .querySelector('header')
    ?.getBoundingClientRect().bottom;
  return Math.max(0, bottom ?? 0);
}

export function closeHeaderDetails(document: Document): void {
  const details = document.querySelector(
    'header details',
  ) as HTMLDetailsElement | null;
  if (details?.open) {
    details.open = false;
  }
}

function dispatchNavigationEvent(
  window: Window,
  validators: ResponseValidators,
): void {
  const CustomEventCtor = (
    window as unknown as { CustomEvent: typeof CustomEvent }
  ).CustomEvent;
  window.dispatchEvent(
    new CustomEventCtor(NAVIGATION_EVENT, {
      detail: { path: currentPath, validators },
    }),
  );
}

// Heading parts that get their own layer instead of fading with the page. The
// breadcrumb trail is one group so every item, including the current one,
// moves together when the page layout changes.
const TITLE_TRANSITION_NAMES = [
  ['nav.breadcrumbs', 'page-breadcrumbs'],
  ['h1', 'page-title'],
  ['.info', 'page-info'],
] as const;

function setTitleTransitionNames(titleEl: Element, enabled: boolean): void {
  for (const [selector, name] of TITLE_TRANSITION_NAMES) {
    const element = titleEl.querySelector<HTMLElement>(selector);
    if (element) {
      element.style.viewTransitionName = enabled ? name : '';
    }
  }
}

// The footer and appearance pickers get their own layer only while they are in
// the viewport, so the layer stays put when they are on screen on both pages
// and fades on its own when they are on screen on only one.
function setPageBottomTransitionName(window: Window): void {
  const bottom = window.document.querySelector<HTMLElement>('.page-bottom');
  if (!bottom) {
    return;
  }
  const rect = bottom.getBoundingClientRect();
  if (rect.bottom > 0 && rect.top < window.innerHeight) {
    bottom.style.viewTransitionName = 'page-bottom';
  }
}

function cleanupViewTransitionNames(document: Document): void {
  const titleEl = document.querySelector('.title-and-info');
  if (titleEl) {
    setTitleTransitionNames(titleEl, false);
  }
  const bottom = document.querySelector<HTMLElement>('.page-bottom');
  if (bottom) {
    bottom.style.viewTransitionName = '';
  }
}

function getLocationKey(window: Window): string {
  return (
    window.location.pathname + window.location.search + window.location.hash
  );
}

function isAbortError(err: unknown): boolean {
  return err instanceof Error && err.name === 'AbortError';
}

function isActiveNavigation(controller: AbortController): boolean {
  return currentAbortController === controller && !controller.signal.aborted;
}

// Whether the browser restores this page's scroll position itself: a reload
// whose entry still has automatic scroll restoration, which the watch-mode
// reload client turns back on before a dev server refresh. Other reloads keep
// the manual mode set below, so they restore nothing.
function browserRestoresScroll(window: Window): boolean {
  if (window.history.scrollRestoration !== 'auto') {
    return false;
  }
  const [entry] = window.performance?.getEntriesByType?.('navigation') ?? [];
  return (entry as PerformanceNavigationTiming | undefined)?.type === 'reload';
}

export function initNavigation(window: Window): void {
  currentAbortController = null;
  historyIndex = 0;
  scrollByIndex.clear();
  scrollByLocation.clear();
  setScrollRestored(browserRestoresScroll(window));
  window.history.scrollRestoration = 'manual';
  currentPath = window.location.pathname + window.location.search;
  scrollByIndex.set(historyIndex, window.scrollY);
  scrollByLocation.set(getLocationKey(window), window.scrollY);
}

export function saveScrollPosition(window: Window): void {
  scrollByIndex.set(historyIndex, window.scrollY);
  scrollByLocation.set(getLocationKey(window), window.scrollY);
}

export function getCurrentPath(): string {
  return currentPath;
}

export function setCurrentPath(path: string): void {
  currentPath = path;
}

export function setHistoryIndex(index: number): void {
  historyIndex = index;
}

export function getSavedScroll(index: number): number | undefined {
  return scrollByIndex.get(index);
}

export function getSavedLocationScroll(
  locationKey: string,
): number | undefined {
  return scrollByLocation.get(locationKey);
}

// Browsers fire popstate synchronously during applyFragmentTarget
export function isApplyingFragment(): boolean {
  return applyingFragment;
}

// Restoring a history entry can leave :target stale. With manual scroll
// restoration, WebKit skips fragment processing on Back/Forward, and swapped
// content loses it in every browser. A fragment navigation sets it in every
// browser, but it can reset the entry's history state and scroll position, so
// restore both.
export function applyFragmentTarget(window: Window): void {
  const { document, history, location } = window;
  if (
    document.querySelector(':target') === getHashTarget(document, location.hash)
  ) {
    return;
  }
  const { href } = location;
  const state = history.state;
  const { scrollX, scrollY } = window;
  applyingFragment = true;
  try {
    globals.replaceLocation(
      window,
      location.pathname + location.search + (location.hash || '#'),
    );
  } finally {
    applyingFragment = false;
  }
  history.replaceState(state, '', href);
  window.scrollTo({ left: scrollX, top: scrollY });
}

export async function navigateToUrl(
  window: Window,
  options: NavigationOptions,
): Promise<void> {
  const { document } = window;
  const { url, scrollTarget, pushHistory, useViewTransition = true } = options;

  if (currentAbortController) {
    currentAbortController.abort();
  }

  const controller = new AbortController();
  currentAbortController = controller;
  cleanupViewTransitionNames(document);

  const header = document.querySelector('header');
  header?.classList.add('loading');
  const loadingCursorTimeout = window.setTimeout(() => {
    if (isActiveNavigation(controller)) {
      document.documentElement.classList.add('navigation-loading');
    }
  }, LOADING_CURSOR_DELAY);
  const stopLoading = (): void => {
    window.clearTimeout(loadingCursorTimeout);
    if (!isActiveNavigation(controller)) {
      return;
    }
    header?.classList.remove('loading');
    document.documentElement.classList.remove('navigation-loading');
  };

  let response: Response;
  try {
    response = await globals.fetch(url, { signal: controller.signal });
  } catch (err: unknown) {
    stopLoading();
    if (!isActiveNavigation(controller)) {
      return;
    }
    if (isAbortError(err)) {
      return;
    }
    globals.setLocationHref(window, url);
    return;
  }

  if (!isActiveNavigation(controller)) {
    stopLoading();
    return;
  }

  if (!response.ok) {
    stopLoading();
    globals.setLocationHref(window, url);
    return;
  }

  let html: string;
  try {
    html = await response.text();
  } catch (err: unknown) {
    stopLoading();
    if (!isActiveNavigation(controller)) {
      return;
    }
    if (isAbortError(err)) {
      return;
    }
    globals.setLocationHref(window, url);
    return;
  }

  if (!isActiveNavigation(controller)) {
    stopLoading();
    return;
  }

  const DOMParserCtor = (window as unknown as { DOMParser: typeof DOMParser })
    .DOMParser;
  const parser = new DOMParserCtor();
  const newDoc = parser.parseFromString(html, 'text/html');
  const currentGenerator = document
    .querySelector('meta[name="generator"]')
    ?.getAttribute('content');
  const newGenerator = newDoc
    .querySelector('meta[name="generator"]')
    ?.getAttribute('content');
  if (!currentGenerator || !newGenerator || newGenerator !== currentGenerator) {
    stopLoading();
    globals.setLocationHref(window, url);
    return;
  }

  const parsed = new URL(url);

  // The loading indicator stays on while the new page's stylesheets load
  await loadAuthorStylesheets(window, newDoc, controller.signal);
  stopLoading();
  if (!isActiveNavigation(controller)) {
    return;
  }

  const doSwap = (): boolean => {
    if (!isActiveNavigation(controller)) {
      return false;
    }

    teardownPerPageComponents();
    swapContent(document, newDoc);
    if (!pushHistory) {
      // Restore the entry's :target before updateHead adds stylesheets. WebKit
      // defers fragment scrolling until they load, which would move the page
      // away from the entry's restored scroll position.
      applyFragmentTarget(window);
    }
    updateHead(document, newDoc);
    mountAppearancePickerForPage(window);
    currentPath = parsed.pathname + parsed.search;

    if (pushHistory) {
      historyIndex++;
      const urlWithoutHash = parsed.origin + parsed.pathname + parsed.search;
      window.history.pushState({ navIndex: historyIndex }, '', urlWithoutHash);
    }

    setScrollRestored(typeof scrollTarget === 'number');
    if (typeof scrollTarget === 'string') {
      const urlWithHash = parsed.pathname + parsed.search + '#' + scrollTarget;
      globals.replaceLocation(window, urlWithHash);
      window.history.replaceState({ navIndex: historyIndex }, '', urlWithHash);
    } else if (typeof scrollTarget === 'number') {
      window.scrollTo({ top: scrollTarget });
    } else {
      window.scrollTo({ top: 0 });
    }

    // As on a cold load, scripts in the content see the new page's URL,
    // title, and stylesheets
    const container = document.querySelector('.container');
    if (container) {
      runAuthorScripts(document, container);
    }

    scrollByIndex.set(historyIndex, window.scrollY);
    scrollByLocation.set(getLocationKey(window), window.scrollY);

    // Measured at the destination scroll position; the transition crossfades it
    swapHeaderTitle(newDoc);
    return true;
  };

  const transitionDoc = document as Document & {
    startViewTransition?: (cb: () => void) => { finished: Promise<void> };
  };

  if (
    useViewTransition &&
    !prefersReducedMotion(window) &&
    typeof transitionDoc.startViewTransition === 'function'
  ) {
    const titleEl = document.querySelector('.title-and-info');
    const headerHeight = getHeaderCoverage(document);
    const titleVisible =
      titleEl != null && titleEl.getBoundingClientRect().top >= headerHeight;

    if (titleVisible) {
      setTitleTransitionNames(titleEl, true);
    }
    setPageBottomTransitionName(window);

    const transition = transitionDoc.startViewTransition(() => {
      if (!doSwap()) {
        return;
      }

      const newTitleEl = document.querySelector('.title-and-info');
      const newHeaderHeight = getHeaderCoverage(document);
      const newTitleVisible =
        newTitleEl != null &&
        newTitleEl.getBoundingClientRect().top >= newHeaderHeight;

      if (newTitleVisible && newTitleEl) {
        setTitleTransitionNames(newTitleEl, true);
      }
      setPageBottomTransitionName(window);
    });

    await transition.finished;
    if (!isActiveNavigation(controller)) {
      return;
    }

    cleanupViewTransitionNames(document);
  } else {
    if (!doSwap()) {
      return;
    }
  }

  await mountPerPageComponents(window);
  if (!isActiveNavigation(controller)) {
    return;
  }

  currentAbortController = null;
  dispatchNavigationEvent(window, getResponseValidators(response));
}

export async function refreshCurrentPage(window: Window): Promise<void> {
  clearSearch(window.document);
  closeHeaderDetails(window.document);
  saveScrollPosition(window);
  await navigateToUrl(window, {
    url: window.location.href,
    scrollTarget: window.scrollY,
    pushHistory: false,
    useViewTransition: false,
  });
}
