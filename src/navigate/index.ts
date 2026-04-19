import { isEligibleLink } from './eligible';
import {
  clearSearch,
  closeHeaderDetails,
  getCurrentPath,
  getHistoryIndex,
  getSavedScroll,
  initNavigation,
  navigateToUrl,
  saveScrollPosition,
  setCurrentPath,
  setHistoryIndex,
} from './runtime';

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

export default function mountNavigate(window: Window): () => void {
  initNavigation(window);

  // Track scroll position on every scroll event. We keep the latest
  // scrollY per navIndex so that back/forward navigation can restore
  // where the user was, not just scroll 0. Map writes are cheap; no
  // need to debounce.
  const saveScroll = () => {
    saveScrollPosition(window);
  };
  window.addEventListener('scroll', saveScroll, { passive: true });

  function handleClick(event: MouseEvent) {
    const anchor = findAnchor(event);
    if (!anchor) {
      return;
    }

    if (shouldIgnoreClick(event, anchor)) {
      return;
    }

    if (
      !isEligibleLink(anchor.href, window.location.origin, __SITE_BASE_PATH__)
    ) {
      return;
    }

    // Same-page hash links: handle locally so we can clear search and
    // close the header without a full SPA fetch.
    const url = new URL(anchor.href);
    if (
      url.pathname === window.location.pathname &&
      url.search === window.location.search
    ) {
      event.preventDefault();
      clearSearch(window.document);
      closeHeaderDetails(window.document);
      if (url.hash) {
        // location.hash assignment performs a real fragment navigation:
        // updates :target, fires hashchange (which the TOC listens for),
        // creates a new history entry, and scrolls to the element.
        // pushState would do none of those things.
        window.location.hash = url.hash.slice(1);
      }
      return;
    }

    event.preventDefault();

    // Clear search and close header immediately, before the fetch
    clearSearch(window.document);
    closeHeaderDetails(window.document);

    // Save current scroll position for the entry we're leaving
    saveScrollPosition(window);

    const hash = url.hash ? url.hash.slice(1) : null;

    navigateToUrl(window, {
      url: anchor.href,
      scrollTarget: hash,
      direction: 'forward',
      pushHistory: true,
    });
  }

  function handlePopState(event: PopStateEvent) {
    const newPath = window.location.pathname + window.location.search;
    if (newPath === getCurrentPath()) {
      // Same page, different hash: scroll to the target
      const hash = window.location.hash.slice(1);
      if (hash) {
        const el = window.document.getElementById(hash);
        if (el) {
          el.scrollIntoView();
        }
      } else {
        window.scrollTo({ top: 0 });
      }
      return;
    }

    setCurrentPath(newPath);
    const targetIndex = event.state?.navIndex ?? 0;
    const direction = targetIndex >= getHistoryIndex() ? 'forward' : 'back';
    setHistoryIndex(targetIndex);
    const savedY = getSavedScroll(targetIndex);
    navigateToUrl(window, {
      url: window.location.href,
      scrollTarget: typeof savedY === 'number' ? savedY : null,
      direction,
      pushHistory: false,
    });
  }

  // Use capture phase so the handler fires before stopPropagation
  // in the header component can block the event from reaching us
  window.document.addEventListener('click', handleClick, true);
  window.addEventListener('popstate', handlePopState);

  return () => {
    window.document.removeEventListener('click', handleClick, true);
    window.removeEventListener('popstate', handlePopState);
    window.removeEventListener('scroll', saveScroll);
  };
}
