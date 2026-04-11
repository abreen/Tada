import type MarkdownIt from 'markdown-it';
import Token from 'markdown-it/lib/token.mjs';
import { makeLogger } from './log';
import type { SiteVariables } from './types';

const log = makeLogger(import.meta.url);

export default function externalLinks(
  md: MarkdownIt,
  siteVariables: SiteVariables,
): void {
  function isExternal(href: string): boolean {
    if (!href.match(/^https?:\/\/.*$/)) {
      return false;
    }
    const url = new URL(href);
    return !siteVariables.internalDomains?.includes(url.host);
  }

  function findMatchingClose(children: Token[], openIdx: number): number {
    let depth = 1;
    for (let i = openIdx + 1; i < children.length; i++) {
      if (children[i].type === 'link_open') {
        depth++;
      } else if (children[i].type === 'link_close') {
        depth--;
        if (depth === 0) {
          return i;
        }
      }
    }
    return -1;
  }

  function makeSpanOpen(): Token {
    const t = new Token('html_inline', '', 0);
    t.content = '<span class="external-link-tail">';
    return t;
  }

  function makeSpanClose(): Token {
    const t = new Token('html_inline', '', 0);
    t.content = '</span>';
    return t;
  }

  // Wrap the trailing word of an external link in
  // <span class="external-link-tail"> so the icon (added via that span's
  // ::after) stays glued to the last word and doesn't wrap on its own.
  // The span is inserted inside any inline-formatting elements (em,
  // strong, code, ...) that are still open at the split point, so the
  // resulting markup stays nested.
  function wrapTail(linkChildren: Token[]): Token[] | null {
    if (linkChildren.length === 0) {
      return null;
    }

    // Find the rightmost split char (space or hyphen) in a text token,
    // skipping any candidate that would produce an empty tail (e.g. a
    // trailing hyphen with no content after it).
    let splitTokenIdx = -1;
    let splitCharIdx = -1;
    for (let i = linkChildren.length - 1; i >= 0; i--) {
      const tok = linkChildren[i];
      if (tok.type !== 'text') {
        continue;
      }
      const text = tok.content;
      const hasLaterTokens = i < linkChildren.length - 1;
      let foundIdx = -1;
      for (let j = text.length - 1; j >= 0; j--) {
        const c = text[j];
        if (c !== ' ' && c !== '-') {
          continue;
        }
        if (j < text.length - 1 || hasLaterTokens) {
          foundIdx = j;
          break;
        }
      }
      if (foundIdx !== -1) {
        splitTokenIdx = i;
        splitCharIdx = foundIdx;
        break;
      }
    }

    if (splitTokenIdx === -1) {
      // No space anywhere in the link's text. Wrap the whole content.
      return [makeSpanOpen(), ...linkChildren, makeSpanClose()];
    }

    // Find where to put the span close: walk forward from the split
    // point tracking nesting depth (locally opened elements after the
    // split). The span must close before any -1 token that would close
    // an element that was already open at the split point.
    let spanCloseIdx = linkChildren.length;
    let depth = 0;
    for (let i = splitTokenIdx + 1; i < linkChildren.length; i++) {
      const tok = linkChildren[i];
      if (tok.nesting === 1) {
        depth++;
      } else if (tok.nesting === -1) {
        if (depth > 0) {
          depth--;
        } else {
          spanCloseIdx = i;
          break;
        }
      }
    }

    const splitToken = linkChildren[splitTokenIdx];
    const before = splitToken.content.slice(0, splitCharIdx + 1);
    const after = splitToken.content.slice(splitCharIdx + 1);

    const result: Token[] = [];

    // Tokens before the split, unchanged.
    for (let i = 0; i < splitTokenIdx; i++) {
      result.push(linkChildren[i]);
    }

    // The "before" part of the split text token.
    if (before.length > 0) {
      const beforeToken = new Token('text', '', 0);
      beforeToken.content = before;
      result.push(beforeToken);
    }

    result.push(makeSpanOpen());

    // The "after" part of the split text token.
    if (after.length > 0) {
      const afterToken = new Token('text', '', 0);
      afterToken.content = after;
      result.push(afterToken);
    }

    // Tokens between the split and the span close.
    for (let i = splitTokenIdx + 1; i < spanCloseIdx; i++) {
      result.push(linkChildren[i]);
    }

    result.push(makeSpanClose());

    // Tokens from the span close position to the end.
    for (let i = spanCloseIdx; i < linkChildren.length; i++) {
      result.push(linkChildren[i]);
    }

    return result;
  }

  function processChildren(children: Token[]): Token[] {
    const result: Token[] = [];
    let i = 0;
    while (i < children.length) {
      const token = children[i];

      if (token.type !== 'link_open') {
        result.push(token);
        i++;
        continue;
      }

      const href = token.attrGet('href');
      if (!href || !isExternal(href)) {
        result.push(token);
        i++;
        continue;
      }

      const classAttr = token.attrGet('class');
      const newClassAttr = classAttr ? `${classAttr} external` : 'external';
      token.attrSet('class', newClassAttr);
      token.attrSet('target', '_blank');
      log.debug`${href} -> "${newClassAttr}"`;

      const closeIdx = findMatchingClose(children, i);
      if (closeIdx === -1) {
        result.push(token);
        i++;
        continue;
      }

      const linkContent = children.slice(i + 1, closeIdx);
      const wrapped = wrapTail(linkContent);

      result.push(token);
      result.push(...(wrapped ?? linkContent));
      result.push(children[closeIdx]);
      i = closeIdx + 1;
    }
    return result;
  }

  md.core.ruler.push('external_links', state => {
    state.tokens.forEach(token => {
      if (token.children) {
        token.children = processChildren(token.children);
      }
    });
  });
}
