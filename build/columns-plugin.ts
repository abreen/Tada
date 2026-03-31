import type MarkdownIt from 'markdown-it';
import type StateBlock from 'markdown-it/lib/rules_block/state_block.mjs';

const MARKER_CHAR = 0x2b; // '+'
const MIN_MARKERS = 3;

function isColumnsFence(state: StateBlock, line: number): boolean {
  const start = state.bMarks[line] + state.tShift[line];
  const max = state.eMarks[line];

  if (state.sCount[line] - state.blkIndent >= 4) {
    return false;
  }
  if (state.src.charCodeAt(start) !== MARKER_CHAR) {
    return false;
  }

  let pos = start + 1;
  while (pos < max && state.src.charCodeAt(pos) === MARKER_CHAR) {
    pos++;
  }

  if (pos - start < MIN_MARKERS) {
    return false;
  }

  // Rest of line must be whitespace only
  if (state.skipSpaces(pos) < max) {
    return false;
  }

  return true;
}

function columnsRule(
  state: StateBlock,
  startLine: number,
  endLine: number,
  silent: boolean,
): boolean {
  if (!isColumnsFence(state, startLine)) {
    return false;
  }

  // Find the separator (second +++) and closing (third +++) fences
  let separatorLine = -1;
  let closeLine = -1;

  for (let line = startLine + 1; line < endLine; line++) {
    if (!isColumnsFence(state, line)) {
      continue;
    }
    if (separatorLine === -1) {
      separatorLine = line;
    } else {
      closeLine = line;
      break;
    }
  }

  if (separatorLine === -1 || closeLine === -1) {
    return false;
  }
  if (silent) {
    return true;
  }

  const oldParent = state.parentType;
  const oldLineMax = state.lineMax;

  // Outer wrapper: <div class="columns">
  const tokOpen = state.push('columns_open', 'div', 1);
  tokOpen.block = true;
  tokOpen.map = [startLine, closeLine + 1];
  tokOpen.markup = '+++';
  tokOpen.attrJoin('class', 'columns');

  // Column 1
  const col1Open = state.push('column_open', 'div', 1);
  col1Open.block = true;
  col1Open.map = [startLine + 1, separatorLine];

  state.lineMax = separatorLine;
  state.md.block.tokenize(state, startLine + 1, separatorLine);

  const col1Close = state.push('column_close', 'div', -1);
  col1Close.block = true;

  // Column 2
  const col2Open = state.push('column_open', 'div', 1);
  col2Open.block = true;
  col2Open.map = [separatorLine + 1, closeLine];

  state.lineMax = closeLine;
  state.md.block.tokenize(state, separatorLine + 1, closeLine);

  const col2Close = state.push('column_close', 'div', -1);
  col2Close.block = true;

  // Close wrapper
  const tokClose = state.push('columns_close', 'div', -1);
  tokClose.block = true;
  tokClose.markup = '+++';

  state.parentType = oldParent;
  state.lineMax = oldLineMax;
  state.line = closeLine + 1;

  return true;
}

export default function columnsPlugin(md: MarkdownIt): void {
  md.block.ruler.before('fence', 'columns', columnsRule, {
    alt: ['paragraph', 'reference', 'blockquote', 'list'],
  });
}
