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

  function createButton(parent: HTMLElement): HTMLButtonElement {
    const div = document.createElement('div');
    div.className = 'to-top';

    const button = window.document.createElement('button');
    button.innerText = 'Back to top';
    div.appendChild(button);

    parent.appendChild(div);

    return button;
  }

  if (window.document.body.classList.contains('header-is-frozen')) {
    return () => {};
  }

  const button = createButton(mountParent);

  let isShowing = false;

  button.onclick = () => {
    window.scroll({ top: 0 });
    if (window.location.hash) {
      history.pushState(
        null,
        '',
        window.location.pathname + window.location.search,
      );
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    }
    const toc = window.document.querySelector('nav.toc') as HTMLElement | null;
    if (toc) toc.scrollTop = 0;
  };

  function show(button: HTMLButtonElement) {
    if (!isShowing) {
      button.classList.add('is-visible');
    }
    isShowing = true;
  }

  function hide(button: HTMLButtonElement) {
    if (isShowing) {
      removeClass(button, 'is-visible');
    }
    isShowing = false;
  }

  function updateVisibility() {
    if (window.scrollY > SHOW_THRESHOLD_PX) {
      show(button);
    } else {
      hide(button);
    }
  }

  const debounced = debounce(updateVisibility, LATENCY_MS);
  window.addEventListener('scroll', debounced, { passive: true });
  updateVisibility();

  return () => {
    window.removeEventListener('scroll', debounced);
  };
};
