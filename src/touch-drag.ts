// How long after a drag lifts the click that follows it is ignored, in
// milliseconds
const CLICK_AFTER_DRAG = 400;

export interface TouchDragHandlers {
  /**
   * A touch or pen went down on the element. Measures what the drag needs and
   * places what it drags; returns false to ignore the touch.
   */
  start(event: PointerEvent): boolean;
  /**
   * Follows the finger at most once per frame while it moves or a frame is
   * requested, and once more as it lifts if a frame is still due. Returns true
   * to be called again on the next frame, even if the finger stays put.
   */
  frame(clientX: number, time: number): boolean | void;
  /** The drag ended, whether the finger lifted or it was interrupted */
  end(): void;
}

export interface TouchDrag {
  /** Whether a finger or pen is dragging */
  readonly active: boolean;
  /** Calls the frame handler on the next frame */
  request(): void;
  teardown(): void;
}

/**
 * Lets a touch or pen anywhere on the element drag something, used by the
 * tabs' indicator and the appearance pickers' knobs. The element takes hold of
 * the pointer as soon as it goes down, so its CSS must set `touch-action:
 * none`; `touchmove` is also canceled while dragging, since Safari can still
 * start scrolling the page despite touch-action. A mouse is ignored, and focus
 * never moves. The element has `data-dragging` once the finger moves. The
 * pointer click that follows a lifted finger is ignored, since the drag
 * already chose what it would click; keyboard clicks are not.
 */
export function mountTouchDrag(
  window: Window,
  element: HTMLElement,
  handlers: TouchDragHandlers,
): TouchDrag {
  let drag: {
    pointerId: number;
    // The finger's latest client X
    clientX: number;
    frame: number | null;
  } | null = null;
  let ignoreClickUntil = 0;

  const tick = (time: number) => {
    const current = drag!;
    current.frame = null;
    if (handlers.frame(current.clientX, time)) {
      request();
    }
  };

  const request = () => {
    if (drag && drag.frame === null) {
      drag.frame = window.requestAnimationFrame(tick);
    }
  };

  const stop = () => {
    if (!drag) {
      return;
    }
    if (drag.frame !== null) {
      window.cancelAnimationFrame(drag.frame);
    }
    drag = null;
    element.removeAttribute('data-dragging');
    handlers.end();
  };

  const onPointerDown = (event: PointerEvent) => {
    if (event.pointerType === 'mouse' || !event.isPrimary) {
      return;
    }
    // A pen and a finger are each primary
    stop();
    if (!handlers.start(event)) {
      return;
    }
    drag = { pointerId: event.pointerId, clientX: event.clientX, frame: null };
    element.setPointerCapture?.(event.pointerId);
  };

  const onPointerMove = (event: PointerEvent) => {
    if (drag?.pointerId !== event.pointerId) {
      return;
    }
    if (!element.hasAttribute('data-dragging')) {
      element.setAttribute('data-dragging', '');
    }
    drag.clientX = event.clientX;
    request();
  };

  const onTouchMove = (event: TouchEvent) => {
    if (drag) {
      event.preventDefault();
    }
  };

  // A move not yet drawn is followed first, so it counts as it would have
  const onPointerUp = (event: PointerEvent) => {
    if (drag?.pointerId !== event.pointerId) {
      return;
    }
    if (drag.frame !== null) {
      window.cancelAnimationFrame(drag.frame);
      drag.frame = null;
      drag.clientX = event.clientX;
      handlers.frame(drag.clientX, event.timeStamp);
    }
    stop();
    ignoreClickUntil = event.timeStamp + CLICK_AFTER_DRAG;
    if (element.hasPointerCapture?.(event.pointerId)) {
      element.releasePointerCapture(event.pointerId);
    }
  };

  const onPointerCancel = (event: PointerEvent) => {
    if (drag?.pointerId === event.pointerId) {
      stop();
    }
  };

  // Keyboard and assistive technology clicks have no detail
  const onClick = (event: MouseEvent) => {
    if (event.detail > 0 && event.timeStamp < ignoreClickUntil) {
      ignoreClickUntil = 0;
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  };

  element.addEventListener('pointerdown', onPointerDown);
  element.addEventListener('pointermove', onPointerMove);
  element.addEventListener('pointerup', onPointerUp);
  element.addEventListener('pointercancel', onPointerCancel);
  element.addEventListener('lostpointercapture', onPointerCancel);
  element.addEventListener('touchmove', onTouchMove, { passive: false });
  element.addEventListener('click', onClick, true);

  return {
    get active() {
      return drag !== null;
    },
    request,
    teardown() {
      stop();
      element.removeEventListener('pointerdown', onPointerDown);
      element.removeEventListener('pointermove', onPointerMove);
      element.removeEventListener('pointerup', onPointerUp);
      element.removeEventListener('pointercancel', onPointerCancel);
      element.removeEventListener('lostpointercapture', onPointerCancel);
      element.removeEventListener('touchmove', onTouchMove);
      element.removeEventListener('click', onClick, true);
    },
  };
}
