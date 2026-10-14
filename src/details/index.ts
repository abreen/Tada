/*
 * Closing a tall details element from its stuck summary collapses the body
 * above the summary, which would carry the summary off screen. Close it here
 * instead, then scroll the closed details to where fragment links land: below
 * the header, with the page's scroll padding above it. A preview (a details
 * element the build gave a Show more/Show less summary below its body)
 * instead stays put while its top is in view, as it does when it opens, and
 * otherwise scrolls so its summary stays where it was clicked.
 */

import { PREVIEW_CLASS } from './preview-class';

// Interactive content, which handles its own clicks in a summary instead of
// toggling the details element
const INTERACTIVE = [
  'a[href]',
  'audio[controls]',
  'button',
  'details',
  'embed',
  'iframe',
  'img[usemap]',
  'input:not([type="hidden"])',
  'label',
  'select',
  'textarea',
  'video[controls]',
].join(', ');

// The top of the label a preview's summary shows (Show more or Show less)
function previewButtonTop(summary: Element) {
  for (const label of summary.children) {
    const box = label.getBoundingClientRect();
    if (box.height > 0) {
      return box.top;
    }
  }
  return summary.getBoundingClientRect().top;
}

// Where fragment links land: below the header, with the page's scroll padding
function restingTop(window: Window) {
  const scrollPaddingTop = parseFloat(
    window.getComputedStyle(window.document.documentElement).scrollPaddingTop,
  );
  return Number.isNaN(scrollPaddingTop) ? 0 : scrollPaddingTop;
}

export default (window: Window) => {
  function handleClick(event: MouseEvent) {
    if (event.defaultPrevented) {
      return;
    }

    const target = event.target as Element | null;
    const summary = target?.closest('summary');
    if (!summary) {
      return;
    }

    const interactive = target?.closest(INTERACTIVE);
    if (interactive && summary.contains(interactive)) {
      return;
    }

    const details = summary.parentElement as HTMLDetailsElement | null;
    if (
      details?.localName !== 'details' ||
      !details.open ||
      details.querySelector(':scope > summary') !== summary ||
      !details.closest('main')
    ) {
      return;
    }

    event.preventDefault();
    const isPreview = details.classList.contains(PREVIEW_CLASS);
    // A preview's summary changes shape when it closes, so follow its button
    const anchor = () =>
      isPreview
        ? previewButtonTop(summary)
        : summary.getBoundingClientRect().top;
    // Whether the top of the box is in view, where opening the preview left it
    const topInView =
      details.getBoundingClientRect().top >= restingTop(window) - 0.5;
    const topBefore = anchor();
    details.open = false;
    const moved = anchor() - topBefore;
    if (isPreview) {
      // A preview's summary sits below its body, so once the top of the box
      // has scrolled away, keep the summary under the pointer. With the top in
      // view, leave the box where it is, as opening it did.
      if (!topInView && moved !== 0) {
        window.scrollBy({ top: moved, behavior: 'instant' });
      }
    } else if (moved < 0) {
      details.scrollIntoView({ block: 'start', behavior: 'instant' });
    }
  }

  // A closed preview's body can be focused from the keyboard, even where it
  // is clipped, so open the preview (and any closed previews around it) to
  // show what has focus. Pointer focus is on something already in view.
  function handleFocusIn(event: FocusEvent) {
    let element = event.target as Element | null;
    if (!element?.matches(':focus-visible')) {
      return;
    }
    while (element) {
      const details: HTMLDetailsElement | null | undefined = element.closest?.(
        `details.${PREVIEW_CLASS}`,
      );
      if (!details) {
        return;
      }
      if (
        !details.open &&
        !details.querySelector(':scope > summary')?.contains(element)
      ) {
        details.open = true;
      }
      element = details.parentElement;
    }
  }

  // On the window, so listeners on the document (such as in author scripts)
  // see the click first and can prevent it
  window.addEventListener('click', handleClick);
  window.addEventListener('focusin', handleFocusIn);

  return () => {
    window.removeEventListener('click', handleClick);
    window.removeEventListener('focusin', handleFocusIn);
  };
};
