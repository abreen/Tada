import { isEligibleLink } from './eligible';
import {
  applyFragmentTarget,
  clearSearch,
  closeHeaderDetails,
  getCurrentPath,
  getSavedLocationScroll,
  getHistoryIndex,
  getSavedScroll,
  initNavigation,
  isApplyingFragment,
  navigateToUrl,
  saveScrollPosition,
  setCurrentPath,
  setHistoryIndex,
} from './runtime';
import { globals } from '../globals';
import { getHashTarget } from '../hash-target';

function findAnchor(event: MouseEvent): HTMLAnchorElement | null {
  const target = event.target as HTMLElement | null;
  return target?.closest('a[href]') ?? null;
}

function shouldIgnoreClick(
  event: MouseEvent,
  anchor: HTMLAnchorElement,
): boolean {
  if (
    event.button !== 0 ||
    event.ctrlKey ||
    event.metaKey ||
    event.shiftKey ||
    event.altKey
  ) {
    return true;
  }

  if (anchor.hasAttribute('target') || anchor.hasAttribute('download')) {
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
  let clearingFragment = false;

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

    // Same-page links: handle locally so we can clear search and
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
        if (url.hash === window.location.hash) {
          getHashTarget(window.document, url.hash)?.scrollIntoView();
        } else {
          globals.setLocationHash(window, url.hash);
        }
      } else {
        saveScrollPosition(window);
        if (window.location.hash) {
          const state = window.history.state;
          // WebKit fires popstate synchronously while clearing the fragment.
          // Ignore that internal navigation so it cannot restore the previous
          // fragment-free entry's saved scroll position.
          clearingFragment = true;
          globals.setLocationHash(window, '');
          // Native fragment clearing leaves a trailing #. Keep the authored
          // URL and the current SPA history state on the new entry.
          window.history.replaceState(state, '', url.href);
        }
        window.scrollTo({ top: 0 });
        saveScrollPosition(window);
      }
      return;
    }

    if (!anchor.hasAttribute('data-tada-page')) {
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
    if (isApplyingFragment()) {
      return;
    }

    if (clearingFragment) {
      clearingFragment = false;
      if (!window.location.hash) {
        return;
      }
    }

    const newPath = window.location.pathname + window.location.search;
    if (newPath === getCurrentPath()) {
      const locationKey = newPath + window.location.hash;
      const savedY = getSavedLocationScroll(locationKey);
      // Fragment traversal can update :target and apply its native target
      // scroll after popstate. Correct both in the next task so the URL and our
      // saved position win. Capture savedY now because the native scroll event
      // can update the location map first.
      window.setTimeout(() => {
        const currentLocationKey =
          window.location.pathname +
          window.location.search +
          window.location.hash;
        if (currentLocationKey !== locationKey) {
          return;
        }
        applyFragmentTarget(window);
        if (typeof savedY === 'number') {
          window.scrollTo({ top: savedY });
        }
      }, 0);
      if (typeof savedY === 'number') {
        return;
      }

      // Same page, different hash: fall back to the fragment target
      if (window.location.hash) {
        getHashTarget(window.document, window.location.hash)?.scrollIntoView();
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
