import { globals } from '../globals';
import { getHashTarget } from '../hash-target';
import { isScrollRestored } from '../navigate/restored-scroll';
import { panelsAround, revealInTabs } from '../tabs';
import { applyBasePath } from '../util';
import { HIGHLIGHT_PARAM } from './param';

const CLASS_NAME = 'search-highlight';

// A sweep moves at a steady pace, like a highlighter dragged across the text,
// within bounds so short words still read as a stroke and long passages do
// not drag on
const MS_PER_CHARACTER = 12;
const MIN_SWEEP_MS = 150;
const MAX_SWEEP_MS = 1200;
// The pause between strokes, as if lifting the highlighter
const GAP_MS = 60;
// Every highlight finishes within this time of coming into view. Highlights
// that appear together are sped up evenly when there are many.
const BATCH_MS = 1000;
// Highlights that appear while earlier ones are still sweeping wait at most
// this long for them before starting
const MAX_WAIT_MS = 300;

interface PagefindHighlightOptions {
  highlightParam: string;
  markContext: null;
  markOptions: { className: string; exclude: string[] };
  addStyles: boolean;
}

type PagefindHighlightModule = {
  default: new (options: PagefindHighlightOptions) => unknown;
};

/**
 * Pagefind marks each search word separately. Words separated only by spaces
 * join into one mark, so a matched phrase sweeps as a single stroke that
 * continues onto the next line where it wraps.
 */
function joinAdjacentMarks(document: Document): void {
  const selector = `mark.${CLASS_NAME}`;
  const isMark = (node: Node | null): node is HTMLElement =>
    node != null &&
    node.nodeType === node.ELEMENT_NODE &&
    (node as Element).matches(selector);
  const isSpace = (node: Node | null): node is Text =>
    node != null &&
    node.nodeType === node.TEXT_NODE &&
    /^\s+$/.test(node.textContent ?? '');

  for (const mark of document.querySelectorAll<HTMLElement>(selector)) {
    if (!mark.isConnected) {
      continue;
    }
    let gap = mark.nextSibling;
    while (isSpace(gap) && isMark(gap.nextSibling)) {
      const next = gap.nextSibling;
      mark.append(gap, ...next.childNodes);
      next.remove();
      gap = mark.nextSibling;
    }
  }
}

/** Whether a closed <details> hides the element (its summary stays shown) */
function isInClosedDetails(element: Element): boolean {
  let details = element.closest('details');
  while (details) {
    if (
      !details.hasAttribute('open') &&
      !details.querySelector(':scope > summary')?.contains(element)
    ) {
      return true;
    }
    details = details.parentElement?.closest('details') ?? null;
  }
  return false;
}

function sweepDuration(mark: HTMLElement): number {
  const length = mark.textContent?.length ?? 0;
  return Math.min(
    MAX_SWEEP_MS,
    Math.max(MIN_SWEEP_MS, length * MS_PER_CHARACTER),
  );
}

export default async (window: Window) => {
  const document = window.document;
  const page = window.location.pathname + window.location.search;
  const terms = new URLSearchParams(window.location.search).getAll(
    HIGHLIGHT_PARAM,
  );
  if (!terms.some(term => term.trim() !== '')) {
    return;
  }

  // Pagefind's own matcher marks the same words its index matched
  const { default: PagefindHighlight } = (await globals.importModule(
    applyBasePath('/pagefind/pagefind-highlight.js'),
  )) as PagefindHighlightModule;
  // Fragment changes stay on the same page
  if (window.location.pathname + window.location.search !== page) {
    return;
  }
  new PagefindHighlight({
    highlightParam: HIGHLIGHT_PARAM,
    markContext: null,
    markOptions: {
      className: CLASS_NAME,
      exclude: [
        '[data-pagefind-ignore]',
        '[data-pagefind-ignore] *',
        // Never shown: the code page entries that exist only for search, and
        // the MathML copy of math, which is for assistive technology
        '.code-search-index',
        '.code-search-index *',
        '.katex-mathml',
        '.katex-mathml *',
      ],
    },
    addStyles: false,
  });
  joinAdjacentMarks(document);

  const marks = Array.from(
    document.querySelectorAll<HTMLElement>(`mark.${CLASS_NAME}`),
  );
  if (marks.length === 0) {
    return;
  }

  // Show the first highlight at or after the link's target, opening any tabs
  // that hide it. Highlights in a closed <details> stay hidden, and so do
  // those in a tab whose selection would hide the target.
  const target = getHashTarget(document, window.location.hash);
  const targetPanels = target ? panelsAround(target) : [];
  const canReveal = (mark: HTMLElement) =>
    !isInClosedDetails(mark) &&
    panelsAround(mark).every(panel =>
      targetPanels.every(
        other => other === panel || other.parentElement !== panel.parentElement,
      ),
    );
  const first = marks.find(
    mark =>
      (!target ||
        target.contains(mark) ||
        target.compareDocumentPosition(mark) &
          mark.DOCUMENT_POSITION_FOLLOWING) &&
      canReveal(mark),
  );
  if (first) {
    revealInTabs(window, first);
    // Back, Forward, and dev refreshes restore the page's own scroll position
    if (!target && !isScrollRestored()) {
      first.scrollIntoView({ block: 'center' });
    }
  }

  // Each highlight sweeps on when it first comes into view. Highlights that
  // appear together sweep one after another in reading order.
  marks.forEach(mark => mark.setAttribute('data-sweep', 'pending'));
  const waiting = new Set(marks);
  let nextStart = 0;
  const observer = globals.createIntersectionObserver(entries => {
    const visible = entries
      .map(entry => entry.target as HTMLElement)
      .filter((mark, i) => entries[i].isIntersecting && waiting.has(mark))
      .sort((a, b) =>
        a.compareDocumentPosition(b) & a.DOCUMENT_POSITION_FOLLOWING ? -1 : 1,
      );
    const now = globals.now();
    const durations = visible.map(sweepDuration);
    const total =
      durations.reduce((sum, duration) => sum + duration, 0) +
      GAP_MS * (visible.length - 1);
    let start = Math.min(MAX_WAIT_MS, Math.max(0, nextStart - now));
    const scale = Math.min(1, (BATCH_MS - start) / total);
    // Rounding down keeps every stroke within the budget and in order
    visible.forEach((mark, i) => {
      waiting.delete(mark);
      const duration = durations[i] * scale;
      mark.style.setProperty(
        '--search-highlight-delay',
        `${Math.floor(start)}ms`,
      );
      mark.style.setProperty(
        '--search-highlight-duration',
        `${Math.floor(duration)}ms`,
      );
      mark.setAttribute('data-sweep', 'run');
      start += duration + GAP_MS * scale;
    });
    if (visible.length > 0) {
      nextStart = now + start;
    }
    if (waiting.size === 0) {
      observer.disconnect();
    }
  });
  marks.forEach(mark => observer.observe(mark));

  return () => {
    observer.disconnect();
  };
};
