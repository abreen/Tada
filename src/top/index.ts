import { debounce, removeClass } from '../util';
import { globals } from '../globals';

/** Only show the "Back to top" button on pages at least this many viewports tall */
const MIN_PAGE_SCREENS = 3;

/** Show the button once the user is this many viewports down the page... */
const SHOW_AFTER_SCREENS = 1.5;

/** ...or this fraction of the scrollable distance, whichever is farther */
const SHOW_AFTER_FRACTION = 0.25;

/** Debounce time (maximum amount of time to wait before updates) */
const LATENCY_MS = 50;

export default (window: Window) => {
  const mountParent =
    (window.document.getElementById(
      'to-top-container',
    ) as HTMLElement | null) ?? window.document.body;

  function createLink(parent: HTMLElement): HTMLAnchorElement {
    const link = window.document.createElement('a');
    link.href = '#';
    link.className = 'button';
    link.tabIndex = -1;
    link.innerText = 'Back to top';
    parent.appendChild(link);
    return link;
  }

  const link = createLink(mountParent);

  let isShowing = false;

  link.onclick = e => {
    e.preventDefault();
    const cleanUrl = window.location.pathname + window.location.search;
    const historyState = window.history.state;
    if (window.location.hash) {
      globals.setLocationHash(window, '');
      window.history.replaceState(historyState, '', cleanUrl);
    } else {
      window.history.replaceState(historyState, '', cleanUrl);
    }
    window.scrollTo({ top: 0 });
    const toc = window.document.querySelector('nav.toc') as HTMLElement | null;
    if (toc) {
      toc.scrollTop = 0;
    }
  };

  function show(link: HTMLAnchorElement) {
    if (!isShowing) {
      link.classList.add('is-visible');
      link.tabIndex = 0;
    }
    isShowing = true;
  }

  function hide(link: HTMLAnchorElement) {
    if (isShowing) {
      removeClass(link, 'is-visible');
      link.tabIndex = -1;
    }
    isShowing = false;
  }

  function shouldShow(): boolean {
    const viewportHeight = window.innerHeight;
    const maxScroll =
      window.document.documentElement.scrollHeight - viewportHeight;
    if (maxScroll < (MIN_PAGE_SCREENS - 1) * viewportHeight) {
      return false;
    }
    const threshold = Math.max(
      SHOW_AFTER_SCREENS * viewportHeight,
      SHOW_AFTER_FRACTION * maxScroll,
    );
    return window.scrollY > threshold;
  }

  function updateVisibility() {
    if (shouldShow()) {
      show(link);
    } else {
      hide(link);
    }
  }

  const debounced = debounce(window, updateVisibility, LATENCY_MS);
  window.addEventListener('scroll', debounced, { passive: true });
  window.addEventListener('resize', debounced, { passive: true });
  updateVisibility();

  return () => {
    window.removeEventListener('scroll', debounced);
    window.removeEventListener('resize', debounced);
  };
};
