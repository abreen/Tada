import type MarkdownIt from 'markdown-it';
import type StateCore from 'markdown-it/lib/rules_core/state_core.mjs';
import type BaseStateInline from 'markdown-it/lib/rules_inline/state_inline.mjs';
import type Token from 'markdown-it/lib/token.mjs';
import type { PageTitleIndex } from './source-model';
import { opensAnchor } from './superlink-plugin';
import { getTokenSourceFile } from './utils/markdown-partials';
import { toDisplayPath, toUrlPath } from './utils/paths';
import type { RenderDependencyCollector } from './types';

const OPEN_BRACKET = 0x5b;
const OPEN_PAREN = 0x28;
const CARET = 0x5e;
const NEWLINE = 0x0a;
const PIPE = '|';
const CLOSE = ']]';

/** markdown-it's typings omit `linkLevel`, which is above 0 inside a link */
type StateInline = BaseStateInline & { linkLevel: number };

interface WikilinkOptions {
  pageTitles: PageTitleIndex;
  filePath?: string;
  dependencyCollector?: RenderDependencyCollector;
}

interface WikilinkMeta {
  title: string;
  source: string;
  /** Written inside a raw `<a>` tag */
  nested: boolean;
}

interface ReferencesEnv {
  references?: Record<string, unknown>;
  footnotes?: { list?: { tokens?: Token[] }[] };
}

// The file an inline footnote's text came from, by its tokens, since the
// footnote plugin later moves them into a new, untagged inline token
const footnoteSourceFiles = new WeakMap<Token[], string>();

