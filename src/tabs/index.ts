import { globals } from '../globals';
import { getHashTarget } from '../hash-target';
import { isScrollRestored } from '../navigate/restored-scroll';
import { mountTouchDrag } from '../touch-drag';
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

// How fast a finger held at the very end of the track scrolls it, in pixels
// per millisecond
const EDGE_SCROLL_SPEED = 0.6;

// The width of the indicator's middle strip, which is scaled to fit
const MIDDLE_WIDTH = 100;

// How far the middle strip's ring and fill reach under each end cap, so that
// their edges, softened while they slide between pixels, are always hidden
// under the cap's opaque part. The ring stays close to the cap's flat side,
// where the cap is nearly full height, and the fill reaches further, within
// the cap's ring, so its edge never shows the ring color under it.
const RING_OVERLAP = 2;
const FILL_OVERLAP = 4;

interface Box {
  x: number;
  width: number;
  height: number;
}

/** The tab's position within the list's scrolling content */
function tabBox(list: HTMLElement, tab: HTMLElement): Box {
  const listRect = list.getBoundingClientRect();
  const tabRect = tab.getBoundingClientRect();
  // The indicator scrolls with the tabs in a long list
  const x = tabRect.left - listRect.left - list.clientLeft + list.scrollLeft;
  return { x, width: tabRect.width, height: tabRect.height };
}

interface Indicator {
  element: HTMLElement;
  // The middle strip's ring and its fill inside it
  ring: HTMLElement;
  fill: HTMLElement;
  end: HTMLElement;
}

/**
 * Builds the indicator from its end caps and the middle strip under them. The
 * strip's ring and fill are separate solid rectangles: Chromium redraws
 * scaled content at a resolution of its choosing while it animates, which
 * would blur a border drawn on the strip, but scales a solid color exactly.
 */
function createIndicator(document: Document): Indicator {
  const element = document.createElement('span');
  element.className = 'tabs-indicator';
  element.setAttribute('aria-hidden', 'true');
  element.hidden = true;
  const [ring, fill, , end] = ['ring', 'fill', 'start', 'end'].map(piece => {
    const span = document.createElement('span');
    span.className = `tabs-indicator-${piece}`;
    element.append(span);
    return span;
  });
  ring.style.width = `${MIDDLE_WIDTH}px`;
  fill.style.width = `${MIDDLE_WIDTH}px`;
  return { element, ring, fill, end };
}

/**
 * Moves the indicator to the box, sliding unless animate is false. Only
 * transforms change, so the browser can animate them without layout.
 *
 * The box is snapped to device pixels. A browser draws an animating transform
 * in a layer of its own, which it lines up with device pixels differently
 * than the page, so an edge between pixels would jump when the animation
 * starts and ends, and would differ between the pieces.
 */
function positionIndicator(
  window: Window,
  indicator: Indicator,
  box: Box,
  animate: boolean,
) {
  const { element, ring, fill, end } = indicator;
  const ratio = window.devicePixelRatio || 1;
  const snap = (value: number) => Math.round(value * ratio) / ratio;
  const x = snap(box.x);
  const width = snap(box.x + box.width) - x;
  const height = snap(box.height);
  if (!animate) {
    element.setAttribute('data-instant', '');
  }
  element.style.height = `${height}px`;
  element.style.transform = `translateX(${x}px)`;
  // The middle spans the gap between the caps, which are half as wide as the
  // tab is tall, and reaches under each one
  const cap = height / 2;
  const stretch = (strip: HTMLElement, overlap: number) => {
    const span = Math.max(0, width - 2 * cap + 2 * overlap);
    strip.style.transform = `translateX(${cap - overlap}px) scaleX(${span / MIDDLE_WIDTH})`;
  };
  stretch(ring, RING_OVERLAP);
  stretch(fill, FILL_OVERLAP);
  // In pixels, not a percentage of the cap, so that every piece's transition
  // can run off the main thread in step with the others. Snapped like the
  // start cap, whose position the browser snaps: the cap is half the height,
  // which may be an odd number of pixels, and a flat side between pixels would
  // blend its background into its ring, lightening the ring there.
  end.style.transform = `translateX(${snap(width - cap)}px)`;
  element.hidden = false;
  if (!animate) {
    // Commit the new position before transitions are re-enabled
    void element.offsetWidth;
    element.removeAttribute('data-instant');
  }
}

