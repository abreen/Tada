import { globals } from '../globals';
import { getHashTarget } from '../hash-target';
import { isScrollRestored } from '../navigate/restored-scroll';
import { prefersReducedMotion } from '../util';

/** Dispatched (bubbling) on an element to select every tab containing it */
export const TABS_REVEAL_EVENT = 'tada:tabs-reveal';

/** Tab panels containing the element, innermost first */
export function panelsAround(element: Element): HTMLElement[] {
  const panels: HTMLElement[] = [];
  let panel = element.closest<HTMLElement>('.tabs-panel');
  while (panel) {
    panels.push(panel);
    panel = panel.parentElement?.closest<HTMLElement>('.tabs-panel') ?? null;
  }
  return panels;
}

/** Selects every tab containing the element */
export function revealInTabs(window: Window, element: Element): void {
  const view = window as Window & typeof globalThis;
  element.dispatchEvent(new view.Event(TABS_REVEAL_EVENT, { bubbles: true }));
}

// Inactive panels stay searchable: find-in-page reveals them via beforematch.
// Browsers without support treat the value as plain `hidden`.
const HIDDEN = 'until-found';

// Matches the indicator's transition in _index.scss
const TRANSITION_TIMING: KeyframeAnimationOptions = {
  duration: 200,
  easing: 'cubic-bezier(0.2, 0, 0, 1)',
};

/** Moves the indicator under the tab, sliding unless animate is false */
function positionIndicator(
  indicator: HTMLElement,
  list: HTMLElement,
  tab: HTMLElement,
  animate: boolean,
) {
  const listRect = list.getBoundingClientRect();
  const tabRect = tab.getBoundingClientRect();
  // The indicator scrolls with the tabs in a long list
  const x = tabRect.left - listRect.left - list.clientLeft + list.scrollLeft;

  if (!animate) {
    indicator.style.transition = 'none';
  }
  indicator.style.transform = `translateX(${x}px)`;
  indicator.style.width = `${tabRect.width}px`;
  indicator.hidden = false;
  if (!animate) {
    // Commit the new position before transitions are re-enabled
    void indicator.offsetWidth;
    indicator.style.transition = '';
  }
}

