import type { TraceManifest, TraceChunkEntry } from './types';
import { globals } from '../globals';

interface WidgetState {
  manifest: TraceManifest;
  chunks: Map<number, TraceChunkEntry[]>;
  currentStep: number;
}

interface WidgetElements {
  root: HTMLElement;
  source: HTMLElement;
  controls: HTMLElement;
  content: HTMLElement;
  diagram: HTMLElement;
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

function updateOutput(
  content: HTMLElement,
  output: string,
  doc: Document,
): void {
  const existing = content.querySelector(
    ':scope > .trace-output',
  ) as HTMLPreElement | null;
  if (!output) {
    existing?.remove();
    return;
  }

  const outputElement = existing ?? doc.createElement('pre');
  if (!existing) {
    outputElement.className = 'trace-output';
    content.append(outputElement);
  }
  outputElement.textContent = output;
}

function renderWidgetState(
  state: WidgetState,
  elements: WidgetElements,
  doc: Document,
): void {
  const entry = getStep(state);
  updateSourceHighlight(elements.source, entry.line);
  updateStepControls(
    elements.controls,
    state.currentStep,
    state.manifest.totalSteps,
    doc,
  );
  let output = '';
  for (let i = 0; i <= state.currentStep; i++) {
    const ci = Math.floor(i / state.manifest.chunkSize);
    const off = i % state.manifest.chunkSize;
    const s = state.chunks.get(ci)![off];
    if (s.stdout) {
      output += s.stdout;
    }
  }
  updateOutput(elements.content, output, doc);

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

  const source = root.querySelector('.trace-source') as HTMLElement;
  const content = root.querySelector('.trace-content') as HTMLElement;
  const diagram = root.querySelector('.trace-diagram') as HTMLElement;

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

  const elements: WidgetElements = { root, source, controls, content, diagram };

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
