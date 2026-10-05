import { getResponseValidators, type ResponseValidators } from '../validators';
import {
  mountAppearancePickerForPage,
  mountPerPageComponents,
  teardownPerPageComponents,
} from './lifecycle';
import { globals } from '../globals';
import { getHashTarget } from '../hash-target';
import { swapHeaderTitle } from '../header';

export const NAVIGATION_EVENT = 'tada:navigation';

const LOADING_CURSOR_DELAY = 400;

let currentAbortController: AbortController | null = null;
let historyIndex = 0;
let currentPath = '';
let applyingFragment = false;

const scrollByIndex = new Map<number, number>();
const scrollByLocation = new Map<string, number>();

type Direction = 'forward' | 'back';

interface NavigationOptions {
  url: string;
  scrollTarget: number | string | null;
  direction: Direction;
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

export function closeHeaderDetails(document: Document): void {
  const details = document.querySelector(
    'header details',
  ) as HTMLDetailsElement | null;
  if (details?.open) {
    details.open = false;
  }
}

export interface NavigationEventDetail {
  path: string;
  validators: ResponseValidators;
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

// Heading parts that get their own layer instead of sliding with the page. The
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

function prefersReducedMotion(window: Window): boolean {
  if (typeof window.matchMedia !== 'function') {
    return false;
  }

  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

export function initNavigation(window: Window): void {
  currentAbortController = null;
  historyIndex = 0;
  scrollByIndex.clear();
  scrollByLocation.clear();
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

export function getHistoryIndex(): number {
  return historyIndex;
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
  globals.replaceLocation(
    window,
    location.pathname + location.search + (location.hash || '#'),
  );
  applyingFragment = false;
  history.replaceState(state, '', href);
  window.scrollTo({ left: scrollX, top: scrollY });
}

export async function navigateToUrl(
  window: Window,
  options: NavigationOptions,
): Promise<void> {
  const { document } = window;
  const {
    url,
    scrollTarget,
    direction,
    pushHistory,
    useViewTransition = true,
  } = options;

  if (currentAbortController) {
    currentAbortController.abort();
  }

  const controller = new AbortController();
  currentAbortController = controller;
  document.documentElement.classList.remove('nav-forward', 'nav-back');
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

  stopLoading();

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
    globals.setLocationHref(window, url);
    return;
  }

  const parsed = new URL(url);

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

    if (typeof scrollTarget === 'string') {
      const urlWithHash = parsed.pathname + parsed.search + '#' + scrollTarget;
      globals.replaceLocation(window, urlWithHash);
      window.history.replaceState({ navIndex: historyIndex }, '', urlWithHash);
    } else if (typeof scrollTarget === 'number') {
      window.scrollTo({ top: scrollTarget });
    } else {
      window.scrollTo({ top: 0 });
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
    const headerHeight =
      document.querySelector('header')?.getBoundingClientRect().height ?? 0;
    const titleVisible =
      titleEl != null && titleEl.getBoundingClientRect().top >= headerHeight;

    if (titleVisible) {
      setTitleTransitionNames(titleEl, true);
    }
    setPageBottomTransitionName(window);

    document.documentElement.classList.add(
      direction === 'forward' ? 'nav-forward' : 'nav-back',
    );

    const transition = transitionDoc.startViewTransition(() => {
      if (!doSwap()) {
        return;
      }

      const newTitleEl = document.querySelector('.title-and-info');
      const newHeaderHeight =
        document.querySelector('header')?.getBoundingClientRect().height ?? 0;
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

    document.documentElement.classList.remove('nav-forward', 'nav-back');
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
    direction: 'forward',
    pushHistory: false,
    useViewTransition: false,
  });
}
