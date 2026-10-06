import type MarkdownIt from 'markdown-it';
import type StateInline from 'markdown-it/lib/rules_inline/state_inline.mjs';
import { isExternalHref } from './external-links-plugin';
import type { SiteVariables } from './types';

const OPEN_BRACKET = 0x5b;
const CARET = 0x5e;
const OPEN_PAREN = 0x28;
const CLOSE_PAREN = 0x29;
const NEWLINE = 0x0a;
const LESS_THAN = 0x3c;
const RAW_ANCHOR_OPEN = /^<a[\s>]/i;

// Renders `[Title][Description](/destination.html)` as a two-line superlink.
// It must run before the built-in `link` rule, which would otherwise
// treat `[Title][Description]` as a reference link.
export default function superlinkPlugin(
  md: MarkdownIt,
  siteVariables: SiteVariables,
): void {
  function skipSpaces(src: string, pos: number, max: number): number {
    while (pos < max) {
      const code = src.charCodeAt(pos);
      if (!md.utils.isSpace(code) && code !== NEWLINE) {
        break;
      }
      pos++;
    }
    return pos;
  }

  // Whether a `<…>` construct (an autolink or inline HTML) renders an anchor.
  // It is parsed alone with a throwaway `env`, and nothing in it can reach the
  // superlink rule again.
  function isAnchorMarkup(state: StateInline, markup: string): boolean {
    const tokens: StateInline['tokens'] = [];
    state.md.inline.parse(markup, state.md, {}, tokens);
    return tokens.some(
      token =>
        token.type === 'link_open' ||
        (token.type === 'html_inline' && RAW_ANCHOR_OPEN.test(token.content)),
    );
  }

  // `parseLinkLabel` rejects bracketed links but not autolinks (`<https://…>`)
  // or raw `<a>` tags. An anchor inside the superlink anchor is invalid HTML:
  // the parser closes the outer one early, stranding the description.
  //
  // This walks the label the way `parseLinkLabel` does, with the silent
  // `skipToken`, so the state's position cache keeps the work linear and rules
  // that register things in `env`, such as inline footnotes, do not run.
  function labelHasAnchor(
    state: StateInline,
    start: number,
    end: number,
  ): boolean {
    const oldPos = state.pos;
    let found = false;
    state.pos = start;
    while (state.pos < end && !found) {
      const pos = state.pos;
      state.md.inline.skipToken(state);
      found =
        state.src.charCodeAt(pos) === LESS_THAN &&
        state.pos - pos > 1 &&
        isAnchorMarkup(state, state.src.slice(pos, state.pos));
    }
    state.pos = oldPos;
    return found;
  }

  function pushPart(
    state: StateInline,
    name: 'title' | 'description',
    start: number,
    end: number,
  ): void {
    const open = state.push(`superlink_${name}_open`, 'span', 1);
    open.attrs = [['class', `superlink-${name}`]];

    const oldPos = state.pos;
    const oldMax = state.posMax;
    state.pos = start;
    state.posMax = end;
    state.md.inline.tokenize(state);
    state.pos = oldPos;
    state.posMax = oldMax;

    state.push(`superlink_${name}_close`, 'span', -1);
  }

  function superlinkRule(state: StateInline, silent: boolean): boolean {
    const src = state.src;
    const max = state.posMax;

    if (src.charCodeAt(state.pos) !== OPEN_BRACKET) {
      return false;
    }

    // Leave a footnote reference such as `[^1][source](url)` to the footnote
    // plugin, whose rule would otherwise never see it.
    if (src.charCodeAt(state.pos + 1) === CARET) {
      return false;
    }

    const titleStart = state.pos + 1;
    const titleEnd = state.md.helpers.parseLinkLabel(state, state.pos, true);
    if (titleEnd < 0) {
      return false;
    }

    // The description label must follow the title label immediately.
    const descriptionOpen = titleEnd + 1;
    if (
      descriptionOpen >= max ||
      src.charCodeAt(descriptionOpen) !== OPEN_BRACKET
    ) {
      return false;
    }
    const descriptionStart = descriptionOpen + 1;
    const descriptionEnd = state.md.helpers.parseLinkLabel(
      state,
      descriptionOpen,
      true,
    );
    if (descriptionEnd < 0) {
      return false;
    }

    if (
      src.slice(titleStart, titleEnd).trim() === '' ||
      src.slice(descriptionStart, descriptionEnd).trim() === ''
    ) {
      return false;
    }

    let pos = descriptionEnd + 1;
    if (pos >= max || src.charCodeAt(pos) !== OPEN_PAREN) {
      return false;
    }
    pos = skipSpaces(src, pos + 1, max);
    if (pos >= max) {
      return false;
    }

    const destination = state.md.helpers.parseLinkDestination(src, pos, max);
    if (!destination.ok) {
      return false;
    }
    const href = state.md.normalizeLink(destination.str);
    if (!state.md.validateLink(href)) {
      return false;
    }

    pos = skipSpaces(src, destination.pos, max);
    if (pos >= max || src.charCodeAt(pos) !== CLOSE_PAREN) {
      return false;
    }

    // Last, so labels are only scanned when everything else already matches
    if (
      labelHasAnchor(state, titleStart, titleEnd) ||
      labelHasAnchor(state, descriptionStart, descriptionEnd)
    ) {
      return false;
    }

    if (!silent) {
      const external = isExternalHref(href, siteVariables);
      const open = state.push('superlink_open', 'a', 1);
      open.attrs = [
        ['href', href],
        ['class', external ? 'button superlink external' : 'button superlink'],
      ];
      if (external) {
        open.attrs.push(['target', '_blank'], ['rel', 'noopener noreferrer']);
      }

      pushPart(state, 'title', titleStart, titleEnd);

      // The spans are blocks, so this collapses visually, but it keeps text
      // extraction (search indexing, copy and paste) from gluing the last word
      // of the title to the first word of the description.
      state.push('text', '', 0).content = '\n';

      pushPart(state, 'description', descriptionStart, descriptionEnd);

      state.push('superlink_close', 'a', -1);
    }

    state.pos = pos + 1;
    return true;
  }

  md.inline.ruler.before('link', 'superlink', superlinkRule);
}