export default (window: Window) => {
  const document = window.document;
  // Selects the tab that owns a panel
  const revealers = new Map<HTMLElement, () => void>();
  // Undo what each group's component set up
  const teardowns: (() => void)[] = [];
  // Tabs selected while mounting, such as by the URL's target, do not slide
  let animate = false;

  const groups = document.querySelectorAll<HTMLElement>('.tabs');
  groups.forEach(group => {
    const track = group.querySelector<HTMLElement>(':scope > .tabs-track');
    const list = track?.querySelector<HTMLElement>(':scope > .tabs-list');
    const back = track?.querySelector<HTMLButtonElement>(
      ':scope > .tabs-scroll-start',
    );
    const forward = track?.querySelector<HTMLButtonElement>(
      ':scope > .tabs-scroll-end',
    );
    const tabs = Array.from(
      list?.querySelectorAll<HTMLButtonElement>(':scope > .tabs-tab') ?? [],
    );
    const panels = Array.from(
      group.querySelectorAll<HTMLElement>(
        ':scope > .tabs-panels > .tabs-panel',
      ),
    );
    // A stepper's Back and Next buttons
    const stepNav = group.querySelector<HTMLElement>(
      ':scope > .tabs-panels > .tabs-step-nav',
    );
    const stepBack = stepNav?.querySelector<HTMLButtonElement>(
      ':scope > .tabs-step-back',
    );
    const stepNext = stepNav?.querySelector<HTMLButtonElement>(
      ':scope > .tabs-step-next',
    );
    const stepStatus = stepNav?.querySelector<HTMLElement>(
      ':scope > .tabs-step-status',
    );
    if (
      !track ||
      !list ||
      !back ||
      !forward ||
      tabs.length === 0 ||
      tabs.length !== panels.length
    ) {
      return;
    }

    let selected = Math.max(
      0,
      tabs.findIndex(tab => tab.hasAttribute('data-selected')),
    );

    // Focus moves off a step button hidden by a new selection, unless a touch
    // or pen pressed a step button (see below)
    const update = (moveStepFocus = true) => {
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
      // There is no step before the first or after the last. A focused button
      // that is hidden passes focus to the other one, however the step was
      // selected, so focus never drops to the page.
      // Back and Next announce the step they reach after this. Screen readers
      // speak a status only when its text changes, so a step reached again
      // after another tab was selected must replace an empty status.
      if (stepStatus) {
        stepStatus.textContent = '';
      }
      if (stepBack && stepNext) {
        const focused = document.activeElement;
        stepBack.hidden = selected === 0;
        stepNext.hidden = selected === tabs.length - 1;
        if (moveStepFocus) {
          for (const [button, other] of [
            [stepBack, stepNext],
            [stepNext, stepBack],
          ]) {
            if (focused === button && button.hidden) {
              other.focus({ preventScroll: true });
            }
          }
        }
      }
    };

    // Slides between tabs like the appearance pickers' indicator. Until it is
    // shown, the selected tab draws its own fill.
    const indicator = createIndicator(document);
    list.prepend(indicator.element);

    // A touch or pen held down on the tab list. The indicator's center stays
    // offset from the finger by as much as when it was grabbed. Layout is
    // measured once when it goes down, so following the finger never forces
    // the browser to lay out the page.
    let drag: {
      offset: number;
      boxes: Box[];
      centers: number[];
      // The finger's latest client X
      clientX: number;
      // The client X of the list's padding box, its visible width, and how
      // far it scrolls, which only the drag changes while it lasts
      origin: number;
      width: number;
      scrollLeft: number;
      maxScroll: number;
      // How close to either end of the track the finger scrolls it
      edge: number;
      // When the last frame scrolled the track
      lastTime: number | null;
    } | null = null;

    // Wider than the fade at either end of a track too long to show every tab
    const edgeWidth = () => list.clientHeight;

    // Never past either end: iOS Safari animates a smooth scroll past an end
    // into its overscroll area and stops there, instead of at the end
    const scrollTabsTo = (left: number, smooth: boolean) => {
      const maxScroll = list.scrollWidth - list.clientWidth;
      const target = Math.min(Math.max(left, 0), Math.max(maxScroll, 0));
      if (target !== list.scrollLeft) {
        list.scrollTo?.({
          left: target,
          behavior: smooth && !prefersReducedMotion(window) ? 'smooth' : 'auto',
        });
      }
    };

    // Moves the indicator onto the selected tab and scrolls the track just
    // enough to show the tab clear of the fades, measuring the tab once
    const showSelected = (smooth: boolean) => {
      const box = tabBox(list, tabs[selected]);
      positionIndicator(window, indicator, box, smooth);
      const edge = edgeWidth();
      const left = list.scrollLeft;
      const width = list.clientWidth;
      if (box.x - edge < left) {
        scrollTabsTo(box.x - edge, smooth);
      } else if (box.x + box.width + edge > left + width) {
        scrollTabsTo(box.x + box.width + edge - width, smooth);
      }
    };

    // While the indicator slides, the new panel replaces the old one at once.
    // Animating the panels would lay out or repaint the page on every frame.
    // Selecting the selected tab again still brings it into view.
    const select = (index: number, moveStepFocus = true) => {
      if (index !== selected) {
        selected = index;
        update(moveStepFocus);
      }
      // A drag moves the indicator and scrolls the track itself
      if (!drag) {
        showSelected(animate);
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

    // Back and Next select the step before or after, like clicking its tab,
    // announce it, and bring the tab list into view, such as after a long
    // step. Focus stays on the button, or moves to the other one when the step
    // reached has no step past it (see update). Focus never moves for a touch
    // or pen, which some browsers focus the button for; Safari would draw a
    // focus ring around a button focused by a touch.
    if (stepNav && stepBack && stepNext) {
      const panelIds = panels.map(panel => panel.id).join(' ');
      // The pointer type of the latest press on a step button. A click reports
      // its own, but iOS Safari 18.2 reports a touch's click as a mouse's.
      let pressType = '';
      for (const [button, direction] of [
        [stepBack, -1],
        [stepNext, 1],
      ] as const) {
        button.disabled = false;
        button.setAttribute('aria-controls', panelIds);
        button.addEventListener('pointerdown', event => {
          pressType = event.pointerType;
        });
        button.addEventListener('click', event => {
          // A click from a keyboard has no detail. A pointer's click follows
          // its own press on this button, so the press is never stale.
          const byTouch =
            event.detail > 0 && pressType !== '' && pressType !== 'mouse';
          select(
            Math.min(Math.max(selected + direction, 0), tabs.length - 1),
            !byTouch,
          );
          if (stepStatus) {
            stepStatus.textContent = tabs[selected].textContent;
          }
          track.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
        });
      }
    }

    group.addEventListener(TABS_REVEAL_EVENT, event => {
      const index = panels.findIndex(panel =>
        panel.contains(event.target as Node),
      );
      if (index !== -1) {
        select(index);
      }
    });

    // The buttons beside the tabs scroll them by their visible width less the
    // fades. A touch on the tabs drags the indicator instead of scrolling
    // them, and a mouse wheel scrolls the page.
    const scrollByPage = (direction: number) => {
      const page = Math.max(
        list.clientWidth / 2,
        list.clientWidth - 2 * edgeWidth(),
      );
      scrollTabsTo(list.scrollLeft + direction * page, true);
    };
    for (const [button, direction] of [
      [back, -1],
      [forward, 1],
    ] as const) {
      button.addEventListener('click', () => scrollByPage(direction));
      // A click would focus a button hidden from assistive technology
      button.addEventListener('mousedown', event => event.preventDefault());
    }

    // Both buttons show while the tabs do not fit the track without them, so
    // showing them never makes the tabs fit and hides them again
    const updateScrollButtons = () => {
      const overflowing = list.scrollWidth > track.clientWidth + 1;
      const maxScroll = list.scrollWidth - list.clientWidth;
      const atStart = list.scrollLeft <= 1;
      const atEnd = list.scrollLeft >= maxScroll - 1;
      back.hidden = !overflowing;
      forward.hidden = !overflowing;
      back.disabled = atStart;
      forward.disabled = atEnd;
      list.toggleAttribute('data-more-start', overflowing && !atStart);
      list.toggleAttribute('data-more-end', overflowing && !atEnd);
    };

    // A touch or pen anywhere on the tab list takes hold of the indicator at
    // once: it slides onto the tab under the finger, selecting it, then
    // follows the finger until it lifts, selecting each tab its center crosses
    // and morphing between the widths of the tabs on either side. Held near
    // either end of a track too long to show every tab, it scrolls the track
    // on through the tabs. The page does not scroll meanwhile. A mouse selects
    // by clicking.

    // CSS turns off the transition once the finger moves, so the indicator
    // tracks it exactly
    const follow = () => {
      const { boxes, centers, offset, clientX, origin, scrollLeft } = drag!;
      const last = centers.length - 1;
      const center = Math.min(
        Math.max(clientX - origin + scrollLeft - offset, centers[0]),
        centers[last],
      );
      let i = 0;
      while (i < last - 1 && center > centers[i + 1]) {
        i++;
      }
      const j = Math.min(i + 1, last);
      const t = j === i ? 0 : (center - centers[i]) / (centers[j] - centers[i]);
      const width = boxes[i].width + (boxes[j].width - boxes[i].width) * t;
      positionIndicator(
        window,
        indicator,
        { x: center - width / 2, width, height: boxes[i].height },
        true,
      );

      // Focus moves along only if a tab already had it; Safari would draw a
      // focus ring around a tab focused by a touch
      const hadFocus = list.contains(document.activeElement);
      select(t < 0.5 ? i : j);
      if (hadFocus && document.activeElement !== tabs[selected]) {
        tabs[selected].focus({ preventScroll: true });
      }
    };

    // Once per frame while the finger moves or is held near one of the
    // track's ends, which scrolls the track (faster nearer the end) with the
    // indicator staying under the finger
    const tick = (clientX: number, time: number) => {
      const current = drag!;
      current.clientX = clientX;
      const x = current.clientX - current.origin;
      const { edge, width, maxScroll } = current;
      const depth =
        x < edge
          ? -Math.min(1, (edge - x) / edge)
          : x > width - edge
            ? Math.min(1, (x - (width - edge)) / edge)
            : 0;
      const elapsed = current.lastTime === null ? 0 : time - current.lastTime;
      const scrollLeft = Math.min(
        Math.max(current.scrollLeft + depth * EDGE_SCROLL_SPEED * elapsed, 0),
        maxScroll,
      );
      if (scrollLeft !== current.scrollLeft) {
        current.scrollLeft = scrollLeft;
        list.scrollLeft = scrollLeft;
      }
      follow();
      const more =
        depth < 0 ? scrollLeft > 0 : depth > 0 && scrollLeft < maxScroll;
      current.lastTime = more ? time : null;
      return more;
    };

    const touchDrag = mountTouchDrag(window, list, {
      start(event) {
        const boxes = tabs.map(tab => tabBox(list, tab));
        const centers = boxes.map(box => box.x + box.width / 2);
        const origin = list.getBoundingClientRect().left + list.clientLeft;
        const scrollLeft = list.scrollLeft;
        const x = event.clientX - origin + scrollLeft;
        // The indicator slides exactly onto the tab under the finger (or the
        // nearest one), and later follows the finger from there. Centering it
        // on the finger would land between tabs, then slide again on release.
        const distance = (box: Box) =>
          Math.max(box.x - x, x - (box.x + box.width), 0);
        const pressed = boxes.reduce(
          (nearest, box, index) =>
            distance(box) < distance(boxes[nearest]) ? index : nearest,
          0,
        );
        drag = {
          offset: x - centers[pressed],
          boxes,
          centers,
          clientX: event.clientX,
          origin,
          width: list.clientWidth,
          scrollLeft,
          maxScroll: list.scrollWidth - list.clientWidth,
          edge: edgeWidth(),
          lastTime: null,
        };
        follow();
        return true;
      },
      frame: tick,
      // The tab where the drag went down may get a click after it lifts,
      // which is ignored; the drag already selected the tab under the finger
      end() {
        drag = null;
        showSelected(animate);
      },
    });

    list.addEventListener(
      'scroll',
      () => {
        updateScrollButtons();
        // A smooth scroll still running when the finger went down moves the
        // tabs under it; the indicator follows the finger over them
        if (drag && list.scrollLeft !== drag.scrollLeft) {
          drag.scrollLeft = list.scrollLeft;
          touchDrag.request();
        }
      },
      { passive: true },
    );

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
      // Selecting the tab scrolls the track to it smoothly; the page scrolls
      // to the track as it would to a focused element
      select(next);
      tabs[next].focus({ preventScroll: true });
      track.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
    });

    update();

    // Places the indicator and the scroll buttons when the observer first
    // reports, after the page is laid out, and again whenever layout changes
    // (fonts loading, an enclosing panel being shown, the window resizing)
    // resize the tabs or the track. The selected tab stays in view, unless a
    // drag is scrolling the track itself.
    const resizeObserver = globals.createResizeObserver(() => {
      updateScrollButtons();
      if (!drag) {
        showSelected(false);
      }
    });
    tabs.forEach(tab => resizeObserver.observe(tab));
    resizeObserver.observe(list);

    teardowns.push(() => {
      touchDrag.teardown();
      resizeObserver.disconnect();
      indicator.element.remove();
    });

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
    teardowns.forEach(teardown => teardown());
  };
};