// Renders `[[Title]]` and `[[Title|text]]` as a link to the page whose front
// matter `title` is exactly `Title`.
//
// The inline rule only recognizes the syntax, leaving `wikilink_open` and
// `wikilink_close` tokens. A core rule then resolves them once inline parsing
// is done, when each inline token knows which file (page or partial) its text
// came from. Inline content parsed apart from the page, such as image alt
// text, is not resolved: the image renders its text only.
export default function wikilinkPlugin(
  md: MarkdownIt,
  { pageTitles, filePath, dependencyCollector }: WikilinkOptions,
): void {
  function fail(token: Token, message: string): never {
    const sourceFile =
      getTokenSourceFile(token) ??
      (token.children && footnoteSourceFiles.get(token.children)) ??
      filePath;
    const displayPath = sourceFile ? toDisplayPath(sourceFile) : 'Markdown';
    throw new Error(`${displayPath}: ${message}`);
  }

  function resolve(inline: Token, { title, source }: WikilinkMeta): string {
    const urls = pageTitles.byTitle.get(title) ?? [];
    if (urls.length === 1) {
      return urls[0];
    }
    if (urls.length > 1) {
      fail(
        inline,
        `ambiguous wikilink "${source}": "${title}" is the title of ${urls.join(', ')}`,
      );
    }
    const hint =
      pageTitles.unlinkableTitles.length > 0
        ? `; these pages' titles cannot be linked: ${pageTitles.unlinkableTitles.join(', ')}`
        : '';
    fail(
      inline,
      `broken wikilink "${source}": no page has the title "${title}"${hint}`,
    );
  }

  function wikilinkRule(baseState: BaseStateInline, silent: boolean): boolean {
    const state = baseState as StateInline;
    const src = state.src;
    const start = state.pos;

    if (
      src.charCodeAt(start) !== OPEN_BRACKET ||
      src.charCodeAt(start + 1) !== OPEN_BRACKET
    ) {
      return false;
    }

    const innerStart = start + 2;
    const innerEnd = src.indexOf(CLOSE, innerStart);
    const end = innerEnd + CLOSE.length;
    if (innerEnd < 0 || end > state.posMax) {
      return false;
    }
    const inner = src.slice(innerStart, innerEnd);
    if (inner.includes('[') || inner.includes(String.fromCharCode(NEWLINE))) {
      return false;
    }

    // Leave ordinary Markdown links whose text is in brackets, such as the
    // citation `[[1]](https://example.com)` or `[[1]][ref]`, to the link rule
    const references = (state.env as ReferencesEnv).references ?? {};
    const isReference = (label: string) =>
      Object.hasOwn(references, md.utils.normalizeReference(label));
    if (src.charCodeAt(end) === OPEN_PAREN) {
      return false;
    }
    if (
      src.charCodeAt(end) === OPEN_BRACKET &&
      src.charCodeAt(end + 1) !== CARET
    ) {
      const labelEnd = src.indexOf(']', end + 1);
      if (labelEnd > 0 && isReference(src.slice(end + 1, labelEnd))) {
        return false;
      }
    }

    // `\|` also separates the title, as in a table cell, where `|` alone
    // would end the cell
    const pipe = inner.indexOf(PIPE);
    const titleEnd = pipe > 0 && inner[pipe - 1] === '\\' ? pipe - 1 : pipe;
    const title = (pipe < 0 ? inner : inner.slice(0, titleEnd)).trim();
    if (title === '') {
      return false;
    }
    const labelStart = pipe < 0 ? innerStart : innerStart + pipe + 1;
    if (src.slice(labelStart, innerEnd).trim() === '') {
      return false;
    }

    // `[[1]]` with a `[1]: url` reference definition is a reference link in
    // brackets, unless a page has the title
    if (pipe < 0 && isReference(inner) && !pageTitles.byTitle.has(title)) {
      return false;
    }

    if (!silent) {
      const open = state.push('wikilink_open', 'a', 1);
      open.markup = 'wikilink';
      open.meta = {
        title,
        source: src.slice(start, end),
        nested: state.linkLevel > 0,
      } satisfies WikilinkMeta;

      // Without a label, the link text is the title, so trim like it
      const leading = inner.length - inner.trimStart().length;
      const oldPos = state.pos;
      const oldMax = state.posMax;
      state.pos = pipe < 0 ? innerStart + leading : labelStart;
      state.posMax = pipe < 0 ? state.pos + title.length : innerEnd;
      // As in a link's label, nested wikilinks stay literal
      state.linkLevel++;
      state.md.inline.tokenize(state);
      state.linkLevel--;
      state.pos = oldPos;
      state.posMax = oldMax;

      state.push('wikilink_close', 'a', -1).markup = 'wikilink';
    }

    state.pos = end;
    return true;
  }

  // Records the file each inline footnote's text came from, before the
  // footnote plugin moves the text out of the inline token that tags it
  function recordFootnoteSources(state: StateCore): void {
    const list = (state.env as ReferencesEnv).footnotes?.list;
    if (!list) {
      return;
    }
    for (const inline of state.tokens) {
      const sourceFile =
        inline.type === 'inline' ? getTokenSourceFile(inline) : undefined;
      for (const token of (sourceFile && inline.children) || []) {
        const tokens =
          token.type === 'footnote_ref'
            ? list[(token.meta as { id: number }).id]?.tokens
            : undefined;
        if (tokens) {
          footnoteSourceFiles.set(tokens, sourceFile!);
        }
      }
    }
  }

  function resolveWikilinks(state: StateCore): void {
    for (const inline of state.tokens) {
      if (inline.type !== 'inline' || !inline.children) {
        continue;
      }
      // Only top-level children: an image's children are its alt text
      let open: Token | null = null;
      for (const token of inline.children) {
        if (token.type === 'wikilink_open') {
          const meta = token.meta as WikilinkMeta;
          if (meta.nested) {
            fail(inline, `wikilink "${meta.source}" is inside a link`);
          }
          // Recorded before resolving so watch mode re-renders this page once
          // a page takes the title
          dependencyCollector?.wikiTitles?.add(meta.title);
          token.type = 'link_open';
          // Encoded as link validation expects
          token.attrs = [['href', toUrlPath(resolve(inline, meta))]];
          open = token;
        } else if (token.type === 'wikilink_close') {
          token.type = 'link_close';
          open = null;
        } else if (
          open &&
          (opensAnchor(token) || token.type === 'superlink_open')
        ) {
          const { source } = open.meta as WikilinkMeta;
          fail(inline, `wikilink "${source}" text cannot contain a link`);
        }
      }
    }
  }

  md.inline.ruler.before('superlink', 'wikilink', wikilinkRule);
  // After the footnote plugin moves inline footnotes' tokens into the page,
  // and before rules that read links, such as the table of contents
  md.core.ruler.after('inline', 'wikilink_sources', recordFootnoteSources);
  try {
    md.core.ruler.after('footnote_tail', 'wikilink', resolveWikilinks);
  } catch {
    md.core.ruler.after('inline', 'wikilink', resolveWikilinks);
  }
}
