import { parseHTML } from 'linkedom';

export type IssueKind = 'spelling' | 'grammar';

/** A problem found in a block's text, as UTF-16 offsets into that text */
export interface TextIssue {
  start: number;
  end: number;
  kind: IssueKind;
  /** What is wrong, as plain text */
  message?: string;
  /** What is wrong, as HTML */
  messageHtml?: string;
}

/** Finds the problems in the text of one block, such as a paragraph */
export type CheckText = (text: string) => Promise<TextIssue[]>;

/** A message to the proofreading worker */
export type ProofreadRequest =
  | { type: 'words'; words: string[] }
  | { type: 'check'; id: number; text: string };

/** A message from the proofreading worker */
export type ProofreadResponse =
  | { type: 'issues'; id: number; issues: TextIssue[] }
  /** Harper failed to load, or to check the text of request `id` */
  | { type: 'failed'; id?: number; message: string };

const SPELLING_KINDS = new Set(['Spelling', 'Typo']);

/** Maps code point offsets, which Harper reports, to UTF-16 offsets */
export function toUtf16Offsets(text: string): (offset: number) => number {
  if (!/[\uD800-\uDFFF]/.test(text)) {
    return offset => offset;
  }
  const offsets: number[] = [];
  let utf16 = 0;
  for (const char of text) {
    offsets.push(utf16);
    utf16 += char.length;
  }
  offsets.push(utf16);
  return offset => offsets[Math.min(offset, offsets.length - 1)];
}

/** Converts Harper's lints, with code point spans and lint kinds, to issues */
export function toTextIssues(
  text: string,
  lints: {
    start: number;
    end: number;
    kind: string;
    message: string;
    messageHtml: string;
  }[],
): TextIssue[] {
  const toUtf16 = toUtf16Offsets(text);
  return lints.map(lint => ({
    start: toUtf16(lint.start),
    end: toUtf16(lint.end),
    kind: SPELLING_KINDS.has(lint.kind) ? 'spelling' : 'grammar',
    message: lint.message,
    messageHtml: lint.messageHtml,
  }));
}

// Same red and green as multiple-choice question results
const PROOFREAD_CSS =
  ':root{--proofread-spelling-color:hsl(0deg 72% 48%);--proofread-grammar-color:hsl(142deg 58% 36%)}' +
  '@media (prefers-color-scheme:dark){:root{--proofread-spelling-color:hsl(0deg 82% 62%);--proofread-grammar-color:hsl(142deg 58% 52%)}}' +
  '.proofread-spelling,.proofread-grammar{text-decoration:underline;text-decoration-style:wavy;' +
  'text-decoration-thickness:0.1em;text-underline-offset:4px}' +
  '.proofread-spelling{text-decoration-color:var(--proofread-spelling-color)}' +
  '.proofread-grammar{text-decoration-color:var(--proofread-grammar-color)}' +
  '.proofread-tooltip{position:absolute;z-index:1000;max-width:min(24rem,calc(100vw - 16px));padding:0.25em 0.5em;' +
  'border-radius:var(--mono-border-radius);background:var(--fg-color);color:var(--bg-color);box-shadow:var(--box-shadow);' +
  'font-size:var(--font-size-small);pointer-events:none}' +
  '.proofread-tooltip p{margin:0}' +
  // Harper marks quoted words with code; show them as quotes in the text font
  '.proofread-tooltip code{padding:0;border:0;border-radius:0;background:none;color:inherit;font:inherit}' +
  '.proofread-tooltip code::before{content:open-quote}' +
  '.proofread-tooltip code::after{content:close-quote}';

// Replaces the native title tooltip with one that shows the HTML message.
// Delegated from document, so it keeps working across client-side navigation.
const PROOFREAD_JS = `(() => {
  let tooltip = null;
  let owner = null;
  function hide() {
    tooltip?.remove();
    tooltip = owner = null;
  }
  document.addEventListener('pointerover', event => {
    const span = event.target instanceof Element
      ? event.target.closest('[data-proofread-message]')
      : null;
    if (span === owner) {
      return;
    }
    hide();
    if (!span) {
      return;
    }
    span.removeAttribute('title');
    owner = span;
    tooltip = document.createElement('div');
    tooltip.className = 'proofread-tooltip';
    tooltip.setAttribute('role', 'tooltip');
    tooltip.innerHTML = span.dataset.proofreadMessage;
    document.body.append(tooltip);
    const rect = span.getBoundingClientRect();
    const left = Math.max(8, Math.min(rect.left, innerWidth - tooltip.offsetWidth - 8));
    tooltip.style.left = left + scrollX + 'px';
    tooltip.style.top = rect.bottom + scrollY + 4 + 'px';
  });
  // Leaving the window fires no pointerover in the page
  document.addEventListener('pointerout', event => {
    if (!event.relatedTarget) {
      hide();
    }
  });
  addEventListener('scroll', hide, true);
})();`;

/** The style and script added to the head of every proofread page */
export const PROOFREAD_HEAD = { css: PROOFREAD_CSS, js: PROOFREAD_JS };

// Each text node is checked as part of the nearest of these that contains it
const BLOCK_SELECTOR = [
  'address',
  'article',
  'aside',
  'blockquote',
  'caption',
  'dd',
  'details',
  'div',
  'dl',
  'dt',
  'fieldset',
  'figcaption',
  'figure',
  'footer',
  'form',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'header',
  'legend',
  'li',
  'main',
  'ol',
  'p',
  'section',
  'summary',
  'table',
  'td',
  'th',
  'tr',
  'ul',
].join(', ');

