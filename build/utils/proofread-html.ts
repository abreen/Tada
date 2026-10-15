import { decodeHTML, escapeAttribute } from 'entities';

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
  | { type: 'failed'; message: string };

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
const PROOFREAD_STYLE =
  '<style>' +
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
  '.proofread-tooltip code::after{content:close-quote}' +
  '</style>';

// Replaces the native title tooltip with one that shows the HTML message.
// Delegated from document, so it keeps working across client-side navigation.
const PROOFREAD_SCRIPT = `<script>(() => {
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
  addEventListener('scroll', hide, true);
})();</script>`;

/** Added to the head of every proofread page */
export const PROOFREAD_HEAD = PROOFREAD_STYLE + PROOFREAD_SCRIPT;

// Elements that continue the surrounding sentence; every other element ends it
const INLINE_ELEMENTS = new Set([
  'a',
  'abbr',
  'b',
  'bdi',
  'bdo',
  'cite',
  'data',
  'del',
  'dfn',
  'em',
  'i',
  'ins',
  'mark',
  'q',
  's',
  'small',
  'span',
  'strong',
  'sub',
  'sup',
  'time',
  'u',
]);

// Labels Tada generates, which are not sentences
const IGNORED_CLASSES = ['question-label', 'question-a-label'];

// Their text is part of the sentence, but problems that touch it are dropped
const MASKED_ELEMENTS = new Set(['code', 'kbd', 'samp', 'tt', 'var']);

// Their text is never checked
const IGNORED_ELEMENTS = new Set([
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
]);

interface Frame {
  inMain: boolean;
  ignored: boolean;
  masked: boolean;
  /** Inside KaTeX output, only the TeX source annotation is read */
  math: 'none' | 'katex' | 'annotation';
}

const ROOT: Frame = {
  inMain: false,
  ignored: false,
  masked: false,
  math: 'none',
};

/** A run of raw HTML text and what it decodes to; entities are never split */
interface TextToken {
  raw: string;
  text: string;
}

interface Piece {
  /** The text node this piece came from; separators have none */
  node?: number;
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
  kind: IssueKind;
  message?: string;
  messageHtml?: string;
}

const TOKEN_PATTERN = /&(?:#[0-9]+|#x[0-9a-f]+|[a-z][a-z0-9]*);|[^&]+|&/gi;

function tokenize(raw: string): TextToken[] {
  return Array.from(raw.matchAll(TOKEN_PATTERN), ([match]) => ({
    raw: match,
    text: match.startsWith('&') ? decodeHTML(match) : match,
  }));
}

function childFrame(parent: Frame, el: HTMLRewriterTypes.Element): Frame {
  const tag = el.tagName.toLowerCase();
  const classes = (el.getAttribute('class') ?? '').split(/\s+/);
  let math = parent.math;
  if (classes.includes('katex')) {
    math = 'katex';
  } else if (math === 'katex' && tag === 'annotation') {
    math = 'annotation';
  }
  const pagefindIgnored =
    el.hasAttribute('data-pagefind-ignore') &&
    // Answers are hidden from search, but they are the author's writing
    !classes.includes('question-a-body');
  return {
    inMain: parent.inMain || tag === 'main',
    ignored:
      parent.ignored ||
      IGNORED_ELEMENTS.has(tag) ||
      pagefindIgnored ||
      IGNORED_CLASSES.some(name => classes.includes(name)) ||
      // Not shown to readers at build time
      el.hasAttribute('hidden') ||
      el.hasAttribute('inert') ||
      el.getAttribute('aria-hidden') === 'true' ||
      el.getAttribute('spellcheck') === 'false',
    masked: parent.masked || MASKED_ELEMENTS.has(tag) || math !== 'none',
    math,
  };
}

function endsSentence(tag: string, frame: Frame): boolean {
  return (
    frame.math === 'none' &&
    !INLINE_ELEMENTS.has(tag) &&
    !MASKED_ELEMENTS.has(tag)
  );
}

function isChecked(frame: Frame): boolean {
  return (
    frame.inMain &&
    !frame.ignored &&
    (frame.math === 'none' || frame.math === 'annotation')
  );
}

/**
 * Runs `onText` for every text node in the page, numbered in document order,
 * with the element context it is in. `onBoundary` runs where a checked
 * sentence must end, and `onLineBreak` at each checked `<br>`.
 */
function walk(
  rewriter: HTMLRewriter,
  {
    onBoundary,
    onLineBreak,
    onText,
  }: {
    onBoundary?: () => void;
    onLineBreak?: () => void;
    onText: (chunk: HTMLRewriterTypes.Text, node: number, frame: Frame) => void;
  },
): HTMLRewriter {
  const stack: Frame[] = [];
  let node = 0;
  return rewriter
    .on('*', {
      element(el) {
        const parent = stack.at(-1) ?? ROOT;
        const frame = childFrame(parent, el);
        const tag = el.tagName.toLowerCase();
        const boundary = isChecked(parent) && endsSentence(tag, frame);
        if (tag === 'br' && isChecked(parent)) {
          onLineBreak?.();
        } else if (boundary) {
          onBoundary?.();
        }
        if (el.selfClosing || !el.canHaveContent) {
          return;
        }
        stack.push(frame);
        el.onEndTag(() => {
          // An element closed implicitly never sees its end tag
          const index = stack.lastIndexOf(frame);
          if (index !== -1) {
            stack.splice(index);
          }
          if (boundary) {
            onBoundary?.();
          }
        });
      },
    })
    .onDocument({
      text(chunk) {
        onText(chunk, node, stack.at(-1) ?? ROOT);
        if (chunk.lastInTextNode) {
          node++;
        }
      },
    });
}

function collectBlocks(html: string): {
  blocks: Block[];
  tokensByNode: Map<number, TextToken[]>;
} {
  const blocks: Block[] = [];
  const tokensByNode = new Map<number, TextToken[]>();
  let current: Block = { text: '', pieces: [] };
  let raw = '';

  function addPiece(text: string, node: number | undefined, masked: boolean) {
    const start = current.text.length;
    current.text += text;
    current.pieces.push({ node, start, end: current.text.length, masked });
  }

  function endBlock() {
    const hasCheckedText = current.pieces.some(
      piece =>
        !piece.masked &&
        current.text.slice(piece.start, piece.end).trim() !== '',
    );
    if (hasCheckedText) {
      blocks.push(current);
    }
    current = { text: '', pieces: [] };
  }

  walk(new HTMLRewriter(), {
    onBoundary: endBlock,
    onLineBreak: () => addPiece('\n', undefined, false),
    onText(chunk, node, frame) {
      raw += chunk.text;
      if (!chunk.lastInTextNode) {
        return;
      }
      if (isChecked(frame) && raw !== '') {
        const tokens = tokenize(raw);
        tokensByNode.set(node, tokens);
        addPiece(tokens.map(token => token.text).join(''), node, frame.masked);
      }
      raw = '';
    },
  }).transform(html);
  endBlock();
  return { blocks, tokensByNode };
}

function marksForIssues(
  blocks: Block[],
  issuesByBlock: TextIssue[][],
): Map<number, Mark[]> {
  const marksByNode = new Map<number, Mark[]>();
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
      for (const piece of pieces) {
        if (piece.node === undefined) {
          continue;
        }
        const marks = marksByNode.get(piece.node) ?? [];
        marks.push({
          start: Math.max(issue.start, piece.start) - piece.start,
          end: Math.min(issue.end, piece.end) - piece.start,
          kind: issue.kind,
          message: issue.message,
          messageHtml: issue.messageHtml,
        });
        marksByNode.set(piece.node, marks);
      }
    }
  });
  for (const [node, marks] of marksByNode) {
    marks.sort((a, b) => a.start - b.start);
    let lastEnd = 0;
    marksByNode.set(
      node,
      marks.filter(mark => {
        if (mark.start < lastEnd) {
          return false;
        }
        lastEnd = mark.end;
        return true;
      }),
    );
  }
  return marksByNode;
}

