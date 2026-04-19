import { mountPerPageComponents, teardownPerPageComponents } from './lifecycle';

export const NAVIGATION_EVENT = 'tada:navigation';

let currentAbortController: AbortController | null = null;
let historyIndex = 0;
let currentPath = '';

const scrollByIndex = new Map<number, number>();

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

function dispatchNavigationEvent(window: Window): void {
  const CustomEventCtor = (
    window as unknown as { CustomEvent: typeof CustomEvent }
  ).CustomEvent;
  window.dispatchEvent(
    new CustomEventCtor(NAVIGATION_EVENT, { detail: { path: currentPath } }),
  );
}

function cleanupViewTransitionNames(document: Document): void {
  const newH1 = document.querySelector(
    '.title-and-info h1',
  ) as HTMLElement | null;
  const newInfo = document.querySelector(
    '.title-and-info .info',
  ) as HTMLElement | null;
  const newBreadcrumb = document.querySelector(
    '.title-and-info a.breadcrumb',
  ) as HTMLElement | null;

  if (newH1) {
    newH1.style.viewTransitionName = '';
  }
  if (newInfo) {
    newInfo.style.viewTransitionName = '';
  }
  if (newBreadcrumb) {
    newBreadcrumb.style.viewTransitionName = '';
  }
}

export function initNavigation(window: Window): void {
  currentAbortController = null;
  historyIndex = 0;
  scrollByIndex.clear();
  window.history.scrollRestoration = 'manual';
  currentPath = window.location.pathname + window.location.search;
  scrollByIndex.set(historyIndex, window.scrollY);
}

export function saveScrollPosition(window: Window): void {
  scrollByIndex.set(historyIndex, window.scrollY);
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

  const header = document.querySelector('header');
  header?.classList.add('loading');

  let response: Response;
  try {
    response = await fetch(url, { signal: controller.signal });
  } catch (err: unknown) {
    header?.classList.remove('loading');
    if (err instanceof Error && err.name === 'AbortError') {
      return;
    }
    window.location.href = url;
    return;
  }

  if (!response.ok) {
    header?.classList.remove('loading');
    window.location.href = url;
    return;
  }

  const html = await response.text();
  header?.classList.remove('loading');

  const DOMParserCtor = (window as unknown as { DOMParser: typeof DOMParser })
    .DOMParser;
  const parser = new DOMParserCtor();
  const newDoc = parser.parseFromString(html, 'text/html');
  if (!newDoc.querySelector('meta[name="generator"][content="Tada"]')) {
    window.location.href = url;
    return;
  }

  const parsed = new URL(url);

  const doSwap = () => {
    teardownPerPageComponents();
    swapContent(document, newDoc);
    updateHead(document, newDoc);
    currentPath = parsed.pathname + parsed.search;

    if (pushHistory) {
      historyIndex++;
      const urlWithoutHash = parsed.origin + parsed.pathname + parsed.search;
      window.history.pushState({ navIndex: historyIndex }, '', urlWithoutHash);
    }

    if (typeof scrollTarget === 'string') {
      const urlWithHash = parsed.pathname + parsed.search + '#' + scrollTarget;
      window.location.replace(urlWithHash);
      window.history.replaceState({ navIndex: historyIndex }, '', urlWithHash);
    } else if (typeof scrollTarget === 'number') {
      window.scrollTo({ top: scrollTarget });
    } else {
      window.scrollTo({ top: 0 });
    }

    scrollByIndex.set(historyIndex, window.scrollY);
  };

  const transitionDoc = document as Document & {
    startViewTransition?: (cb: () => void) => { finished: Promise<void> };
  };

  if (
    useViewTransition &&
    typeof transitionDoc.startViewTransition === 'function'
  ) {
    const titleEl = document.querySelector('.title-and-info');
    const headerHeight =
      document.querySelector('header')?.getBoundingClientRect().height ?? 0;
    const titleVisible =
      titleEl != null && titleEl.getBoundingClientRect().top >= headerHeight;

    if (titleVisible) {
      const h1 = titleEl.querySelector('h1') as HTMLElement | null;
      const info = titleEl.querySelector('.info') as HTMLElement | null;
      const breadcrumb = titleEl.querySelector(
        'a.breadcrumb',
      ) as HTMLElement | null;
      if (h1) {
        h1.style.viewTransitionName = 'page-title';
      }
      if (info) {
        info.style.viewTransitionName = 'page-info';
      }
      if (breadcrumb) {
        breadcrumb.style.viewTransitionName = 'page-breadcrumb';
      }
    }

    document.documentElement.classList.add(
      direction === 'forward' ? 'nav-forward' : 'nav-back',
    );

    const transition = transitionDoc.startViewTransition(() => {
      doSwap();

      const newTitleEl = document.querySelector('.title-and-info');
      const newHeaderHeight =
        document.querySelector('header')?.getBoundingClientRect().height ?? 0;
      const newTitleVisible =
        newTitleEl != null &&
        newTitleEl.getBoundingClientRect().top >= newHeaderHeight;

      if (newTitleVisible && newTitleEl) {
        const h1 = newTitleEl.querySelector('h1') as HTMLElement | null;
        const info = newTitleEl.querySelector('.info') as HTMLElement | null;
        const breadcrumb = newTitleEl.querySelector(
          'a.breadcrumb',
        ) as HTMLElement | null;
        if (h1) {
          h1.style.viewTransitionName = 'page-title';
        }
        if (info) {
          info.style.viewTransitionName = 'page-info';
        }
        if (breadcrumb) {
          breadcrumb.style.viewTransitionName = 'page-breadcrumb';
        }
      }
    });

    await transition.finished;
    document.documentElement.classList.remove('nav-forward', 'nav-back');
    cleanupViewTransitionNames(document);
  } else {
    doSwap();
  }

  await mountPerPageComponents(window);
  currentAbortController = null;
  dispatchNavigationEvent(window);
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
