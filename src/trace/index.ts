import type { TraceManifest, TraceStep } from './types';
import {
  updateSourceHighlight,
  renderMemoryDiagram,
  updateStepControls,
} from './renderer';

interface WidgetState {
  manifest: TraceManifest;
  chunks: Map<number, TraceStep[]>;
  currentStep: number;
  prevDiagramW: number;
  prevDiagramH: number;
}

interface WidgetElements {
  root: HTMLElement;
  source: HTMLElement;
  controls: HTMLElement;
  output: HTMLElement;
  diagram: HTMLElement;
}

function getStep(state: WidgetState): TraceStep {
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
  const chunk: TraceStep[] = await res.json();
  state.chunks.set(chunkIndex, chunk);
}

async function goToStep(
  state: WidgetState,
  elements: WidgetElements,
  manifestUrl: string,
  stepIndex: number,
): Promise<void> {
  stepIndex = Math.max(0, Math.min(stepIndex, state.manifest.totalSteps - 1));
  const lastChunk = Math.floor(stepIndex / state.manifest.chunkSize);
  const loads: Promise<void>[] = [];
  for (let i = 0; i <= lastChunk; i++) {
    loads.push(loadChunk(state, manifestUrl, i));
  }
  await Promise.all(loads);
  state.currentStep = stepIndex;
  renderWidgetState(state, elements);
}

function renderWidgetState(state: WidgetState, elements: WidgetElements): void {
  const step = getStep(state);
  updateSourceHighlight(elements.source, step.line);
  updateStepControls(
    elements.controls,
    state.currentStep,
    state.manifest.totalSteps,
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

  const result = renderMemoryDiagram(elements.diagram, step);
  if (result) {
    const { width: newW, height: newH } = result;
    if (newW > state.prevDiagramW || newH > state.prevDiagramH) {
      elements.diagram.scrollTo({
        left: newH > state.prevDiagramH ? 0 : newW,
        top: newH > state.prevDiagramH ? newH : elements.diagram.scrollTop,
        behavior: 'smooth',
      });
    }
    state.prevDiagramW = newW;
    state.prevDiagramH = newH;
  }
}

const activeWidgets: { state: WidgetState; elements: WidgetElements }[] = [];

async function initWidget(root: HTMLElement): Promise<void> {
  const manifestUrl = root.dataset.traceManifest;
  if (!manifestUrl) {
    return;
  }

  const res = await fetch(manifestUrl);
  const manifest: TraceManifest = await res.json();

  const state: WidgetState = {
    manifest,
    chunks: new Map(),
    currentStep: 0,
    prevDiagramW: 0,
    prevDiagramH: 0,
  };

  await loadChunk(state, manifestUrl, 0);

  const step = getStep(state);

  const source = root.querySelector('.trace-source') as HTMLElement;
  const diagram = root.querySelector('.trace-diagram') as HTMLElement;
  const output = root.querySelector('.trace-output') as HTMLPreElement;
  output.textContent = step.stdout || '';

  const controls = root.querySelector('.trace-controls') as HTMLElement;
  const firstBtn = controls.querySelector('.trace-first') as HTMLButtonElement;
  const prevBtn = controls.querySelector('.trace-prev') as HTMLButtonElement;
  const nextBtn = controls.querySelector('.trace-next') as HTMLButtonElement;
  const lastBtn = controls.querySelector('.trace-last') as HTMLButtonElement;
  firstBtn.addEventListener('click', () =>
    goToStep(state, elements, manifestUrl, 0),
  );
  prevBtn.addEventListener('click', () =>
    goToStep(state, elements, manifestUrl, state.currentStep - 1),
  );
  nextBtn.addEventListener('click', () =>
    goToStep(state, elements, manifestUrl, state.currentStep + 1),
  );
  lastBtn.addEventListener('click', () =>
    goToStep(state, elements, manifestUrl, manifest.totalSteps - 1),
  );

  const btns = [firstBtn, prevBtn, nextBtn, lastBtn];
  controls.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') {
      return;
    }
    const enabled = btns.filter(b => !b.disabled);
    const idx = enabled.indexOf(document.activeElement as HTMLButtonElement);
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

  updateStepControls(controls, state.currentStep, manifest.totalSteps);

  const initResult = renderMemoryDiagram(diagram, step);
  if (initResult) {
    state.prevDiagramW = initResult.width;
    state.prevDiagramH = initResult.height;
  }
  updateSourceHighlight(source, step.line);

  activeWidgets.push({ state, elements });
}

export default function mountTrace(window: Window): void {
  const widgets = window.document.querySelectorAll('.trace-widget');

  if (widgets.length === 0) {
    return;
  }

  for (const widget of widgets) {
    initWidget(widget as HTMLElement);
  }

  window
    .matchMedia('(prefers-color-scheme: dark)')
    .addEventListener('change', () => {
      for (const { state, elements } of activeWidgets) {
        renderMemoryDiagram(elements.diagram, getStep(state));
      }
    });
}
