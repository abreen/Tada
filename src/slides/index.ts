interface TraceToolbarState {
  hidden: boolean;
  ariaHidden: string | null;
}

type PresentationMode = 'normal' | 'fullscreen';

interface SlidesPresentDetail {
  slideIndex?: number;
}

interface SlideAnnotationState {
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
  dpr: number;
}

const FULLSCREEN_STORAGE_KEY = 'slidesFullscreen';
const ANNOTATION_COLOR = 'blueviolet';
const ANNOTATION_ERASER_RADIUS = 18;
const ANNOTATION_ERASER_DIAMETER = ANNOTATION_ERASER_RADIUS * 2;

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
      'a, button, input, select, textarea, summary, label, [role="button"], [role="separator"], [contenteditable=""], [contenteditable="true"]',
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
  const fullscreenCheckbox = document.querySelector(
    '[data-slides-fullscreen]',
  ) as HTMLInputElement | null;
  const rootScopeButton = presentButton ?? fullscreenCheckbox;
  const scopedRoot = rootScopeButton
    ?.closest('main')
    ?.querySelector('[data-slides-root]');
  const root = (scopedRoot ??
    document.querySelector('[data-slides-root]')) as HTMLElement | null;

  if (!view || !root) {
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
  if (fullscreenCheckbox) {
    try {
      const stored = window.localStorage.getItem(FULLSCREEN_STORAGE_KEY);
      if (stored === 'false') {
        fullscreenCheckbox.checked = false;
      } else if (stored === 'true') {
        fullscreenCheckbox.checked = true;
      }
    } catch {
      // ignored
    }
    fullscreenCheckbox.disabled = false;
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

  const eraserPreview = document.createElement('div');
  eraserPreview.hidden = true;
  eraserPreview.dataset.slidesEraserPreview = '';
  eraserPreview.setAttribute('aria-hidden', 'true');
  eraserPreview.style.setProperty(
    '--slides-eraser-preview-size',
    `${ANNOTATION_ERASER_DIAMETER}px`,
  );
  document.body.appendChild(eraserPreview);

  const annotationLayer = document.createElement('div');
  annotationLayer.hidden = true;
  annotationLayer.dataset.slidesAnnotationLayer = '';
  annotationLayer.setAttribute('aria-hidden', 'true');
  slidesRoot.append(annotationLayer);

  let isPresenting = false;
  let activeIndex = -1;
  let presentationMode: PresentationMode | null = null;
  let isToolbarPinnedVisible = false;
  let isAnnotating = false;
  let isShiftPressed = false;
  let isErasing = false;
  let isDrivingTrace = false;
  let activeAnnotation: {
    slide: HTMLElement;
    previousX: number;
    previousY: number;
  } | null = null;

  const toolbarStates = new WeakMap<HTMLElement, TraceToolbarState>();
  const slideTabIndexes = new WeakMap<HTMLElement, string | null>();
  const annotationStates = new WeakMap<HTMLElement, SlideAnnotationState>();

  function hidePresentationCursor(): void {
    if (isAnnotating) {
      return;
    }

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
    activeAnnotation = null;
    hideEraserPreview();
    activeIndex = Math.max(0, Math.min(index, slides.length - 1));
    updateActiveSlide(slides, activeIndex, isPresenting);
    updateActiveAnnotationCanvas();
    resizeActiveAnnotationCanvas();
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

  function scrollToSlide(index: number): void {
    const slide = slides[index];
    if (!slide || typeof slide.scrollIntoView !== 'function') {
      return;
    }

    slide.scrollIntoView({ block: 'start', inline: 'nearest' });
  }

  function exitPresentation(): void {
    if (!isPresenting) {
      return;
    }

    const exitingActiveIndex = activeIndex;
    const shouldExitFullscreen =
      presentationMode === 'fullscreen' &&
      domDocument.fullscreenElement != null &&
      typeof domDocument.exitFullscreen === 'function';

    isPresenting = false;
    activeIndex = -1;
    presentationMode = null;
    isShiftPressed = false;
    setAnnotationMode(false);
    clearAnnotationCanvases();
    annotationLayer.hidden = true;
    hidePresentationControls();
    showPresentationCursor();
    document.body.classList.remove('is-presenting');
    updateActiveSlide(slides, activeIndex, isPresenting);
    restoreSlideFocusability();
    setTraceToolbarVisibility(false);

    if (shouldExitFullscreen) {
      void domDocument
        .exitFullscreen()
        .finally(() => scrollToSlide(exitingActiveIndex))
        .catch(() => {
          // ignored
        });
      return;
    }

    scrollToSlide(exitingActiveIndex);
  }

  function resetReadyTraces(scope: HTMLElement = slidesRoot): void {
    const widgets = scope.querySelectorAll(
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

  function enterPresentation(mode: PresentationMode, slideIndex = 0): void {
    isPresenting = true;
    presentationMode = mode;
    annotationLayer.hidden = false;
    setAnnotationMode(false);
    hidePresentationControls();
    showPresentationCursor();
    document.body.classList.add('is-presenting');
    setTraceToolbarVisibility(true);
    resetReadyTraces();
    setActiveSlide(slideIndex);
    focusSlide(slides[activeIndex]);
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

      isDrivingTrace = true;
      try {
        button.click();
      } finally {
        isDrivingTrace = false;
      }
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

    const previousIndex = activeIndex;
    setActiveSlide(activeIndex + delta);
    if (delta === -1 && activeIndex !== previousIndex) {
      resetReadyTraces(slides[activeIndex]);
    }
    focusSlide(slides[activeIndex]);
  }

  async function handlePresentFullscreenClick(slideIndex = 0): Promise<void> {
    enterPresentation('fullscreen', slideIndex);

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

  function startPresentation(slideIndex = 0): void {
    if (fullscreenCheckbox?.checked === true) {
      void handlePresentFullscreenClick(slideIndex);
      return;
    }

    enterPresentation('normal', slideIndex);
  }

  function handlePresentClick(): void {
    startPresentation(0);
  }

  function handleCloseClick(): void {
    exitPresentation();
  }

  function handleFullscreenPreferenceChange(): void {
    if (!fullscreenCheckbox) {
      return;
    }
    try {
      window.localStorage.setItem(
        FULLSCREEN_STORAGE_KEY,
        String(fullscreenCheckbox.checked),
      );
    } catch {
      // Ignore storage errors so the checkbox remains usable.
    }
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

    if (event.key === 'Shift') {
      isShiftPressed = true;
      setEraserMode(isAnnotating);
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

    if (!(event.target instanceof domView.Node)) {
      return;
    }

    move(1);
  }

  function getActiveSlide(): HTMLElement | null {
    return activeIndex >= 0 ? (slides[activeIndex] ?? null) : null;
  }

  function setAnnotationMode(enabled: boolean): void {
    isAnnotating = enabled;
    activeAnnotation = null;
    hideEraserPreview();
    document.body.classList.toggle('is-slides-annotating', enabled);
    setEraserMode(enabled && isShiftPressed);

    if (enabled) {
      showPresentationCursor();
    }
  }

  function setEraserMode(enabled: boolean): void {
    isErasing = enabled && isPresenting && isAnnotating;

    if (isErasing) {
      activeAnnotation = null;
    } else {
      hideEraserPreview();
    }

    document.body.classList.toggle('is-slides-erasing', isErasing);
  }

  function hideEraserPreview(): void {
    eraserPreview.hidden = true;
  }

  function showEraserPreview(event: PointerEvent): void {
    eraserPreview.hidden = false;
    eraserPreview.style.left = `${event.clientX}px`;
    eraserPreview.style.top = `${event.clientY}px`;
  }

  function toggleAnnotationMode(): void {
    setAnnotationMode(!isAnnotating);
  }

  function getViewportPoint(
    event: Pick<PointerEvent, 'clientX' | 'clientY'>,
  ): { x: number; y: number } | null {
    const width = window.innerWidth;
    const height = window.innerHeight;

    if (
      width <= 0 ||
      height <= 0 ||
      event.clientX < 0 ||
      event.clientX > width ||
      event.clientY < 0 ||
      event.clientY > height
    ) {
      return null;
    }

    return { x: event.clientX, y: event.clientY };
  }

  function getCanvasContext(
    canvas: HTMLCanvasElement,
  ): CanvasRenderingContext2D | null {
    try {
      return canvas.getContext('2d');
    } catch {
      return null;
    }
  }

  function getAnnotationState(slide: HTMLElement): SlideAnnotationState {
    const existing = annotationStates.get(slide);
    if (existing) {
      return existing;
    }

    const canvas = document.createElement('canvas');
    canvas.dataset.slidesAnnotations = '';
    canvas.dataset.slideIndex = slide.getAttribute('data-slide-index') ?? '';
    canvas.setAttribute('aria-hidden', 'true');
    canvas.hidden = slide !== getActiveSlide();
    annotationLayer.append(canvas);

    const state: SlideAnnotationState = { canvas, width: 0, height: 0, dpr: 1 };
    annotationStates.set(slide, state);
    resizeAnnotationCanvas(state);

    return state;
  }

  function resizeAnnotationCanvas(state: SlideAnnotationState): void {
    const width = Math.max(1, window.innerWidth);
    const height = Math.max(1, window.innerHeight);
    const dpr = Math.max(1, window.devicePixelRatio || 1);

    if (state.width === width && state.height === height && state.dpr === dpr) {
      return;
    }

    const priorCanvas =
      state.canvas.width > 0 && state.canvas.height > 0
        ? document.createElement('canvas')
        : null;
    if (priorCanvas) {
      priorCanvas.width = state.canvas.width;
      priorCanvas.height = state.canvas.height;
      priorCanvas.getContext('2d')?.drawImage(state.canvas, 0, 0);
    }

    state.width = width;
    state.height = height;
    state.dpr = dpr;
    state.canvas.width = Math.round(width * dpr);
    state.canvas.height = Math.round(height * dpr);

    if (priorCanvas) {
      getCanvasContext(state.canvas)?.drawImage(priorCanvas, 0, 0);
    }
  }

  function resizeActiveAnnotationCanvas(): void {
    const slide = getActiveSlide();
    if (!slide) {
      return;
    }

    const state = annotationStates.get(slide);
    if (state) {
      resizeAnnotationCanvas(state);
    }
  }

  function drawAnnotationStroke(
    ctx: CanvasRenderingContext2D,
    state: SlideAnnotationState,
    from: { x: number; y: number },
    to: { x: number; y: number },
  ): void {
    ctx.globalCompositeOperation = 'source-over';
    ctx.strokeStyle = ANNOTATION_COLOR;
    ctx.lineWidth = 3 * state.dpr;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(from.x * state.dpr, from.y * state.dpr);
    ctx.lineTo(to.x * state.dpr, to.y * state.dpr);
    ctx.stroke();
  }

  function drawAnnotationDot(
    ctx: CanvasRenderingContext2D,
    state: SlideAnnotationState,
    point: { x: number; y: number },
  ): void {
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = ANNOTATION_COLOR;
    ctx.beginPath();
    ctx.arc(
      point.x * state.dpr,
      point.y * state.dpr,
      1.5 * state.dpr,
      0,
      Math.PI * 2,
    );
    ctx.fill();
  }

  function drawAnnotationErase(
    ctx: CanvasRenderingContext2D,
    state: SlideAnnotationState,
    point: { x: number; y: number },
  ): void {
    const radius = ANNOTATION_ERASER_RADIUS * state.dpr;
    ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath();
    ctx.arc(point.x * state.dpr, point.y * state.dpr, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
  }

  function clearAnnotationCanvases(): void {
    for (const slide of slides) {
      annotationStates.get(slide)?.canvas.remove();
      annotationStates.delete(slide);
    }
    activeAnnotation = null;
    hideEraserPreview();
  }

  function updateActiveAnnotationCanvas(): void {
    const activeSlide = getActiveSlide();
    for (const slide of slides) {
      const state = annotationStates.get(slide);
      if (state) {
        state.canvas.hidden = slide !== activeSlide;
      }
    }
  }

  function handleAnnotationContextMenu(event: MouseEvent): void {
    if (!isPresenting) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    toggleAnnotationMode();
  }

  function handleAnnotationPointerDown(event: PointerEvent): void {
    if (!isPresenting || !isAnnotating || event.button !== 0) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    if (isErasing) {
      return;
    }

    const slide = getActiveSlide();
    if (!slide) {
      activeAnnotation = null;
      return;
    }

    const point = getViewportPoint(event);
    if (!point) {
      return;
    }

    const state = getAnnotationState(slide);
    resizeAnnotationCanvas(state);
    const ctx = getCanvasContext(state.canvas);
    if (ctx) {
      drawAnnotationDot(ctx, state, point);
    }
    activeAnnotation = { slide, previousX: point.x, previousY: point.y };

    const target =
      event.target instanceof domView.Element ? event.target : slide;
    target.setPointerCapture?.(event.pointerId);
  }

  function handleAnnotationPointerMove(event: PointerEvent): void {
    if (!isPresenting || !isAnnotating) {
      return;
    }

    if (isErasing) {
      handleAnnotationEraseMove(event);
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const point = getViewportPoint(event);
    if (!point) {
      activeAnnotation = null;
      return;
    }

    if (!activeAnnotation) {
      if ((event.buttons & 1) !== 1) {
        return;
      }
      const slide = getActiveSlide();
      if (!slide) {
        return;
      }
      activeAnnotation = { slide, previousX: point.x, previousY: point.y };
      return;
    }

    const state = getAnnotationState(activeAnnotation.slide);
    resizeAnnotationCanvas(state);
    const ctx = getCanvasContext(state.canvas);
    if (ctx) {
      drawAnnotationStroke(
        ctx,
        state,
        { x: activeAnnotation.previousX, y: activeAnnotation.previousY },
        point,
      );
    }
    activeAnnotation.previousX = point.x;
    activeAnnotation.previousY = point.y;
  }

  function handleAnnotationEraseMove(event: PointerEvent): void {
    const slide = getActiveSlide();
    if (!slide) {
      hideEraserPreview();
      return;
    }

    const point = getViewportPoint(event);
    if (!point) {
      hideEraserPreview();
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    showEraserPreview(event);

    const state = getAnnotationState(slide);
    resizeAnnotationCanvas(state);
    const ctx = getCanvasContext(state.canvas);
    if (ctx) {
      drawAnnotationErase(ctx, state, point);
    }
  }

  function handleAnnotationPointerUp(event: PointerEvent): void {
    if (!isPresenting || !isAnnotating || !activeAnnotation) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    activeAnnotation = null;
  }

  function handleKeyup(event: KeyboardEvent): void {
    if (event.key !== 'Shift') {
      return;
    }

    isShiftPressed = false;
    setEraserMode(false);
  }

  function handleWindowBlur(): void {
    isShiftPressed = false;
    setEraserMode(false);
  }

  function handleAnnotationClick(event: MouseEvent): void {
    if (!isPresenting || !isAnnotating || isDrivingTrace) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
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

  function handleSlidesPresent(event: Event): void {
    const detail = (event as CustomEvent<SlidesPresentDetail>).detail ?? {};
    const slideIndex =
      typeof detail.slideIndex === 'number' &&
      Number.isFinite(detail.slideIndex)
        ? detail.slideIndex
        : 0;

    startPresentation(slideIndex);
  }

  presentButton?.addEventListener('click', handlePresentClick);
  fullscreenCheckbox?.addEventListener(
    'change',
    handleFullscreenPreferenceChange,
  );
  closeButton.addEventListener('click', handleCloseClick);
  document.addEventListener('fullscreenchange', handleFullscreenChange);
  window.addEventListener('keydown', handleKeydown);
  window.addEventListener('keyup', handleKeyup);
  window.addEventListener('blur', handleWindowBlur);
  window.addEventListener('mousemove', handleMouseMove);
  window.addEventListener('resize', resizeActiveAnnotationCanvas);
  window.addEventListener('pointermove', handleAnnotationPointerMove);
  window.addEventListener('pointerup', handleAnnotationPointerUp);
  window.addEventListener('pointercancel', handleAnnotationPointerUp);
  slidesRoot.addEventListener('click', handleAnnotationClick, true);
  slidesRoot.addEventListener('click', handleSlideClick);
  slidesRoot.addEventListener('contextmenu', handleAnnotationContextMenu);
  slidesRoot.addEventListener('pointerdown', handleAnnotationPointerDown);
  slidesRoot.addEventListener('tada:slides-present', handleSlidesPresent);

  return () => {
    exitPresentation();
    presentButton?.removeEventListener('click', handlePresentClick);
    fullscreenCheckbox?.removeEventListener(
      'change',
      handleFullscreenPreferenceChange,
    );
    closeButton.removeEventListener('click', handleCloseClick);
    document.removeEventListener('fullscreenchange', handleFullscreenChange);
    window.removeEventListener('keydown', handleKeydown);
    window.removeEventListener('keyup', handleKeyup);
    window.removeEventListener('blur', handleWindowBlur);
    window.removeEventListener('mousemove', handleMouseMove);
    window.removeEventListener('resize', resizeActiveAnnotationCanvas);
    window.removeEventListener('pointermove', handleAnnotationPointerMove);
    window.removeEventListener('pointerup', handleAnnotationPointerUp);
    window.removeEventListener('pointercancel', handleAnnotationPointerUp);
    slidesRoot.removeEventListener('click', handleAnnotationClick, true);
    slidesRoot.removeEventListener('click', handleSlideClick);
    slidesRoot.removeEventListener('contextmenu', handleAnnotationContextMenu);
    slidesRoot.removeEventListener('pointerdown', handleAnnotationPointerDown);
    slidesRoot.removeEventListener('tada:slides-present', handleSlidesPresent);
    overlay.remove();
    eraserPreview.remove();
    annotationLayer.remove();
  };
}
