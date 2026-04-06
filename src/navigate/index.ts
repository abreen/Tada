import { isEligibleLink } from './eligible';
import { mountPerPageComponents, teardownPerPageComponents } from './lifecycle';

let currentAbortController: AbortController | null = null;
let historyIndex = 0;
let currentPath = '';

type Direction = 'forward' | 'back';

function findAnchor(event: MouseEvent): HTMLAnchorElement | null {
  const target = event.target as HTMLElement | null;
  return target?.closest('a[href]') ?? null;
}

function shouldIgnoreClick(
  event: MouseEvent,
  anchor: HTMLAnchorElement,
): boolean {
  if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) {
    return true;
  }

  if (anchor.target) {
    return true;
  }

  const href = anchor.href;
  if (!href) {
    return true;
  }

  return false;
}

function updateHead(newDoc: Document): void {
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

  // Adopt stylesheet links from the new page that aren't already loaded
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

function swapContent(newDoc: Document): void {
  const newContainer = newDoc.querySelector('.container');
  const oldContainer = document.querySelector('.container');
  if (newContainer && oldContainer) {
    oldContainer.replaceChildren(...newContainer.childNodes);
  }

  // Update body class (carries template name and toc-is-active)
  document.body.className = newDoc.body.className;
}

function clearSearch(): void {
  const input = document.querySelector(
    'input.search.quick-search',
  ) as HTMLInputElement | null;
  if (input && input.value) {
    input.value = '';
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }
}

async function performNavigation(
  url: string,
  scrollTarget: number | string | null,
  direction: Direction,
  isPush: boolean,
): Promise<void> {
  if (currentAbortController) {
    currentAbortController.abort();
  }

  const controller = new AbortController();
  currentAbortController = controller;

  let response: Response;
  try {
    response = await fetch(url, { signal: controller.signal });
  } catch (err: unknown) {
    if (err instanceof Error && err.name === 'AbortError') {
      return;
    }
    // Fetch failed, fall back to full navigation
    window.location.href = url;
    return;
  }

  if (!response.ok) {
    window.location.href = url;
    return;
  }

  const html = await response.text();
  const parser = new DOMParser();
  const newDoc = parser.parseFromString(html, 'text/html');

  const doSwap = async () => {
    teardownPerPageComponents();
    swapContent(newDoc);
    updateHead(newDoc);
    if (isPush) {
      historyIndex++;
      history.pushState({ navIndex: historyIndex }, '', url);
    }
    const parsed = new URL(url);
    currentPath = parsed.pathname + parsed.search;

    if (typeof scrollTarget === 'string') {
      // Hash target
      const el = document.getElementById(scrollTarget);
      if (el) {
        el.scrollIntoView();
      } else {
        window.scrollTo({ top: 0 });
      }
    } else if (typeof scrollTarget === 'number') {
      // Restore scroll position (popstate)
      window.scrollTo({ top: scrollTarget });
    } else {
      window.scrollTo({ top: 0 });
    }

    await mountPerPageComponents(window);
  };

  const doc = document as Document & {
    startViewTransition?: (cb: () => Promise<void>) => {
      finished: Promise<void>;
    };
  };

  if (typeof doc.startViewTransition === 'function') {
    // Only give the title its own transition group if it's visible
    const titleEl = document.querySelector('.title-and-info');
    const titleVisible =
      titleEl != null && titleEl.getBoundingClientRect().bottom >= 0;

    if (titleVisible) {
      const h1 = titleEl.querySelector('h1') as HTMLElement | null;
      const info = titleEl.querySelector('.info') as HTMLElement | null;
      if (h1) {
        h1.style.viewTransitionName = 'page-title';
      }
      if (info) {
        info.style.viewTransitionName = 'page-info';
      }
    }

    document.documentElement.classList.add(
      direction === 'forward' ? 'nav-forward' : 'nav-back',
    );

    const transition = doc.startViewTransition(() => {
      const result = doSwap();
      // Apply transition names to the new title if the old one was visible
      if (titleVisible) {
        const newTitleEl = document.querySelector('.title-and-info');
        if (newTitleEl) {
          const h1 = newTitleEl.querySelector('h1') as HTMLElement | null;
          const info = newTitleEl.querySelector('.info') as HTMLElement | null;
          if (h1) {
            h1.style.viewTransitionName = 'page-title';
          }
          if (info) {
            info.style.viewTransitionName = 'page-info';
          }
        }
      }
      return result;
    });
    await transition.finished;
    document.documentElement.classList.remove('nav-forward', 'nav-back');
    // Clean up inline styles
    const newH1 = document.querySelector(
      '.title-and-info h1',
    ) as HTMLElement | null;
    const newInfo = document.querySelector(
      '.title-and-info .info',
    ) as HTMLElement | null;
    if (newH1) {
      newH1.style.viewTransitionName = '';
    }
    if (newInfo) {
      newInfo.style.viewTransitionName = '';
    }
  } else {
    await doSwap();
  }

  currentAbortController = null;
}

export default function mountNavigate(window: Window): () => void {
  window.history.scrollRestoration = 'manual';
  currentPath = window.location.pathname + window.location.search;

  function handleClick(event: MouseEvent) {
    const anchor = findAnchor(event);
    if (!anchor) {
      return;
    }

    if (shouldIgnoreClick(event, anchor)) {
      return;
    }

    if (!isEligibleLink(anchor.href, window.location.origin)) {
      return;
    }

    // Same-page hash links: smooth scroll instead of letting the browser jump
    const url = new URL(anchor.href);
    if (
      url.pathname === window.location.pathname &&
      url.search === window.location.search
    ) {
      event.preventDefault();
      if (url.hash) {
        window.history.pushState(null, '', url.hash);
        const el = window.document.getElementById(url.hash.slice(1));
        if (el) {
          el.scrollIntoView({ behavior: 'smooth' });
        }
      }
      return;
    }

    event.preventDefault();

    // Clear search and close header immediately, before the fetch
    clearSearch();

    const details = window.document.querySelector(
      'header details',
    ) as HTMLDetailsElement | null;
    if (details?.open) {
      details.open = false;
    }

    // Save current scroll position and history index
    window.history.replaceState(
      {
        ...window.history.state,
        scrollY: window.scrollY,
        navIndex: historyIndex,
      },
      '',
    );

    const hash = url.hash ? url.hash.slice(1) : null;

    performNavigation(anchor.href, hash, 'forward', true);
  }

  function handlePopState(event: PopStateEvent) {
    const newPath = window.location.pathname + window.location.search;
    if (newPath === currentPath) {
      // Same page, different hash: scroll to the target
      const hash = window.location.hash.slice(1);
      if (hash) {
        const el = window.document.getElementById(hash);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth' });
        }
      } else {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
      return;
    }
    currentPath = newPath;

    const scrollY = event.state?.scrollY ?? null;
    const targetIndex = event.state?.navIndex ?? 0;
    const direction: Direction =
      targetIndex >= historyIndex ? 'forward' : 'back';
    historyIndex = targetIndex;
    performNavigation(
      window.location.href,
      typeof scrollY === 'number' ? scrollY : null,
      direction,
      false,
    );
  }

  // Use capture phase so the handler fires before stopPropagation
  // in the header component can block the event from reaching us
  window.document.addEventListener('click', handleClick, true);
  window.addEventListener('popstate', handlePopState);

  return () => {
    window.document.removeEventListener('click', handleClick, true);
    window.removeEventListener('popstate', handlePopState);
  };
}
