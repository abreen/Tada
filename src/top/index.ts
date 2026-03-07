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
    link.href = '#top';
    link.className = 'button';
    link.innerText = 'Back to top';
    div.appendChild(link);

    parent.appendChild(div);

    return link;
  }

  if (window.document.body.classList.contains('header-is-frozen')) {
    return () => {};
  }

  const link = createLink(mountParent);

  let isShowing = false;

  link.onclick = e => {
    e.preventDefault();
    window.location.hash = 'top';
    history.replaceState(
      null,
      '',
      window.location.pathname + window.location.search,
    );
    const toc = window.document.querySelector('nav.toc') as HTMLElement | null;
    if (toc) toc.scrollTop = 0;
  };

  function show(link: HTMLAnchorElement) {
    if (!isShowing) {
      link.classList.add('is-visible');
    }
    isShowing = true;
  }

  function hide(link: HTMLAnchorElement) {
    if (isShowing) {
      removeClass(link, 'is-visible');
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