export default (window: Window) => {
  const document = window.document;
  // Selects the tab that owns a panel
  const revealers = new Map<HTMLElement, () => void>();
  const resizeObservers: { disconnect(): void }[] = [];
  const indicators: HTMLElement[] = [];
  // Tabs selected while mounting, such as by the URL's target, do not slide
  let animate = false;

  const groups = document.querySelectorAll<HTMLElement>('.tabs');
  groups.forEach(group => {
    const list = group.querySelector<HTMLElement>(':scope > .tabs-list');
    const tabs = Array.from(
      group.querySelectorAll<HTMLButtonElement>(
        ':scope > .tabs-list > .tabs-tab',
      ),
    );
    const panels = Array.from(
      group.querySelectorAll<HTMLElement>(
        ':scope > .tabs-panels > .tabs-panel',
      ),
    );
    if (!list || tabs.length === 0 || tabs.length !== panels.length) {
      return;
    }

    let selected = Math.max(
      0,
      tabs.findIndex(tab => tab.hasAttribute('data-selected')),
    );

    const update = () => {
      tabs.forEach((tab, index) => {
        const isSelected = index === selected;
        tab.setAttribute('aria-selected', String(isSelected));
        tab.tabIndex = isSelected ? 0 : -1;
        tab.toggleAttribute('data-selected', isSelected);
      });
      panels.forEach((panel, index) => {
        const isSelected = index === selected;
        panel.toggleAttribute('data-selected', isSelected);
        // An until-found panel is still rendered, so it would stay focusable
        if (isSelected) {
          panel.tabIndex = 0;
          panel.removeAttribute('hidden');
        } else {
          panel.removeAttribute('tabindex');
          panel.setAttribute('hidden', HIDDEN);
        }
      });
    };

    // Slides between tabs like the appearance pickers' indicator. Until it is
    // shown, the selected tab draws its own fill.
    const indicator = document.createElement('span');
    indicator.className = 'tabs-indicator';
    indicator.setAttribute('aria-hidden', 'true');
    indicator.hidden = true;
    list.prepend(indicator);
    indicators.push(indicator);
    const moveIndicator = (animateMove: boolean) =>
      positionIndicator(indicator, list, tabs[selected], animateMove);

    // While the indicator slides, the panel box grows or shrinks from the old
    // panel's height to the new one's, and the old panel fades out over the
    // new one as it fades in
    const panelBox = panels[0].parentElement!;
    let resize: Animation | null = null;
    let fades: Animation[] = [];
    let leaving: HTMLElement | null = null;
    const resizePanels = (from: number) => {
      resize?.cancel();
      const to = panelBox.getBoundingClientRect().height;
      if (from === to) {
        return;
      }
      // The new panel is laid out at its full height; the box clips it
      panelBox.style.overflow = 'clip';
      const animation = panelBox.animate(
        [{ height: `${from}px` }, { height: `${to}px` }],
        TRANSITION_TIMING,
      );
      resize = animation;
      // A canceled animation was replaced, unless the height did not change
      const done = () => {
        if (resize === animation) {
          resize = null;
          panelBox.style.overflow = '';
        }
      };
      animation.addEventListener('finish', done);
      animation.addEventListener('cancel', done);
    };

    // Stops a crossfade; update() then hides the panel that was leaving
    const endFade = () => {
      fades.forEach(fade => fade.cancel());
      fades = [];
      panelBox.removeAttribute('data-crossfading');
      if (leaving) {
        leaving.removeAttribute('data-leaving');
        leaving.inert = false;
        leaving = null;
      }
    };

    const crossfade = (
      oldPanel: HTMLElement,
      oldOpacity: number,
      newPanel: HTMLElement,
      newOpacity: number,
    ) => {
      // The old panel stays shown until it fades out, out of the way of
      // clicks, focus, and assistive technology
      oldPanel.removeAttribute('hidden');
      oldPanel.inert = true;
      oldPanel.setAttribute('data-leaving', '');
      leaving = oldPanel;
      panelBox.setAttribute('data-crossfading', '');
      // Each fade holds its end value until endFade() cancels it, so the old
      // panel cannot reappear before it is hidden
      const fadeTiming = { ...TRANSITION_TIMING, fill: 'forwards' } as const;
      const fadeOut = oldPanel.animate(
        [{ opacity: oldOpacity }, { opacity: 0 }],
        fadeTiming,
      );
      const fadeIn = newPanel.animate(
        [{ opacity: newOpacity }, { opacity: 1 }],
        fadeTiming,
      );
      fades = [fadeOut, fadeIn];
      fadeOut.addEventListener('finish', () => {
        if (leaving === oldPanel) {
          endFade();
          update();
        }
      });
    };

    const opacityOf = (panel: HTMLElement) =>
      Number(window.getComputedStyle(panel).opacity);

    const select = (index: number) => {
      if (index === selected) {
        return;
      }
      const smooth =
        animate &&
        !prefersReducedMotion(window) &&
        typeof panelBox.animate === 'function';
      // Mid-transition, these are the current animated values, so selecting
      // another tab continues from them
      const from = panelBox.getBoundingClientRect().height;
      const oldPanel = panels[selected];
      const newPanel = panels[index];
      const oldOpacity = smooth ? opacityOf(oldPanel) : 1;
      const newOpacity =
        smooth && newPanel === leaving ? opacityOf(newPanel) : 0;

      endFade();
      selected = index;
      update();
      moveIndicator(animate);
      if (smooth) {
        crossfade(oldPanel, oldOpacity, newPanel, newOpacity);
        resizePanels(from);
      }
    };

    list.setAttribute('role', 'tablist');
    tabs.forEach((tab, index) => {
      tab.setAttribute('role', 'tab');
      tab.setAttribute('aria-controls', panels[index].id);
      tab.disabled = false;
      tab.addEventListener('click', () => select(index));
    });
    panels.forEach((panel, index) => {
      panel.setAttribute('role', 'tabpanel');
      panel.setAttribute('aria-labelledby', tabs[index].id);
      panel.addEventListener('beforematch', () => select(index));
      revealers.set(panel, () => select(index));
    });

    group.addEventListener(TABS_REVEAL_EVENT, event => {
      const index = panels.findIndex(panel =>
        panel.contains(event.target as Node),
      );
      if (index !== -1) {
        select(index);
      }
    });

    list.addEventListener('keydown', (event: KeyboardEvent) => {
      const current = tabs.indexOf(event.target as HTMLButtonElement);
      if (current === -1) {
        return;
      }
      let next: number;
      switch (event.key) {
        case 'ArrowRight':
          next = (current + 1) % tabs.length;
          break;
        case 'ArrowLeft':
          next = (current - 1 + tabs.length) % tabs.length;
          break;
        case 'Home':
          next = 0;
          break;
        case 'End':
          next = tabs.length - 1;
          break;
        default:
          return;
      }
      event.preventDefault();
      select(next);
      tabs[next].focus();
    });

    update();
    moveIndicator(false);

    // Layout changes, such as fonts loading or an enclosing panel being shown,
    // resize the tabs
    const resizeObserver = globals.createResizeObserver(() =>
      moveIndicator(false),
    );
    tabs.forEach(tab => resizeObserver.observe(tab));
    resizeObservers.push(resizeObserver);

    group.setAttribute('data-mounted', '');
  });

  // Select every tab that contains the URL's target, innermost first
  const revealHashTarget = (scroll: boolean) => {
    const target = getHashTarget(document, window.location.hash);
    let changed = false;
    for (const panel of target ? panelsAround(target) : []) {
      const reveal = revealers.get(panel);
      if (reveal && !panel.hasAttribute('data-selected')) {
        reveal();
        changed = true;
      }
    }
    if (changed && scroll) {
      target?.scrollIntoView();
    }
  };
  const onHashChange = () => revealHashTarget(true);

  // Navigation that restored a saved scroll position keeps it
  revealHashTarget(!isScrollRestored());
  animate = true;
  window.addEventListener('hashchange', onHashChange);

  return () => {
    window.removeEventListener('hashchange', onHashChange);
    resizeObservers.forEach(observer => observer.disconnect());
    indicators.forEach(indicator => indicator.remove());
  };
};
