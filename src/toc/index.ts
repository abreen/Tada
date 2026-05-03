import { debounce } from '../util';
import {
  alertToTableItem,
  getHighlightIndexes,
  headingToTableItem,
  switchCurrent,
  type Dinkus,
} from './model';

const LATENCY_MS = 50;

function getContainer(parent: HTMLElement): HTMLElement | null {
  return parent.querySelector('nav.toc');
}

function getCurrentListItem(parent: HTMLElement): HTMLLIElement | null {
  return parent.querySelector('nav.toc .current');
}

function scrollIfNeeded(element: HTMLElement, doc: Document) {
  const container = getContainer(doc.body as HTMLElement);
  if (container == null) {
    return;
  }
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

function getHeadingsAndAlerts(
  parent: HTMLElement,
): (HTMLHeadingElement | HTMLDivElement)[] {
  return Array.from(
    parent.querySelectorAll(
      '.body h1, .body h2, .body h3, .body h4, .body h5, .body h6, .body > div.alert, .body section > div.alert',
    ),
  );
}

function getTocElements(
  parent: HTMLElement,
): (HTMLHeadingElement | HTMLDivElement | HTMLHRElement)[] {
  return Array.from(
    parent.querySelectorAll(
      '.body h1, .body h2, .body h3, .body h4, .body h5, .body h6, .body > div.alert, .body section > div.alert, .body > hr',
    ),
  );
}

/* Calculate how much to offset scroll calculations based on floating header */
function getHeaderOffset(doc: Document) {
  const element = doc.querySelector('header details summary');
  if (!element) {
    return 0;
  }

  return element.getBoundingClientRect().height;
}

function getViewportActivationPoint(win: Window, doc: Document) {
  const headerOffset = getHeaderOffset(doc);

  return headerOffset + (win.innerHeight - headerOffset) / 3;
}

export default (window: Window) => {
  const toc = window.document.querySelector('nav.toc') as HTMLElement;
  if (toc == null) {
    return;
  }

  const isCodePage = window.document.body.classList.contains('code');

  if (isCodePage) {
    const elements: HTMLAnchorElement[] = Array.from(
      toc.querySelectorAll('ol li a'),
    );
    if (elements.length === 0) {
      return;
    }

    const codeLines: number[] = elements.map(a => {
      const match = a.getAttribute('href')?.match(/^#L(\d+)$/);
      return match ? parseInt(match[1], 10) : 0;
    });

    const parseHash = (hash: string): number | null => {
      const single = hash.match(/^#L(\d+)$/);
      if (single) {
        return parseInt(single[1], 10);
      }
      const range = hash.match(/^#L(\d+)-L(\d+)$/);
      if (range) {
        return parseInt(range[1], 10);
      }
      return null;
    };

    const updateFromHash = () => {
      const line = parseHash(window.location.hash);
      const existingItem = getCurrentListItem(
        window.document.body as HTMLElement,
      );

      if (line == null) {
        if (existingItem) {
          existingItem.classList.remove('current');
        }
        return;
      }

      let best = 0;
      for (let i = 0; i < codeLines.length; i++) {
        if (codeLines[i] <= line) {
          best = i;
        } else {
          break;
        }
      }

      const nextItem = elements[best]?.parentElement ?? null;
      if (nextItem != null && nextItem !== existingItem) {
        switchCurrent(existingItem, nextItem);
        scrollIfNeeded(nextItem, window.document);
      }
    };

    window.addEventListener('hashchange', updateFromHash);
    updateFromHash();

    return () => {
      window.removeEventListener('hashchange', updateFromHash);
    };
  }

  // Regular page: TOC is already rendered in the DOM
  const elements: HTMLAnchorElement[] = Array.from(
    toc.querySelectorAll('ol li a'),
  );
  if (elements.length === 0) {
    return;
  }

  const headingsAndAlerts = getHeadingsAndAlerts(window.document.body);
  const items = getTocElements(window.document.body)
    .map(el => {
      const tag = el.tagName.toLowerCase();
      if (tag === 'hr') {
        return { type: 'dinkus' } as Dinkus;
      } else if (tag === 'div') {
        return alertToTableItem(el as HTMLElement);
      } else {
        return headingToTableItem(el as HTMLHeadingElement);
      }
    })
    .filter(obj => obj != null);

  const highlightIndexes = getHighlightIndexes(items);

  function handleScroll() {
    const viewportActivationPoint = getViewportActivationPoint(
      window,
      window.document,
    );

    let i = 0;
    for (let idx = 0; idx < headingsAndAlerts.length; idx++) {
      const top = headingsAndAlerts[idx].getBoundingClientRect().top;
      if (top <= viewportActivationPoint + 1) {
        i = idx;
      } else {
        break;
      }
    }

    const existingItem = getCurrentListItem(
      window.document.body as HTMLElement,
    );
    const highlightIndex = highlightIndexes[i];
    const nextItem =
      highlightIndex == null ? null : elements[highlightIndex]?.parentElement;

    if (nextItem != null && nextItem !== existingItem) {
      switchCurrent(existingItem, nextItem);
      scrollIfNeeded(nextItem, window.document);
    }
  }
  const debounced = debounce(window, handleScroll, LATENCY_MS);
  window.addEventListener('scroll', debounced, { passive: true });

  // Call after load to set current item
  handleScroll();

  return () => {
    window.removeEventListener('scroll', debounced);
  };
};
