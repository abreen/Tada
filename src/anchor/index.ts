function getElements(parent: HTMLElement): HTMLHeadingElement[] {
  return Array.from(parent.querySelectorAll('h1, h2, h3, h4, h5, h6'));
}

function createIcon(window: Window, type: 'hash' | 'present'): SVGSVGElement {
  const svg = window.document.createElementNS(
    'http://www.w3.org/2000/svg',
    'svg',
  );
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', '16');
  svg.setAttribute('height', '16');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.5');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');

  const paths =
    type === 'hash'
      ? ['M10 3 8 21', 'M16 3l-2 18', 'M4 9h17', 'M3 15h17']
      : [
          'M5 5h14a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z',
          'M9 20h6',
        ];

  for (const d of paths) {
    const path = window.document.createElementNS(
      'http://www.w3.org/2000/svg',
      'path',
    );
    path.setAttribute('d', d);
    svg.appendChild(path);
  }

  return svg;
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
      link.appendChild(createIcon(window, 'hash'));
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
    button.appendChild(createIcon(window, 'present'));
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
