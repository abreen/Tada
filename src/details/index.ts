/*
 * Closing a tall details element from its stuck summary collapses the body
 * above the summary, which would carry the summary off screen. Close it here
 * instead, then scroll the closed details to where fragment links land: below
 * the header, with the page's scroll padding above it.
 */

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
    const topBefore = summary.getBoundingClientRect().top;
    details.open = false;
    if (summary.getBoundingClientRect().top < topBefore) {
      details.scrollIntoView({ block: 'start', behavior: 'instant' });
    }
  }

  // On the window, so listeners on the document (such as in author scripts)
  // see the click first and can prevent it
  window.addEventListener('click', handleClick);

  return () => {
    window.removeEventListener('click', handleClick);
  };
};
