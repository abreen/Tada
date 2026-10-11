import { getHashTarget } from '../hash-target';
import { isScrollRestored } from '../navigate/restored-scroll';

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

export default (window: Window) => {
  const document = window.document;
  // Selects the tab that owns a panel
  const revealers = new Map<HTMLElement, () => void>();

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

    const select = (index: number) => {
      if (index !== selected) {
        selected = index;
        update();
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
  window.addEventListener('hashchange', onHashChange);

  return () => {
    window.removeEventListener('hashchange', onHashChange);
  };
};
