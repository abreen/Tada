/*
 * Keeps the current page's entry centered in a document index that scrolls.
 * Where supported, CSS starts the index there (scroll-initial-target), but a
 * resize that shrinks the index, such as a shorter viewport, would otherwise
 * leave the entry wherever it was, or out of view.
 */

import { globals } from '../globals';
import { centerInScrollContainer } from '../util';

export default (window: Window) => {
  const list = window.document.querySelector<HTMLElement>(
    'nav.document-index > ol',
  );
  const current = list?.querySelector<HTMLElement>('a[aria-current="page"]');
  if (list == null || current == null) {
    return;
  }

  // Only a change in height moves the entry out of the middle. Other resizes,
  // such as a wider viewport, keep where the reader scrolled the index. The
  // first call, when observing starts, centers the entry in browsers without
  // scroll-initial-target.
  let height: number | null = null;
  const resizeObserver = globals.createResizeObserver(() => {
    if (list.clientHeight !== height) {
      height = list.clientHeight;
      centerInScrollContainer(current, list);
    }
  });
  resizeObserver.observe(list);

  return () => {
    resizeObserver.disconnect();
  };
};
