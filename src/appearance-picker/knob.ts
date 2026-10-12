import { mountTouchDrag } from '../touch-drag';

/** The option at either end of a switch's track */
export type KnobSide = 'start' | 'end';

/**
 * Lets a touch or pen take hold of a switch's knob, like the tabs' indicator.
 * The knob slides onto the option under the finger as soon as it goes down,
 * choosing it, then follows the finger until it lifts, clamped between the two
 * options, choosing each option its center crosses into. A mouse toggles the
 * switch by clicking.
 *
 * Mount this before the switch's own click listener, so it can stop the click
 * that follows the finger lifting.
 */
export function mountKnobDrag(
  window: Window,
  button: HTMLButtonElement,
  // The option the knob is on
  current: () => KnobSide,
  choose: (side: KnobSide) => void,
): () => void {
  const options = button.querySelectorAll<HTMLElement>(
    ':scope > .preference-picker-option',
  );
  if (options.length !== 2) {
    return () => {};
  }

  // Layout is measured once when the finger goes down, so following it never
  // forces the browser to lay out the page
  let hold: {
    // The client X of the first option, and how far the knob travels to the
    // second
    origin: number;
    travel: number;
    // How far the finger is from the knob's left edge
    offset: number;
    // The option last chosen, if any
    side: KnobSide | null;
  } | null = null;

  // Like the tabs, the option is chosen as soon as the knob's center crosses
  // into it, not when the finger lifts
  const place = (clientX: number) => {
    const current = hold!;
    const x = Math.min(
      Math.max(clientX - current.origin - current.offset, 0),
      current.travel,
    );
    button.style.setProperty('--preference-picker-knob-x', `${x}px`);
    const side = x > current.travel / 2 ? 'end' : 'start';
    if (side !== current.side) {
      current.side = side;
      button.setAttribute('data-holding', side);
      choose(side);
    }
  };

  const drag = mountTouchDrag(window, button, {
    start(event) {
      if (button.disabled) {
        return false;
      }
      const [first, second] = Array.from(options, option =>
        option.getBoundingClientRect(),
      );
      const origin = first.left;
      const travel = second.left - first.left;
      // The option under the finger, or the nearer one past either end. A
      // press between the options toggles the switch like a click, since
      // iOS VoiceOver activates a control by tapping its center.
      const x = event.clientX - origin;
      const toggled = current() === 'end' ? 0 : travel;
      const pressed = x < first.width ? 0 : x >= travel ? travel : toggled;
      hold = { origin, travel, offset: x - pressed, side: null };
      // The press colors would flash on the option the knob leaves, since a
      // tap can stay :active after the finger lifts
      button.setAttribute('data-touch', '');
      place(event.clientX);
      return true;
    },
    frame: place,
    // The knob slides from the finger onto the chosen option
    end() {
      hold = null;
      button.removeAttribute('data-holding');
      button.style.removeProperty('--preference-picker-knob-x');
    },
  });

  // A mouse or key shows the press colors again
  const onPointerDown = (event: PointerEvent) => {
    if (event.pointerType === 'mouse') {
      button.removeAttribute('data-touch');
    }
  };
  const onKeyDown = () => button.removeAttribute('data-touch');
  button.addEventListener('pointerdown', onPointerDown);
  button.addEventListener('keydown', onKeyDown);

  return () => {
    drag.teardown();
    button.removeEventListener('pointerdown', onPointerDown);
    button.removeEventListener('keydown', onKeyDown);
    button.removeAttribute('data-touch');
  };
}
