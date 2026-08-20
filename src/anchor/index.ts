function getElements(parent: HTMLElement): HTMLHeadingElement[] {
  return Array.from(parent.querySelectorAll('h1, h2, h3, h4, h5, h6'));
}

function createPresentIcon(window: Window): HTMLSpanElement {
  const icon = window.document.createElement('span');
  icon.className = 'material-symbol-icon material-symbol-icon-heading-present';
  icon.setAttribute('aria-hidden', 'true');
  return icon;
}

function getSlideIndex(slide: HTMLElement): number {
  const rawIndex = slide.getAttribute('data-slide-index');
  if (rawIndex != null) {
    const parsed = Number.parseInt(rawIndex, 10);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  const root = slide.closest('[data-slides-root]');
  if (!root) {
    return 0;
  }

  return Array.from(root.querySelectorAll('.slide')).indexOf(slide);
}

function isSlideTitleHeading(
  heading: HTMLHeadingElement,
): heading is HTMLHeadingElement & { parentElement: HTMLElement } {
  const slide = heading.parentElement;
  return (
    heading.tagName === 'H2' &&
    slide?.tagName === 'DIV' &&
    slide.classList.contains('slide') &&
    slide.firstElementChild === heading
  );
}

export default (window: Window) => {
  const view = window as Window & typeof globalThis;
  const elements = getElements(window.document.body);
  const cleanups: (() => void)[] = [];

  elements.forEach(el => {
    if (el.id) {
      const link = window.document.createElement('a');
      link.className = 'heading-anchor';
      link.href = `#${el.id}`;
      link.title = 'Link to this heading';

      // Move all existing child nodes into the link.
      while (el.firstChild) {
        link.appendChild(el.firstChild);
      }
      el.appendChild(link);

      const handleClick = () => {
        el.focus();
      };
      link.addEventListener('click', handleClick);
      cleanups.push(() => {
        link.removeEventListener('click', handleClick);
      });
    }

    if (!isSlideTitleHeading(el)) {
      return;
    }

    const button = window.document.createElement('button');
    button.type = 'button';
    button.className = 'heading-present-button';
    button.setAttribute('aria-label', 'Present from this slide');
    button.title = 'Present from this slide';
    button.appendChild(createPresentIcon(window));
    el.appendChild(button);

    const slide = el.parentElement;
    const slideIndex = getSlideIndex(slide);

    const handlePresentClick = () => {
      button.dispatchEvent(
        new view.CustomEvent('tada:slides-present', {
          bubbles: true,
          detail: { slideIndex },
        }),
      );
    };
    button.addEventListener('click', handlePresentClick);

    cleanups.push(() => {
      button.removeEventListener('click', handlePresentClick);
    });
  });

  return () => {
    for (const cleanup of cleanups) {
      cleanup();
    }
  };
};