// Text in these is never checked
const IGNORED_SELECTOR = [
  'audio',
  'button',
  'canvas',
  'iframe',
  'nav',
  'noscript',
  'object',
  'pre',
  'script',
  'select',
  'style',
  'svg',
  'template',
  'textarea',
  'video',
  // Not shown to readers at build time
  '[hidden]',
  '[inert]',
  '[aria-hidden="true"]',
  '[spellcheck="false"]',
  // Answers are hidden from search, but they are the author's writing
  '[data-pagefind-ignore]:not(.question-a-body)',
  // Labels Tada generates, which are not sentences
  '.question-label',
  '.question-a-label',
].join(', ');

// Their text is part of the sentence, but problems that touch it are dropped
const MASKED_SELECTOR = 'code, kbd, samp, tt, var, .katex';

const TEXT_NODE = 3;
const SHOW_ELEMENT_AND_TEXT = 0x1 | 0x4;

interface Piece {
  /** The text node this piece came from; a line break has none */
  node?: Text;
  start: number;
  end: number;
  masked: boolean;
}

interface Block {
  text: string;
  pieces: Piece[];
}

interface Mark {
  start: number;
  end: number;
  issue: TextIssue;
}

/** Groups the checked text in `main` into blocks, in document order */
function collectBlocks(document: Document, main: Element): Block[] {
  const blocks = new Map<Element, Block>();
  const walker = document.createTreeWalker(main, SHOW_ELEMENT_AND_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const isText = node.nodeType === TEXT_NODE;
    const element = isText ? node.parentElement : (node as Element);
    if (!element || (!isText && element.tagName !== 'BR')) {
      continue;
    }
    // Of KaTeX output, only the TeX source annotation is read
    const isKatexRendering =
      element.closest('.katex') !== null && !element.closest('annotation');
    if (isKatexRendering || element.closest(IGNORED_SELECTOR)) {
      continue;
    }
    const blockElement = element.closest(BLOCK_SELECTOR) ?? main;
    const block = blocks.get(blockElement) ?? { text: '', pieces: [] };
    blocks.set(blockElement, block);
    const start = block.text.length;
    block.text += isText ? node.textContent : '\n';
    block.pieces.push({
      node: isText ? (node as Text) : undefined,
      start,
      end: block.text.length,
      masked: isText && element.closest(MASKED_SELECTOR) !== null,
    });
  }
  return [...blocks.values()].filter(block =>
    block.pieces.some(
      piece =>
        !piece.masked && block.text.slice(piece.start, piece.end).trim() !== '',
    ),
  );
}

/** The parts of each text node that the issues cover */
function marksForIssues(
  blocks: Block[],
  issuesByBlock: TextIssue[][],
): Map<Text, Mark[]> {
  const marksByNode = new Map<Text, Mark[]>();
  blocks.forEach((block, i) => {
    for (const issue of issuesByBlock[i]) {
      // Browsers collapse whitespace, so problems with it are not visible
      if (block.text.slice(issue.start, issue.end).trim() === '') {
        continue;
      }
      const pieces = block.pieces.filter(
        piece => piece.start < issue.end && piece.end > issue.start,
      );
      if (pieces.some(piece => piece.masked)) {
        continue;
      }
      for (const { node, start, end } of pieces) {
        if (!node) {
          continue;
        }
        const marks = marksByNode.get(node) ?? [];
        marks.push({
          start: Math.max(issue.start, start) - start,
          end: Math.min(issue.end, end) - start,
          issue,
        });
        marksByNode.set(node, marks);
      }
    }
  });
  return marksByNode;
}

function createMark(document: Document, text: string, issue: TextIssue) {
  const span = document.createElement('span');
  span.className = `proofread-${issue.kind}`;
  if (issue.message) {
    // Harper marks quoted words with backticks
    span.setAttribute('title', issue.message.replace(/`([^`]*)`/g, '“$1”'));
  }
  if (issue.messageHtml) {
    span.setAttribute('data-proofread-message', issue.messageHtml.trim());
  }
  span.append(document.createTextNode(text));
  return span;
}

/** Replaces a text node with its text, with each mark's part in a span */
function wrapMarks(document: Document, node: Text, marks: Mark[]) {
  const text = node.data;
  const parts: Node[] = [];
  let position = 0;
  for (const mark of marks.sort((a, b) => a.start - b.start)) {
    // Of overlapping problems, the first is kept
    if (mark.start < position) {
      continue;
    }
    if (mark.start > position) {
      parts.push(document.createTextNode(text.slice(position, mark.start)));
    }
    parts.push(
      createMark(document, text.slice(mark.start, mark.end), mark.issue),
    );
    position = mark.end;
  }
  if (position < text.length) {
    parts.push(document.createTextNode(text.slice(position)));
  }
  node.replaceWith(...parts);
}

/**
 * Underlines the problems `check` finds in the page's main content and adds
 * the style and script for the underlines and their tooltips
 */
export async function proofreadHtml(
  html: string,
  check: CheckText,
): Promise<string> {
  const { document } = parseHTML(html);
  const main = document.querySelector('main');
  if (!main) {
    return html;
  }
  // The parser splits text at character references; merge it back
  main.normalize();
  const blocks = collectBlocks(document, main);
  const issuesByBlock = await Promise.all(
    blocks.map(block => check(block.text)),
  );
  for (const [node, marks] of marksForIssues(blocks, issuesByBlock)) {
    wrapMarks(document, node, marks);
  }

  const style = document.createElement('style');
  style.textContent = PROOFREAD_HEAD.css;
  const script = document.createElement('script');
  script.textContent = PROOFREAD_HEAD.js;
  document.head.append(style, script);
  return document.toString();
}
