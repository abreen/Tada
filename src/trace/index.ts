import type { TraceManifest, TraceChunkEntry } from './types';

interface WidgetState {
  manifest: TraceManifest;
  chunks: Map<number, TraceChunkEntry[]>;
  currentStep: number;
}

interface WidgetElements {
  root: HTMLElement;
  source: HTMLElement;
  controls: HTMLElement;
  output: HTMLElement;
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
  const res = await fetch(url);
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
  panel.querySelectorAll('.line-number').forEach(ln => {
    ln.classList.remove('trace-line-active');
  });
  const el = panel.querySelector(`.line-number[data-line="${currentLine}"]`);
  if (el) {
    el.classList.add('trace-line-active');
    const elRect = el.getBoundingClientRect();
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
  elements.output.textContent = output;

  const prevHeight = elements.diagram.scrollHeight;
  elements.diagram.innerHTML = entry.svg;

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

  const res = await fetch(manifestUrl);
  const manifest: TraceManifest = await res.json();

  const state: WidgetState = { manifest, chunks: new Map(), currentStep: 0 };

  await loadChunk(state, manifestUrl, 0);

  const entry = getStep(state);

  const source = root.querySelector('.trace-source') as HTMLElement;
  const diagram = root.querySelector('.trace-diagram') as HTMLElement;
  const output = root.querySelector('.trace-output') as HTMLPreElement;
  output.textContent = entry.stdout || '';

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

  const elements: WidgetElements = { root, source, controls, output, diagram };

  updateStepControls(controls, state.currentStep, manifest.totalSteps, doc);

  diagram.innerHTML = entry.svg;
  updateSourceHighlight(source, entry.line);
}

export default function mountTrace(window: Window): void {
  const widgets = window.document.querySelectorAll('.trace-widget');

  if (widgets.length === 0) {
    return;
  }

  for (const widget of widgets) {
    initWidget(widget as HTMLElement, window.document);
  }
}
