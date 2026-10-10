import { debounce } from '../util';
import { globals } from '../globals';
import { getHashTarget } from '../hash-target';
import {
  findCodeEntry,
  findScrollEntry,
  parseLineHash,
  switchCurrent,
} from './model';

const LATENCY_MS = 50;

function scrollIfNeeded(element: HTMLElement, container: HTMLElement) {
  const containerHasScrollbar = container.scrollHeight > container.clientHeight;
  if (!containerHasScrollbar) {
    return;
  }

  // Calculate element center relative to container's scroll space
  const elementRect = element.getBoundingClientRect();
  const containerRect = container.getBoundingClientRect();
  const elementCenter =
    elementRect.top -
    containerRect.top +
    container.scrollTop +
    elementRect.height / 2;
  const desiredScrollTop = elementCenter - container.clientHeight / 2;

  container.scrollTo({ top: desiredScrollTop });
}

// Input that can scroll the page or change the current item
const USER_INPUT_EVENTS = ['keydown', 'pointerdown', 'touchstart', 'wheel'];

// Where src/toc/_index.scss displays the highlight
const HIGHLIGHT_MEDIA = 'screen and (width >= 900px)';

/* Move the highlight behind a link. The highlight sits just before the list,
 * which has no margin, so its static position is the list's top-left corner and
 * it moves with the list (such as when the TOC scrolls) on its own. */
function positionHighlight(
  highlight: HTMLElement,
  list: HTMLElement,
  link: HTMLElement,
  animate: boolean,
) {
  const listRect = list.getBoundingClientRect();
  const linkRect = link.getBoundingClientRect();
  const x = linkRect.left - listRect.left;
  const y = linkRect.top - listRect.top;

  if (!animate) {
    highlight.style.transition = 'none';
  }
  highlight.style.transform = `translate(${x}px, ${y}px)`;
  highlight.style.width = `${linkRect.width}px`;
  highlight.style.height = `${linkRect.height}px`;
  highlight.hidden = false;
  if (!animate) {
    // Commit the new position before transitions are re-enabled
    void highlight.offsetWidth;
    highlight.style.transition = '';
  }
}

function mountHighlight(window: Window, list: HTMLElement) {
  const highlight = window.document.createElement('span');
  highlight.className = 'toc-highlight';
  highlight.setAttribute('aria-hidden', 'true');
  highlight.hidden = true;
  list.before(highlight);

  const media = window.matchMedia(HIGHLIGHT_MEDIA);
  let link: HTMLElement | null = null;

  // Only animate motion the user caused, not scrolling by the browser (such
  // as to a fragment or a restored position) or by scripts after page load
  let hadUserInput = false;
  const onUserInput = () => {
    hadUserInput = true;
  };
  for (const type of USER_INPUT_EVENTS) {
    window.addEventListener(type, onUserInput, {
      capture: true,
      passive: true,
    });
  }

  // Hidden where it is not displayed, so narrow screens skip measuring links
  const render = (animate: boolean) => {
    if (link == null || !media.matches) {
      highlight.hidden = true;
      return;
    }
    // The highlight appears in place instead of moving from a stale position
    positionHighlight(
      highlight,
      list,
      link,
      animate && hadUserInput && !highlight.hidden,
    );
  };

  // Layout changes, such as fonts loading, move links within the list
  const relayout = () => render(false);
  media.addEventListener('change', relayout);
  const resizeObserver = globals.createResizeObserver(relayout);
  resizeObserver.observe(list);

  return {
    moveTo(nextLink: HTMLElement | null) {
      link = nextLink;
      render(true);
    },
    unmount() {
      for (const type of USER_INPUT_EVENTS) {
        window.removeEventListener(type, onUserInput, { capture: true });
      }
      media.removeEventListener('change', relayout);
      resizeObserver.disconnect();
      highlight.remove();
    },
  };
}

/* Where the browser puts a TOC link's target when scrolling to it, such as
 * after the link is clicked */
function getRestingTop(window: Window) {
  const scrollPaddingTop = parseFloat(
    window.getComputedStyle(window.document.documentElement).scrollPaddingTop,
  );

  return Number.isNaN(scrollPaddingTop) ? 0 : scrollPaddingTop;
}

function trackHash(
  window: Window,
  links: HTMLAnchorElement[],
  setCurrent: (index: number | null) => void,
) {
  const entryLines = links.map(link =>
    parseLineHash(link.getAttribute('href') ?? ''),
  );

  const updateFromHash = () => {
    const line = parseLineHash(window.location.hash);
    setCurrent(line == null ? null : findCodeEntry(entryLines, line));
  };

  window.addEventListener('hashchange', updateFromHash);
  updateFromHash();

  return () => {
    window.removeEventListener('hashchange', updateFromHash);
  };
}

function trackScroll(
  window: Window,
  links: HTMLAnchorElement[],
  setCurrent: (index: number | null) => void,
) {
  const document = window.document;
  const targets = links.map(link =>
    getHashTarget(document, link.getAttribute('href') ?? ''),
  );

  function handleScroll() {
    const root = document.documentElement;
    const maxScrollY = root.scrollHeight - root.clientHeight;
    const hashTarget = targets.indexOf(
      getHashTarget(document, window.location.hash),
    );

    setCurrent(
      findScrollEntry({
        // A link without a target is never reached
        targetTops: targets.map(
          target => target?.getBoundingClientRect().top ?? Infinity,
        ),
        restingTop: getRestingTop(window),
        viewportHeight: root.clientHeight,
        atTop: window.scrollY <= 0,
        atBottom: window.scrollY >= maxScrollY - 1,
        hashTarget: hashTarget === -1 ? null : hashTarget,
      }),
    );
  }
  const debounced = debounce(window, handleScroll, LATENCY_MS);
  window.addEventListener('scroll', debounced, { passive: true });
  // Clicking a link near the bottom of the page may not scroll it
  window.addEventListener('hashchange', handleScroll);

  // Call after load to set current item
  handleScroll();

  return () => {
    window.removeEventListener('scroll', debounced);
    window.removeEventListener('hashchange', handleScroll);
    debounced.cancel();
  };
}

export default (window: Window) => {
  const toc = window.document.querySelector<HTMLElement>('nav.toc');
  const list = toc?.querySelector<HTMLElement>(':scope > ol');
  if (toc == null || list == null) {
    return;
  }

  // Regular and code pages: TOC is already rendered in the DOM
  const links: HTMLAnchorElement[] = Array.from(list.querySelectorAll('li a'));
  if (links.length === 0) {
    return;
  }

  const highlight = mountHighlight(window, list);

  let current: HTMLAnchorElement | null = null;
  const setCurrent = (index: number | null) => {
    const next = index == null ? null : links[index];
    if (next === current) {
      return;
    }
    switchCurrent(current?.parentElement ?? null, next?.parentElement ?? null);
    current = next;
    if (next?.parentElement != null) {
      scrollIfNeeded(next.parentElement, toc);
    }
    highlight.moveTo(next);
  };

  const isCodePage = window.document.body.classList.contains('code');
  const stopTracking = isCodePage
    ? trackHash(window, links, setCurrent)
    : trackScroll(window, links, setCurrent);

  return () => {
    stopTracking();
    highlight.unmount();
  };
};
