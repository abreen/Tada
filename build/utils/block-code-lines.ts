import MarkdownIt from 'markdown-it';
import type Token from 'markdown-it/lib/token.mjs';
import type StateBlock from 'markdown-it/lib/rules_block/state_block.mjs';

// A separate block parser avoids invoking custom block rules recursively or
// mutating the document's tokens and plugin environment while locating
// literal code.
const codeContextParser = new MarkdownIt('commonmark');

// Lines parsed by the first lookup; later lookups double the parsed range
const INITIAL_PARSE_LINES = 64;

// Raw HTML blocks that end at a closing marker rather than a blank line, like
// <pre>, keep their lines verbatim
const LITERAL_HTML_BLOCK =
  /^ {0,3}<(?:(?:script|pre|style|textarea)(?=[\s>]|$)|!--|\?|![A-Za-z]|!\[CDATA\[)/i;

export interface CodeLines {
  /**
   * Whether an absolute line number belongs to fenced or indented code, or to
   * raw HTML that keeps its lines verbatim
   */
  has(line: number): boolean;
}

/**
 * Looks up the lines in [startLine, endLine) that belong to fenced or indented
 * code, or to raw HTML blocks like <pre>. Parsing block context first, including lists and blockquotes, keeps
 * delimiter-like lines inside code literal.
 *
 * Whether a line is code depends only on the lines before it, so parsing stops
 * at the furthest line looked up so far. A block rule that scans to its
 * closing line then costs time proportional to the lines it reads, not to the
 * rest of the document.
 */
export function findCodeLines(
  state: StateBlock,
  startLine: number,
  endLine: number,
): CodeLines {
  let parsedEnd = startLine;
  let codeLines = new Set<number>();

  const parseUntil = (end: number) => {
    const tokens: Token[] = [];
    codeContextParser.block.parse(
      state.getLines(startLine, end, state.blkIndent, false),
      codeContextParser,
      {},
      tokens,
    );
    codeLines = new Set<number>();
    for (const token of tokens) {
      const isLiteral =
        token.type === 'fence' ||
        token.type === 'code_block' ||
        (token.type === 'html_block' &&
          state.md.options.html &&
          LITERAL_HTML_BLOCK.test(token.content));
      if (isLiteral && token.map) {
        for (let line = token.map[0]; line < token.map[1]; line++) {
          codeLines.add(startLine + line);
        }
      }
    }
    parsedEnd = end;
  };

  return {
    has(line) {
      if (line >= parsedEnd && line < endLine) {
        const parsed = parsedEnd - startLine;
        parseUntil(
          Math.min(
            endLine,
            Math.max(
              line + 1,
              startLine + Math.max(INITIAL_PARSE_LINES, parsed * 2),
            ),
          ),
        );
      }
      return codeLines.has(line);
    },
  };
}
