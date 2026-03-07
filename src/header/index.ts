import { getElement, removeClass } from '../util';
import { set as globalSet, trigger } from '../global';

const DURATION_MS = 250;

// CSS properties we control via the style attribute
const CONTROLLED_PROPERTIES = ['height', 'overflow'];

function removeStyle(el: HTMLElement, propertyName: string) {
  el.style.removeProperty(propertyName);
  if (
    CONTROLLED_PROPERTIES.every(
      property => !el.style.getPropertyValue(property),
    )
  ) {
    el.removeAttribute('style');
  }
}

function getExpandedHeight(summary: HTMLElement, content: HTMLElement) {
  function elementHeight(el: HTMLElement) {
    const style = window.getComputedStyle(el);
    return (
      el.offsetHeight +
      parseFloat(style.marginTop) +
      parseFloat(style.marginBottom)
    );
  }

  let totalHeight = elementHeight(summary);

  for (const child of Array.from(content.children)) {
    totalHeight += elementHeight(child as HTMLElement);
  }

  return Math.ceil(totalHeight);
}

export default (window: Window) => {
  const header: HTMLElement = getElement(window.document, 'header');
  const details = getElement(header, 'details') as HTMLDetailsElement;
  const summary: HTMLElement = getElement(details, 'summary');
  const content: HTMLElement = getElement(details, '.content');

  let main: HTMLElement | null;
  try {
    main = getElement(window.document, 'main');
  } catch {
    // ignored
  }

  const isFrozen = header.classList.contains('is-frozen');

  if (isFrozen) {
    globalSet('headerIsOpen', true);
  }

  let isExpanding = false,
    isCollapsing = false,
    animation: Animation | null;

  function finish(isOpen: boolean) {
    details.open = isOpen;
    if (main) {
      main.inert = isOpen;
    }
    if (isOpen) {
      header.classList.add('is-open');
    } else {
      removeClass(header, 'is-open');
    }
    removeClass(header, 'is-expanding');
    removeClass(header, 'is-collapsing');
    removeStyle(details, 'height');
    removeStyle(details, 'overflow');
    isExpanding = false;
    isCollapsing = false;
    animation = null;

    globalSet('headerIsOpen', isOpen);
  }

  function collapse() {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      finish(false);
      return;
    }

    details.style.overflow = 'hidden';
    if (isCollapsing || isExpanding) {
      animation?.cancel();
    }

    isCollapsing = true;
    header.classList.add('is-collapsing');

    animation = details.animate(
      { height: [`${details.offsetHeight}px`, `${summary.offsetHeight}px`] },
      { duration: DURATION_MS, easing: 'ease' },
    );

    animation.onfinish = () => finish(false);
    animation.oncancel = () => {
      isCollapsing = false;
      removeClass(header, 'is-collapsing');
    };
  }

  function expand() {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      finish(true);
      return;
    }

    details.style.overflow = 'hidden';
    if (isCollapsing || isExpanding) {
      animation?.cancel();
    }

    isExpanding = true;
    header.classList.add('is-expanding');

    details.style.height = `${details.offsetHeight}px`;
    details.open = true;
    if (main) {
      main.inert = true;
    }

    const expandedHeight = getExpandedHeight(summary, content);

    animation = details.animate(
      { height: [`${details.offsetHeight}px`, `${expandedHeight}px`] },
      { duration: DURATION_MS, easing: 'ease' },
    );

    animation.onfinish = () => finish(true);
    animation.oncancel = () => {
      isExpanding = false;
      removeClass(header, 'is-expanding');
    };
  }

  function handleSummaryClick(e: MouseEvent) {
    if (window.IS_DEV) {
      console.log('header summary clicked');
    }

    if (isFrozen) {
      e.preventDefault();
      return;
    }

    if (isCollapsing || !details.open) {
      trigger('headerWillExpand');
      expand();
      e.preventDefault();
      e.stopPropagation();
    } else if (isExpanding || details.open) {
      collapse();
      e.preventDefault();
      e.stopPropagation();
    }
  }
  summary.addEventListener('click', handleSummaryClick);

  function handleDetailsClick(e: MouseEvent) {
    if (details.open && !isCollapsing) {
      if (window.IS_DEV) {
        console.log('stopped propagation for expanded header');
      }
      e.stopPropagation();
    }
  }
  details.addEventListener('click', handleDetailsClick);

  function handleWindowClick() {
    if (isFrozen) {
      return;
    }

    if (details.open && !isCollapsing) {
      if (window.IS_DEV) {
        console.info('collapsing header due to outside window click');
      }
      collapse();
    }
  }
  window.addEventListener('click', handleWindowClick);

  function handleWindowKeyDown(e: KeyboardEvent) {
    if (isFrozen) {
      return;
    }

    if (e.key === 'Escape' && details.open && !isCollapsing) {
      collapse();
    }
  }
  window.addEventListener('keydown', handleWindowKeyDown);

  return () => {
    window.removeEventListener('keydown', handleWindowKeyDown);
    window.removeEventListener('click', handleWindowClick);
    details.removeEventListener('click', handleDetailsClick);
    summary.removeEventListener('click', handleSummaryClick);
  };
};