function openMark({ kind, message, messageHtml }: Mark): string {
  let attributes = `class="proofread-${kind}"`;
  if (message) {
    // Harper marks quoted words with backticks
    const quoted = message.replace(/`([^`]*)`/g, '\u201c$1\u201d');
    attributes += ` title="${escapeAttribute(quoted)}"`;
  }
  if (messageHtml) {
    attributes += ` data-proofread-message="${escapeAttribute(messageHtml.trim())}"`;
  }
  return `<span ${attributes}>`;
}

/** Wraps each mark's text in a span; an entity is never split */
function renderMarkedText(tokens: TextToken[], marks: Mark[]): string {
  const boundaries = [
    ...new Set(marks.flatMap(mark => [mark.start, mark.end])),
  ].sort((a, b) => a - b);
  let html = '';
  let index = 0;
  let open = false;

  function sync(position: number) {
    if (open && position >= marks[index].end) {
      html += '</span>';
      open = false;
      index++;
    }
    while (index < marks.length && marks[index].end <= position) {
      index++;
    }
    if (!open && index < marks.length && position >= marks[index].start) {
      html += openMark(marks[index]);
      open = true;
    }
  }

  let position = 0;
  for (const token of tokens) {
    const end = position + token.text.length;
    if (token.raw !== token.text) {
      sync(position);
      html += token.raw;
    } else {
      let cut = position;
      for (const boundary of boundaries) {
        if (boundary > cut && boundary < end) {
          sync(cut);
          html += token.raw.slice(cut - position, boundary - position);
          cut = boundary;
        }
      }
      sync(cut);
      html += token.raw.slice(cut - position);
    }
    position = end;
  }
  if (open) {
    html += '</span>';
  }
  return html;
}

/**
 * Underlines the problems `check` finds in the page's main content and adds
 * the style that draws the underlines
 */
export async function proofreadHtml(
  html: string,
  check: CheckText,
): Promise<string> {
  const { blocks, tokensByNode } = collectBlocks(html);
  const issuesByBlock = await Promise.all(
    blocks.map(block => check(block.text)),
  );
  const marksByNode = marksForIssues(blocks, issuesByBlock);

  return walk(new HTMLRewriter(), {
    onText(chunk, node) {
      const marks = marksByNode.get(node);
      if (!marks) {
        return;
      }
      if (chunk.lastInTextNode) {
        chunk.replace(renderMarkedText(tokensByNode.get(node)!, marks), {
          html: true,
        });
      } else {
        chunk.remove();
      }
    },
  })
    .on('head', {
      element(el) {
        el.append(PROOFREAD_HEAD, { html: true });
      },
    })
    .transform(html);
}
