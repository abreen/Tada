import { getElement } from '../util';
import { globals } from '../globals';

export type HeaderTitleState = 'site' | 'page';

export interface HeadingGeometry {
  /** Bottom edge of the page heading block (breadcrumbs, h1, and info) */
  blockBottom: number;
  /** Top edge of the page's h1 */
  titleTop: number;
  /** Bottom edge of the collapsed header */
  headerBottom: number;
}

const HEADING_BLOCK_SELECTOR = '.title-and-info, .file-header';
const PAGE_TITLE_CLASS = 'is-page-title';

/**
 * Show the page title once the whole heading block has scrolled under the
 * header, and the site title once the h1 is entirely below the header again.
 * In between, keep the current title so it does not flicker.
 */
export function nextHeaderTitleState(
  current: HeaderTitleState,
  geometry: HeadingGeometry | null,
): HeaderTitleState {
  if (!geometry) {
    return 'site';
  }
  if (geometry.blockBottom <= geometry.headerBottom) {
    return 'page';
  }
  if (geometry.titleTop >= geometry.headerBottom) {
    return 'site';
  }
  return current;
}

function getHeadingElements(document: Document) {
  const block = document.querySelector(HEADING_BLOCK_SELECTOR);
  const title = block?.querySelector('h1');
  return block && title ? { block, title } : null;
}

interface TitleRoll {
  swap(newDoc: Document): void;
  disconnect(): void;
}

let titleRoll: TitleRoll | null = null;

function getTitleElements(summary: HTMLElement) {
  const container = summary.querySelector<HTMLElement>('.header-title');
  const reel = container?.querySelector<HTMLElement>('.header-title-reel');
  const pageTitle = reel?.querySelector<HTMLElement>('.header-page-title');
  return container && reel && pageTitle ? { container, reel, pageTitle } : null;
}

function mountTitleRoll(
  window: Window,
  summary: HTMLElement,
): TitleRoll | null {
  const elements = getTitleElements(summary);
  if (!elements) {
    return null;
  }
  const { container, reel, pageTitle } = elements;

  let state: HeaderTitleState = 'site';

  function measure(): HeadingGeometry | null {
    const heading = getHeadingElements(window.document);
    // A hidden heading (for example, while presenting slides) has no boxes
    if (!heading || heading.block.getClientRects().length === 0) {
      return null;
    }
    return {
      blockBottom: heading.block.getBoundingClientRect().bottom,
      titleTop: heading.title.getBoundingClientRect().top,
      headerBottom: summary.getBoundingClientRect().bottom,
    };
  }

  // Scrolling rolls the reel; other changes, like navigation, switch at once
  function update(roll: boolean) {
    const next = nextHeaderTitleState(state, measure());
    if (next !== state) {
      state = next;
      container.classList.toggle(PAGE_TITLE_CLASS, state === 'page');
    }
    if (!roll && typeof reel.getAnimations === 'function') {
      for (const animation of reel.getAnimations()) {
        animation.finish();
      }
    }
  }

  const observer = globals.createIntersectionObserver(() => update(true), {
    rootMargin: `${-summary.getBoundingClientRect().bottom}px 0px 0px 0px`,
    threshold: [0, 1],
  });

  function observeHeading() {
    observer.disconnect();
    const heading = getHeadingElements(window.document);
    if (heading) {
      observer.observe(heading.block);
      observer.observe(heading.title);
    }
  }

  update(false);
  observeHeading();

  return {
    swap(newDoc) {
      const newPageTitle = newDoc.querySelector('header .header-page-title');
      if (newPageTitle) {
        pageTitle.replaceChildren(
          ...window.document.importNode(newPageTitle, true).childNodes,
        );
      }
      observeHeading();
      update(false);
    },
    disconnect() {
      observer.disconnect();
    },
  };
}

/**
 * Called by the navigator once a new page's content and scroll position are in
 * place: adopt the new page title and show the title for the new position
 * without rolling, so the page transition crossfades it.
 */
export function swapHeaderTitle(newDoc: Document): void {
  titleRoll?.swap(newDoc);
}

export default (window: Window) => {
  const header: HTMLElement = getElement(window.document, 'header');
  const details = getElement(header, 'details') as HTMLDetailsElement;
  const summary = getElement(details, 'summary') as HTMLElement;

  titleRoll = mountTitleRoll(window, summary);

  function close() {
    details.open = false;
  }

  function handleDetailsClick(e: MouseEvent) {
    if (details.open) {
      e.stopPropagation();
    }
  }
  details.addEventListener('click', handleDetailsClick);

  function handleWindowClick() {
    if (details.open) {
      close();
    }
  }
  window.addEventListener('click', handleWindowClick);

  function handleWindowKeyDown(e: KeyboardEvent) {
    if (
      e.key === 'Escape' &&
      details.open &&
      details.contains(window.document.activeElement)
    ) {
      close();
      summary.focus();
    }
  }
  window.addEventListener('keydown', handleWindowKeyDown);

  function handleDetailsFocusOut(e: FocusEvent) {
    if (!details.open) {
      return;
    }
    const next = e.relatedTarget as Node | null;
    if (next && !details.contains(next)) {
      close();
    }
  }
  details.addEventListener('focusout', handleDetailsFocusOut);

  return () => {
    titleRoll?.disconnect();
    titleRoll = null;
    window.removeEventListener('keydown', handleWindowKeyDown);
    window.removeEventListener('click', handleWindowClick);
    details.removeEventListener('click', handleDetailsClick);
    details.removeEventListener('focusout', handleDetailsFocusOut);
  };
};
