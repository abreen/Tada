import { debounce, removeClass } from '../util';

/** Show the "Back to top" button once the user is past this scroll position */
const SHOW_THRESHOLD_PX = 250;

/** Debounce time (maximum amount of time to wait before updates) */
const LATENCY_MS = 50;

export default (window: Window) => {
  const mountParent =
    (window.document.getElementById(
      'to-top-container',
    ) as HTMLElement | null) ?? document.body;

  function createLink(parent: HTMLElement): HTMLAnchorElement {
    const div = document.createElement('div');
    div.className = 'to-top';

    const link = window.document.createElement('a');
    link.href = '#';
    link.className = 'button';
    link.tabIndex = -1;
    link.innerText = 'Back to top';
    div.appendChild(link);

    parent.appendChild(div);

    return link;
  }

  const link = createLink(mountParent);

  let isShowing = false;

  link.onclick = e => {
    e.preventDefault();
    const cleanUrl = window.location.pathname + window.location.search;
    if (window.location.hash) {
      history.pushState(null, '', cleanUrl);
    } else {
      history.replaceState(null, '', cleanUrl);
    }
    window.scrollTo({ top: 0 });
    const toc = window.document.querySelector('nav.toc') as HTMLElement | null;
    if (toc) toc.scrollTop = 0;
  };

  function show(link: HTMLAnchorElement) {
    if (!isShowing) {
      link.classList.add('is-visible');
      link.tabIndex = 0;
    }
    isShowing = true;
  }

  function hide(link: HTMLAnchorElement) {
    if (isShowing) {
      removeClass(link, 'is-visible');
      link.tabIndex = -1;
    }
    isShowing = false;
  }

  function updateVisibility() {
    if (window.scrollY > SHOW_THRESHOLD_PX) {
      show(link);
    } else {
      hide(link);
    }
  }

  const debounced = debounce(updateVisibility, LATENCY_MS);
  window.addEventListener('scroll', debounced, { passive: true });
  updateVisibility();

  return () => {
    window.removeEventListener('scroll', debounced);
  };
};
