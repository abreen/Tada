import type { TraceManifest, TraceChunkEntry, TraceOutputEvent } from './types';
import { globals } from '../globals';

interface WidgetState {
  manifest: TraceManifest;
  chunks: Map<number, TraceChunkEntry[]>;
  currentStep: number;
}

interface TraceResizeState {
  sourceHeight: number | null;
  dragStartY: number | null;
  dragStartSourceHeight: number;
}

interface WidgetElements {
  root: HTMLElement;
  sourceWrapper: HTMLElement;
  controls: HTMLElement;
  content: HTMLElement;
  diagram: HTMLElement;
  resizer: HTMLElement | null;
  resizeState: TraceResizeState;
}

function getStep(state: WidgetState): TraceChunkEntry {
  const chunkIndex = Math.floor(state.currentStep / state.manifest.chunkSize);
  const offset = state.currentStep % state.manifest.chunkSize;
  return state.chunks.get(chunkIndex)![offset];
}

function chunkUrlFromManifest(manifestUrl: string, chunkIndex: number): string {
  return manifestUrl.replace('manifest.json', `chunk-${chunkIndex}.json`);
}

async function loadChunk(
  state: WidgetState,
  manifestUrl: string,
  chunkIndex: number,
): Promise<void> {
  if (state.chunks.has(chunkIndex)) {
    return;
  }
  const url = chunkUrlFromManifest(manifestUrl, chunkIndex);
  const res = await globals.fetch(url);
  const chunk: TraceChunkEntry[] = await res.json();
  state.chunks.set(chunkIndex, chunk);
}

async function goToStep(
  state: WidgetState,
  elements: WidgetElements,
  manifestUrl: string,
  stepIndex: number,
  doc: Document,
): Promise<void> {
  stepIndex = Math.max(0, Math.min(stepIndex, state.manifest.totalSteps - 1));
  const lastChunk = Math.floor(stepIndex / state.manifest.chunkSize);
  const loads: Promise<void>[] = [];
  for (let i = 0; i <= lastChunk; i++) {
    loads.push(loadChunk(state, manifestUrl, i));
  }
  await Promise.all(loads);
  state.currentStep = stepIndex;
  renderWidgetState(state, elements, doc);
}

function updateSourceHighlight(panel: HTMLElement, currentLine: number): void {
  panel
    .querySelectorAll(
      '.code-row.trace-line-active, .line-number.trace-line-active',
    )
    .forEach(el => {
      el.classList.remove('trace-line-active');
    });
  const lineNumber = panel.querySelector(
    `.line-number[data-line="${currentLine}"]`,
  );
  const row = lineNumber?.closest('.code-row') as HTMLElement | null;
  if (row) {
    row.classList.add('trace-line-active');
    const elRect = row.getBoundingClientRect();
    const panelRect = panel.getBoundingClientRect();
    panel.scrollTop += elRect.top - panelRect.top - panel.clientHeight / 2;
  }
}

function updateVisibleSourcePanel(
  sourceWrapper: HTMLElement,
  currentFile: string,
): HTMLElement | null {
  let activePanel: HTMLElement | null = null;
  sourceWrapper.querySelectorAll('.trace-source').forEach(panel => {
    const sourcePanel = panel as HTMLElement;
    const matches = sourcePanel.dataset.traceSourceFile === currentFile;
    sourcePanel.hidden = !matches;
    if (matches) {
      activePanel = sourcePanel;
    }
  });
  return activePanel;
}

function updateStepControls(
  container: HTMLElement,
  currentStep: number,
  totalSteps: number,
  doc: Document,
): void {
  const counter = container.querySelector(
    '.trace-step-counter',
  ) as HTMLElement | null;
  if (counter) {
    counter.textContent = `${currentStep + 1}/${totalSteps}`;
    const digits = String(totalSteps).length;
    counter.style.minWidth = `${digits * 2 + 1}ch`;
  }
  const first = container.querySelector('.trace-first') as HTMLButtonElement;
  const prev = container.querySelector('.trace-prev') as HTMLButtonElement;
  const next = container.querySelector('.trace-next') as HTMLButtonElement;
  const last = container.querySelector('.trace-last') as HTMLButtonElement;
  const btns = [first, prev, next, last];

  const focused = doc.activeElement;

  if (first) {
    first.disabled = currentStep === 0;
  }
  if (prev) {
    prev.disabled = currentStep === 0;
  }
  if (next) {
    next.disabled = currentStep >= totalSteps - 1;
  }
  if (last) {
    last.disabled = currentStep >= totalSteps - 1;
  }

  // When a clicked button becomes disabled, the browser removes focus.
  // Move focus to a sensible sibling so the outline stays visible.
  if (
    focused &&
    'disabled' in focused &&
    (focused as HTMLButtonElement).disabled
  ) {
    if (focused === first || focused === prev) {
      next?.focus();
    } else if (focused === next || focused === last) {
      prev?.focus();
    }
  }

  // Roving tabindex: the focused button is the Tab stop.
  const currentFocus = doc.activeElement;
  const enabled = btns.filter(b => b && !b.disabled);
  const focusedBtn = enabled.find(b => b === currentFocus);
  for (const b of enabled) {
    b.tabIndex = b === focusedBtn ? 0 : -1;
  }
  if (!focusedBtn && enabled.length > 0) {
    enabled[0].tabIndex = 0;
  }
  for (const b of btns) {
    if (b && b.disabled) {
      b.tabIndex = -1;
    }
  }
}

