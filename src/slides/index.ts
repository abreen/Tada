interface TraceToolbarState {
  hidden: boolean;
  ariaHidden: string | null;
}

type PresentationMode = 'normal' | 'fullscreen';

function isInteractive(
  view: Window & typeof globalThis,
  target: EventTarget | null,
): boolean {
  if (!(target instanceof view.Node)) {
    return false;
  }

  const element =
    target instanceof view.Element ? target : target.parentElement;
  return Boolean(
    element?.closest(
      'a, button, input, select, textarea, summary, label, [role="button"], [contenteditable=""], [contenteditable="true"], .question-a-body',
    ),
  );
}

function updateActiveSlide(
  slides: HTMLElement[],
  activeIndex: number,
  isPresenting: boolean,
): void {
  for (const [index, slide] of slides.entries()) {
    slide.classList.toggle('is-active', isPresenting && index === activeIndex);
  }
}

function isTraceReady(widget: HTMLElement): boolean {
  return (
    widget.querySelector('.trace-line-active') !== null ||
    widget.querySelector('.trace-diagram > *') !== null
  );
}

export default function mountSlides(window: Window): void | (() => void) {
  const { document } = window;
  const view = document.defaultView;
  const presentButton = document.querySelector(
    '[data-slides-present]',
  ) as HTMLButtonElement | null;
  const presentFullscreenButton = document.querySelector(
    '[data-slides-present-fullscreen]',
  ) as HTMLButtonElement | null;
  const rootScopeButton = presentButton ?? presentFullscreenButton;
  const scopedRoot = rootScopeButton
    ?.closest('main')
    ?.querySelector('[data-slides-root]');
  const root = (scopedRoot ??
    document.querySelector('[data-slides-root]')) as HTMLElement | null;

  if (!view || !root || (!presentButton && !presentFullscreenButton)) {
    return;
  }

  const domView = view;
  const domDocument = document as Document & {
    fullscreenElement?: Element | null;
    exitFullscreen?: () => Promise<void>;
  };
  const fullscreenTarget = document.documentElement as HTMLElement & {
    requestFullscreen?: () => Promise<void>;
  };
  const slidesRoot = root;
  const slides = Array.from(
    slidesRoot.querySelectorAll('[data-slide-index]'),
  ) as HTMLElement[];
  if (slides.length === 0) {
    return;
  }

  if (presentButton) {
    presentButton.disabled = false;
  }
  if (presentFullscreenButton) {
    presentFullscreenButton.disabled = false;
  }

  const overlay = document.createElement('div');
  overlay.className = 'slides-toolbar';
  overlay.hidden = true;
  overlay.dataset.slidesOverlay = '';

  const closeButton = document.createElement('button');
  closeButton.type = 'button';
  closeButton.textContent = 'Close';
  closeButton.dataset.slidesClose = '';

  overlay.append(closeButton);
  document.body.appendChild(overlay);

  let isPresenting = false;
  let activeIndex = -1;
  let presentationMode: PresentationMode | null = null;
  let isToolbarPinnedVisible = false;

  const toolbarStates = new WeakMap<HTMLElement, TraceToolbarState>();
  const slideTabIndexes = new WeakMap<HTMLElement, string | null>();

  function hidePresentationCursor(): void {
    document.body.classList.add('is-presentation-cursor-hidden');
  }

  function showPresentationCursor(): void {
    document.body.classList.remove('is-presentation-cursor-hidden');
  }

  function hidePresentationControls(resetPinned = true): void {
    if (resetPinned) {
      isToolbarPinnedVisible = false;
    }
    overlay.hidden = true;
  }

  function showPresentationControls(): void {
    if (!isPresenting || presentationMode === 'fullscreen') {
      return;
    }

    overlay.hidden = false;
  }

  function pinPresentationControlsVisible(): void {
    if (!isPresenting || presentationMode === 'fullscreen') {
      return;
    }

    isToolbarPinnedVisible = true;
    overlay.hidden = false;
  }

  function getToolbarRevealBottom(): number {
    const wasHidden = overlay.hidden;
    if (wasHidden) {
      overlay.hidden = false;
    }

    const bottom = closeButton.getBoundingClientRect().bottom;

    if (wasHidden && !isToolbarPinnedVisible) {
      overlay.hidden = true;
    }

    return bottom;
  }

  function setTraceToolbarVisibility(hidden: boolean): void {
    const toolbars = slidesRoot.querySelectorAll('.trace-toolbar');
    for (const toolbar of toolbars) {
      const element = toolbar as HTMLElement;

      if (hidden) {
        if (!toolbarStates.has(element)) {
          toolbarStates.set(element, {
            hidden: element.hidden,
            ariaHidden: element.getAttribute('aria-hidden'),
          });
        }
        element.hidden = true;
        element.setAttribute('aria-hidden', 'true');
        continue;
      }

      const previous = toolbarStates.get(element);
      element.hidden = previous?.hidden ?? false;
      if (previous?.ariaHidden == null) {
        element.removeAttribute('aria-hidden');
      } else {
        element.setAttribute('aria-hidden', previous.ariaHidden);
      }
    }
  }

  function setActiveSlide(index: number): void {
    activeIndex = Math.max(0, Math.min(index, slides.length - 1));
    updateActiveSlide(slides, activeIndex, isPresenting);
  }

  function focusSlide(slide: HTMLElement | undefined): void {
    if (!slide) {
      return;
    }

    if (!slideTabIndexes.has(slide)) {
      slideTabIndexes.set(slide, slide.getAttribute('tabindex'));
    }
    slide.tabIndex = -1;
    slide.focus();
  }

  function restoreSlideFocusability(): void {
    for (const slide of slides) {
      const prior = slideTabIndexes.get(slide);
      if (prior === undefined) {
        continue;
      }
      if (prior == null) {
        slide.removeAttribute('tabindex');
      } else {
        slide.setAttribute('tabindex', prior);
      }
    }
  }

  function exitPresentation(): void {
    if (!isPresenting) {
      return;
    }

    const shouldExitFullscreen =
      presentationMode === 'fullscreen' &&
      domDocument.fullscreenElement != null &&
      typeof domDocument.exitFullscreen === 'function';

    isPresenting = false;
    activeIndex = -1;
    presentationMode = null;
    hidePresentationControls();
    showPresentationCursor();
    document.body.classList.remove('is-presenting');
    updateActiveSlide(slides, activeIndex, isPresenting);
    restoreSlideFocusability();
    setTraceToolbarVisibility(false);

    if (shouldExitFullscreen) {
      void domDocument.exitFullscreen?.();
    }
  }

  function resetReadyTraces(): void {
    const widgets = slidesRoot.querySelectorAll(
      '.trace-widget:not(.trace-disabled)',
    );

    for (const widget of widgets) {
      const widgetEl = widget as HTMLElement;
      if (!isTraceReady(widgetEl)) {
        continue;
      }

      const firstButton = widgetEl.querySelector(
        '.trace-first:not([disabled])',
      ) as HTMLButtonElement | null;

      firstButton?.click();
    }
  }

  function enterPresentation(mode: PresentationMode): void {
    isPresenting = true;
    presentationMode = mode;
    hidePresentationControls();
    showPresentationCursor();
    document.body.classList.add('is-presenting');
    setTraceToolbarVisibility(true);
    resetReadyTraces();
    setActiveSlide(0);
    focusSlide(slides[0]);
  }

  function driveTrace(delta: 1 | -1): boolean {
    if (activeIndex < 0) {
      return false;
    }

    const slide = slides[activeIndex];
    const selector =
      delta === 1
        ? '.trace-next:not([disabled])'
        : '.trace-prev:not([disabled])';
    const widgets = slide.querySelectorAll(
      '.trace-widget:not(.trace-disabled)',
    );

    for (const widget of widgets) {
      const widgetEl = widget as HTMLElement;
      if (!isTraceReady(widgetEl)) {
        continue;
      }

      const button = widgetEl.querySelector(
        selector,
      ) as HTMLButtonElement | null;
      if (!button) {
        continue;
      }

      button.click();
      return true;
    }

    return false;
  }

  function move(delta: 1 | -1): void {
    if (!isPresenting) {
      return;
    }

    hidePresentationCursor();

    if (delta === -1) {
      hidePresentationControls();
    }

    if (driveTrace(delta)) {
      if (delta === 1) {
        hidePresentationControls();
      }
      return;
    }

    if (delta === 1 && activeIndex >= slides.length - 1) {
      pinPresentationControlsVisible();
      return;
    }

    if (delta === 1) {
      hidePresentationControls();
    }

    setActiveSlide(activeIndex + delta);
    focusSlide(slides[activeIndex]);
  }

  function handlePresentClick(): void {
    enterPresentation('normal');
  }

  async function handlePresentFullscreenClick(): Promise<void> {
    enterPresentation('fullscreen');

    if (typeof fullscreenTarget.requestFullscreen !== 'function') {
      presentationMode = 'normal';
      return;
    }

    try {
      await fullscreenTarget.requestFullscreen();
    } catch {
      presentationMode = 'normal';
    }
  }

  function handlePresentFullscreenButtonClick(): void {
    void handlePresentFullscreenClick();
  }

  function handleCloseClick(): void {
    exitPresentation();
  }

  function handleFullscreenChange(): void {
    if (
      isPresenting &&
      presentationMode === 'fullscreen' &&
      domDocument.fullscreenElement == null
    ) {
      exitPresentation();
    }
  }

  function handleKeydown(event: KeyboardEvent): void {
    if (!isPresenting) {
      return;
    }

    if (
      (event.key === 'ArrowRight' ||
        event.key === 'ArrowLeft' ||
        event.key === ' ' ||
        event.key === 'Spacebar') &&
      isInteractive(domView, document.activeElement)
    ) {
      return;
    }

    if (event.key === 'ArrowRight') {
      event.preventDefault();
      move(1);
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      move(-1);
    } else if (event.key === ' ' || event.key === 'Spacebar') {
      event.preventDefault();
      move(1);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      exitPresentation();
    }
  }

  function handleSlideClick(event: MouseEvent): void {
    if (!isPresenting || isInteractive(domView, event.target)) {
      return;
    }

    const activeSlide = slides[activeIndex];
    if (!activeSlide) {
      return;
    }

    if (
      !(event.target instanceof domView.Node) ||
      !activeSlide.contains(event.target)
    ) {
      return;
    }

    move(1);
  }

  function handleMouseMove(event: MouseEvent): void {
    if (!isPresenting) {
      return;
    }

    showPresentationCursor();

    if (presentationMode === 'fullscreen') {
      return;
    }

    if (isToolbarPinnedVisible) {
      showPresentationControls();
      return;
    }

    if (event.clientY <= getToolbarRevealBottom()) {
      showPresentationControls();
    } else {
      hidePresentationControls(false);
    }
  }

  presentButton?.addEventListener('click', handlePresentClick);
  presentFullscreenButton?.addEventListener(
    'click',
    handlePresentFullscreenButtonClick,
  );
  closeButton.addEventListener('click', handleCloseClick);
  document.addEventListener('fullscreenchange', handleFullscreenChange);
  window.addEventListener('keydown', handleKeydown);
  window.addEventListener('mousemove', handleMouseMove);
  slidesRoot.addEventListener('click', handleSlideClick);

  return () => {
    exitPresentation();
    presentButton?.removeEventListener('click', handlePresentClick);
    presentFullscreenButton?.removeEventListener(
      'click',
      handlePresentFullscreenButtonClick,
    );
    closeButton.removeEventListener('click', handleCloseClick);
    document.removeEventListener('fullscreenchange', handleFullscreenChange);
    window.removeEventListener('keydown', handleKeydown);
    window.removeEventListener('mousemove', handleMouseMove);
    slidesRoot.removeEventListener('click', handleSlideClick);
    overlay.remove();
  };
}
