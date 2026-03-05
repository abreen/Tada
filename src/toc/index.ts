import { debounce } from '../util';

const LATENCY_MS = 50;

type HeadingLevel = '1' | '2' | '3' | '4' | '5' | '6';
type AlertType = 'warning' | 'note';

type Alert = { type: AlertType; title: string };
type Heading = { level: HeadingLevel; innerHtml: string; id: string };
type Dinkus = { type: 'dinkus' };

function getContainer(parent: HTMLElement): HTMLElement | null {
  return parent.querySelector('nav.toc');
}

function getCurrentListItem(parent: HTMLElement): HTMLLIElement | null {
  return parent.querySelector('nav.toc .current');
}

function scrollIfNeeded(element: HTMLElement) {
  const container = getContainer(document.body);
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

  container.scrollTop = desiredScrollTop;
}

function getHighlightIndexes(items: (Heading | Alert | Dinkus)[]) {
  const indexes: (number | null)[] = [];
  let currentHeadingIndex: number | null = null;
  let tocIndex = 0;

  items.forEach(item => {
    if (!('level' in item) && item.type === 'dinkus') {
      return;
    }

    if ('level' in item) {
      currentHeadingIndex = tocIndex;
    }

    indexes.push(currentHeadingIndex ?? tocIndex);
    tocIndex++;
  });

  return indexes;
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
function getHeaderOffset() {
  const element = document.querySelector('header details summary');
  if (!element) {
    return 0;
  }

  return element.getBoundingClientRect().height;
}

function getViewportActivationPoint() {
  const headerOffset = getHeaderOffset();

  return headerOffset + (window.innerHeight - headerOffset) / 3;
}

function headingToTableItem(el: HTMLHeadingElement): Heading {
  const level = el.tagName[1] as HeadingLevel;

  const subtitle = el.querySelector('.heading-subtitle');
  const subtitleText = subtitle?.textContent || '';
  let mainText = el.textContent || '';

  if (mainText.length > 0 && subtitleText.length > 0) {
    mainText = mainText.replace(subtitleText, '').trim();
    return {
      level,
      id: el.id,
      innerHtml: `${mainText}: <span class="heading-subtitle">${subtitleText}</span>`,
    };
  }
  return { level, id: el.id, innerHtml: el.innerHTML };
}

function alertToTableItem(el: HTMLElement): Alert | null {
  const classes = el.className
    .split(' ')
    .map(cl => cl.trim())
    .filter(cl => cl != 'alert');

  const firstClass = classes[0];
  if (firstClass === 'warning' || firstClass === 'note') {
    let title = el.querySelector('.title')?.innerHTML;
    if (!title) {
      if (firstClass === 'warning') {
        title = 'Warning';
      } else {
        title = 'Note';
      }
    }

    return { type: firstClass, title };
  }

  return null;
}

function switchCurrent(
  oldCurrent: HTMLElement | null,
  newCurrent: HTMLElement,
) {
  if (oldCurrent) {
    oldCurrent.classList.remove('current');
  }
  newCurrent.classList.add('current');
}

function parseCodeHashLine(hash: string): number | null {
  const method = hash.match(/^#m(\d+)$/);
  if (method) {
    return parseInt(method[1], 10);
  }

  const single = hash.match(/^#L(\d+)$/);
  if (single) {
    return parseInt(single[1], 10);
  }

  const range = hash.match(/^#L(\d+)-L(\d+)$/);
  if (range) {
    return parseInt(range[1], 10);
  }

  return null;
}

function getCodeLineScrollOffset(): number {
  const value = window.getComputedStyle(
    document.documentElement,
  ).scrollPaddingTop;
  const parsed = parseFloat(value);
  if (Number.isFinite(parsed)) {
    return parsed;
  }
  return getHeaderOffset();
}

function wireAlertClickHandlers(
  toc: HTMLElement,
  headingsAndAlerts: (HTMLHeadingElement | HTMLDivElement)[],
  items: (Heading | Alert | Dinkus)[],
) {
  const alertLinks = toc.querySelectorAll('li.alert-item a');
  let alertIdx = 0;
  let scrollIdx = 0;

  items.forEach(item => {
    if (!('level' in item) && (item as Alert | Dinkus).type === 'dinkus') {
      return;
    }

    if (!('level' in item)) {
      // This is an alert item
      const scrollEl = headingsAndAlerts[scrollIdx];
      const link = alertLinks[alertIdx] as HTMLAnchorElement | undefined;
      if (link && scrollEl) {
        link.onclick = (e: MouseEvent) => {
          e.preventDefault();

          const titleElement = scrollEl.querySelector('.title');
          const titleId = titleElement?.id || null;

          if (titleId) {
            history.replaceState(
              null,
              document.title,
              `${window.location.pathname}#${titleId}`,
            );
          }

          scrollEl.scrollIntoView();
          scrollEl.focus();
        };
      }
      alertIdx++;
    }

    scrollIdx++;
  });
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

    // Extract line numbers from href="#L{n}" attributes
    const codeLines: number[] = elements.map(a => {
      const match = a.getAttribute('href')?.match(/^#L(\d+)$/);
      return match ? parseInt(match[1], 10) : 0;
    });

    const setCurrentByIndex = (index: number) => {
      const clamped = Math.max(0, Math.min(index, elements.length - 1));
      const existingItem = getCurrentListItem(document.body);
      const nextItem = elements[clamped]?.parentElement;

      if (nextItem != null && nextItem !== existingItem) {
        switchCurrent(existingItem, nextItem);
        scrollIfNeeded(nextItem);
      }
    };

    const getHashIndex = (): number | null => {
      const line = parseCodeHashLine(window.location.hash);
      if (line == null) {
        return null;
      }

      let current = 0;
      for (let i = 0; i < codeLines.length; i++) {
        if (codeLines[i] <= line) {
          current = i;
        } else {
          break;
        }
      }

      return current;
    };

    const updateCurrentFromHash = () => {
      setCurrentByIndex(getHashIndex() ?? 0);
    };

    const updateCurrentFromScroll = () => {
      let current = 0;

      for (let i = 0; i < codeLines.length; i++) {
        const lineAnchor = window.document.getElementById(`L${codeLines[i]}`);
        if (!lineAnchor) {
          continue;
        }

        const scrollOffset = getCodeLineScrollOffset();
        const anchorTop = lineAnchor.getBoundingClientRect().top;
        if (anchorTop <= scrollOffset + 1) {
          current = i;
        } else {
          break;
        }
      }

      setCurrentByIndex(current);
    };

    const debouncedCodeScroll = debounce(updateCurrentFromScroll, LATENCY_MS);

    window.addEventListener('hashchange', updateCurrentFromHash);
    window.addEventListener('scroll', debouncedCodeScroll, { passive: true });

    updateCurrentFromHash();

    return () => {
      window.removeEventListener('hashchange', updateCurrentFromHash);
      window.removeEventListener('scroll', debouncedCodeScroll);
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

  // Wire up click handlers for alert items
  wireAlertClickHandlers(toc, headingsAndAlerts, items);

  function handleScroll() {
    const viewportActivationPoint = getViewportActivationPoint();

    let i = 0;
    for (let idx = 0; idx < headingsAndAlerts.length; idx++) {
      const top = headingsAndAlerts[idx].getBoundingClientRect().top;
      if (top <= viewportActivationPoint + 1) {
        i = idx;
      } else {
        break;
      }
    }

    const existingItem = getCurrentListItem(document.body);
    const highlightIndex = highlightIndexes[i];
    const nextItem =
      highlightIndex == null ? null : elements[highlightIndex]?.parentElement;

    if (nextItem != null && nextItem !== existingItem) {
      switchCurrent(existingItem, nextItem);
      scrollIfNeeded(nextItem);
    }
  }
  const debounced = debounce(handleScroll, LATENCY_MS);
  window.addEventListener('scroll', debounced, { passive: true });

  // Call after load to set current item
  handleScroll();

  return () => {
    window.removeEventListener('scroll', debounced);
  };
};