function parsePositiveNumber(
  rawValue: string | null | undefined,
): number | null {
  if (!rawValue) {
    return null;
  }

  const parsed = Number.parseFloat(rawValue);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function getPresentationScale(diagram: HTMLElement, doc: Document): number {
  if (!doc.body.classList.contains('is-presenting')) {
    return 1;
  }

  const view = doc.defaultView;
  const traceWidget = diagram.closest('.trace-widget') as HTMLElement | null;
  const traceFontSize = parsePositiveNumber(
    traceWidget && view ? view.getComputedStyle(traceWidget).fontSize : null,
  );
  const baseFontSize = parsePositiveNumber(
    view ? view.getComputedStyle(doc.body).fontSize : null,
  );
  if (traceFontSize && baseFontSize) {
    return traceFontSize / baseFontSize;
  }

  return 1;
}

function scaleDiagramSvg(diagram: HTMLElement, doc: Document): void {
  const svg = diagram.querySelector('.trace-memory') as SVGElement | null;
  if (!svg) {
    return;
  }

  const width = svg.dataset.traceBaseWidth ?? svg.getAttribute('width');
  const height = svg.dataset.traceBaseHeight ?? svg.getAttribute('height');
  if (!width || !height) {
    return;
  }

  svg.dataset.traceBaseWidth = width;
  svg.dataset.traceBaseHeight = height;

  const baseWidth = Number.parseFloat(width);
  const baseHeight = Number.parseFloat(height);
  if (!Number.isFinite(baseWidth) || !Number.isFinite(baseHeight)) {
    return;
  }

  const scale = getPresentationScale(diagram, doc);
  svg.setAttribute('width', String(baseWidth * scale));
  svg.setAttribute('height', String(baseHeight * scale));
}

function parseCssPixelValue(rawValue: string | null | undefined): number {
  if (!rawValue || rawValue === 'none') {
    return 0;
  }

  const parsed = Number.parseFloat(rawValue);
  return Number.isFinite(parsed) ? parsed : 0;
}

function elementHeight(element: HTMLElement | null): number {
  if (!element) {
    return 0;
  }

  return element.getBoundingClientRect().height || element.clientHeight;
}

function getTraceContentGap(content: HTMLElement, doc: Document): number {
  const view = doc.defaultView;
  if (!view) {
    return 0;
  }

  const styles = view.getComputedStyle(content);
  return parseCssPixelValue(styles.rowGap || styles.gap);
}

function getVisibleSourceContentHeight(
  sourceWrapper: HTMLElement,
): number | null {
  const visibleSource = Array.from(
    sourceWrapper.querySelectorAll('.trace-source'),
  ).find(source => !(source as HTMLElement).hidden) as HTMLElement | undefined;

  if (!visibleSource) {
    return null;
  }

  return visibleSource.scrollHeight > 0 ? visibleSource.scrollHeight : null;
}

function getResizableSourceBounds(
  elements: WidgetElements,
  doc: Document,
): { min: number; max: number } {
  const view = doc.defaultView;
  const sourceStyles = view?.getComputedStyle(elements.sourceWrapper);
  const diagramStyles = view?.getComputedStyle(elements.diagram);
  const minSourceHeight = Math.max(
    0,
    parseCssPixelValue(sourceStyles?.minHeight),
  );
  const minDiagramHeight = Math.max(
    0,
    parseCssPixelValue(diagramStyles?.minHeight),
  );
  const contentHeight = elementHeight(elements.content);
  if (contentHeight === 0) {
    return { min: minSourceHeight, max: Number.POSITIVE_INFINITY };
  }

  const directChildren = Array.from(elements.content.children).filter(
    child => !child.hasAttribute('hidden'),
  ).length;
  const gapTotal =
    Math.max(0, directChildren - 1) * getTraceContentGap(elements.content, doc);
  const output = elements.content.querySelector(
    ':scope > .trace-output',
  ) as HTMLElement | null;
  const fixedHeight = elementHeight(elements.resizer) + elementHeight(output);
  const layoutMaxSourceHeight =
    contentHeight - minDiagramHeight - fixedHeight - gapTotal;
  const contentMaxSourceHeight = getVisibleSourceContentHeight(
    elements.sourceWrapper,
  );
  const maxSourceHeight =
    contentMaxSourceHeight === null
      ? layoutMaxSourceHeight
      : Math.min(layoutMaxSourceHeight, contentMaxSourceHeight);

  return {
    min: minSourceHeight,
    max: Math.max(minSourceHeight, maxSourceHeight),
  };
}

function applySourceHeight(
  elements: WidgetElements,
  doc: Document,
  nextHeight: number,
): void {
  const bounds = getResizableSourceBounds(elements, doc);
  const sourceHeight = Math.min(Math.max(nextHeight, bounds.min), bounds.max);
  elements.resizeState.sourceHeight = sourceHeight;
  elements.sourceWrapper.style.flex = `0 0 ${sourceHeight}px`;
  elements.sourceWrapper.style.maxHeight = 'none';
}

function reclampSourceHeight(elements: WidgetElements, doc: Document): void {
  if (elements.resizeState.sourceHeight === null) {
    return;
  }

  applySourceHeight(elements, doc, elements.resizeState.sourceHeight);
}

function setupTraceResizer(elements: WidgetElements, doc: Document): void {
  const resizer = elements.resizer;
  if (!resizer) {
    return;
  }

  resizer.addEventListener('pointerdown', (event: PointerEvent) => {
    if (event.button !== 0) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    elements.resizeState.dragStartY = event.clientY;
    elements.resizeState.dragStartSourceHeight = elementHeight(
      elements.sourceWrapper,
    );
    resizer.setPointerCapture?.(event.pointerId);
  });

  resizer.addEventListener('pointermove', (event: PointerEvent) => {
    const dragStartY = elements.resizeState.dragStartY;
    if (dragStartY === null) {
      return;
    }

    if ((event.buttons & 1) !== 1) {
      elements.resizeState.dragStartY = null;
      resizer.releasePointerCapture?.(event.pointerId);
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    const deltaY = event.clientY - dragStartY;
    applySourceHeight(
      elements,
      doc,
      elements.resizeState.dragStartSourceHeight - deltaY,
    );
  });

  const endDrag = (event: PointerEvent): void => {
    if (elements.resizeState.dragStartY === null) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    elements.resizeState.dragStartY = null;
    resizer.releasePointerCapture?.(event.pointerId);
  };

  resizer.addEventListener('pointerup', endDrag);
  resizer.addEventListener('pointercancel', endDrag);
  resizer.addEventListener('click', (event: MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
  });

  resizer.addEventListener('keydown', (event: KeyboardEvent) => {
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') {
      return;
    }

    event.preventDefault();
    const currentHeight =
      elements.resizeState.sourceHeight ??
      elementHeight(elements.sourceWrapper);
    const step = event.shiftKey ? 40 : 10;
    const direction = event.key === 'ArrowUp' ? 1 : -1;
    applySourceHeight(elements, doc, currentHeight + direction * step);
  });
}

function updateOutput(
  content: HTMLElement,
  output: TraceOutputEvent[],
  doc: Document,
): void {
  const existing = content.querySelector(
    ':scope > .trace-output',
  ) as HTMLPreElement | null;
  if (output.length === 0) {
    existing?.remove();
    return;
  }

  const outputElement = existing ?? doc.createElement('pre');
  if (!existing) {
    outputElement.className = 'trace-output';
    content.append(outputElement);
  }
  outputElement.replaceChildren(
    ...output.map(event => {
      const span = doc.createElement('span');
      if (event.stream === 'stderr') {
        span.className = 'trace-output-stderr';
      }
      span.textContent = event.text;
      return span;
    }),
  );
}

function renderWidgetState(
  state: WidgetState,
  elements: WidgetElements,
  doc: Document,
): void {
  const entry = getStep(state);
  const sourcePanel = updateVisibleSourcePanel(
    elements.sourceWrapper,
    entry.file,
  );
  if (sourcePanel) {
    updateSourceHighlight(sourcePanel, entry.line);
  }
  updateStepControls(
    elements.controls,
    state.currentStep,
    state.manifest.totalSteps,
    doc,
  );
  const output: TraceOutputEvent[] = [];
  for (let i = 0; i <= state.currentStep; i++) {
    const ci = Math.floor(i / state.manifest.chunkSize);
    const off = i % state.manifest.chunkSize;
    const s = state.chunks.get(ci)![off];
    output.push(...(s.output ?? []));
  }
  updateOutput(elements.content, output, doc);
  reclampSourceHeight(elements, doc);

  const prevHeight = elements.diagram.scrollHeight;
  elements.diagram.innerHTML = entry.svg;
  scaleDiagramSvg(elements.diagram, doc);

  // If the diagram grew past the visible area, scroll to show the new content
  if (elements.diagram.scrollHeight > prevHeight) {
    elements.diagram.scrollTop =
      elements.diagram.scrollHeight - elements.diagram.clientHeight;
  }
}

async function initWidget(root: HTMLElement, doc: Document): Promise<void> {
  const manifestUrl = root.dataset.traceManifest;
  if (!manifestUrl) {
    return;
  }

  let res: Response;
  try {
    res = await globals.fetch(manifestUrl);
  } catch {
    return;
  }
  if (!res.ok) {
    return;
  }
  const manifest: TraceManifest = await res.json();

  const state: WidgetState = { manifest, chunks: new Map(), currentStep: 0 };

  await loadChunk(state, manifestUrl, 0);

  const sourceWrapper = root.querySelector(
    '.trace-source-wrapper',
  ) as HTMLElement;
  const content = root.querySelector('.trace-content') as HTMLElement;
  const diagram = root.querySelector('.trace-diagram') as HTMLElement;
  const resizer = root.querySelector('.trace-resizer') as HTMLElement | null;

  const controls = root.querySelector('.trace-controls') as HTMLElement;
  const firstBtn = controls.querySelector('.trace-first') as HTMLButtonElement;
  const prevBtn = controls.querySelector('.trace-prev') as HTMLButtonElement;
  const nextBtn = controls.querySelector('.trace-next') as HTMLButtonElement;
  const lastBtn = controls.querySelector('.trace-last') as HTMLButtonElement;
  firstBtn.addEventListener('click', () =>
    goToStep(state, elements, manifestUrl, 0, doc),
  );
  prevBtn.addEventListener('click', () =>
    goToStep(state, elements, manifestUrl, state.currentStep - 1, doc),
  );
  nextBtn.addEventListener('click', () =>
    goToStep(state, elements, manifestUrl, state.currentStep + 1, doc),
  );
  lastBtn.addEventListener('click', () =>
    goToStep(state, elements, manifestUrl, manifest.totalSteps - 1, doc),
  );

  const btns = [firstBtn, prevBtn, nextBtn, lastBtn];
  controls.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') {
      return;
    }
    const enabled = btns.filter(b => !b.disabled);
    const idx = enabled.indexOf(doc.activeElement as HTMLButtonElement);
    if (idx < 0) {
      return;
    }
    e.preventDefault();
    const next =
      e.key === 'ArrowRight'
        ? enabled[(idx + 1) % enabled.length]
        : enabled[(idx - 1 + enabled.length) % enabled.length];
    for (const b of enabled) {
      b.tabIndex = -1;
    }
    next.tabIndex = 0;
    next.focus();
  });

  const elements: WidgetElements = {
    root,
    sourceWrapper,
    controls,
    content,
    diagram,
    resizer,
    resizeState: {
      sourceHeight: null,
      dragStartY: null,
      dragStartSourceHeight: 0,
    },
  };

  setupTraceResizer(elements, doc);
  renderWidgetState(state, elements, doc);
}

export default function mountTrace(window: Window): void | (() => void) {
  const widgets = window.document.querySelectorAll('.trace-widget');

  if (widgets.length === 0) {
    return;
  }

  const refreshDiagramScales = (): void => {
    for (const widget of widgets) {
      const diagram = (widget as HTMLElement).querySelector(
        '.trace-diagram',
      ) as HTMLElement | null;
      if (diagram) {
        scaleDiagramSvg(diagram, window.document);
      }
    }
  };

  const MutationObserverCtor = (window as Window & typeof globalThis)
    .MutationObserver;
  const bodyClassObserver = MutationObserverCtor
    ? new MutationObserverCtor(() => {
        refreshDiagramScales();
      })
    : null;

  bodyClassObserver?.observe(window.document.body, {
    attributes: true,
    attributeFilter: ['class'],
  });

  for (const widget of widgets) {
    initWidget(widget as HTMLElement, window.document);
  }

  return () => {
    bodyClassObserver?.disconnect();
  };
}
