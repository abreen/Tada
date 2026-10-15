import path from 'path';
import { decodeHTMLAttribute } from 'entities';
import MarkdownIt from 'markdown-it';
import markdownItKatex from '@vscode/markdown-it-katex';
import type StateBlock from 'markdown-it/lib/rules_block/state_block.mjs';
import type StateCore from 'markdown-it/lib/rules_core/state_core.mjs';
import type StateInline from 'markdown-it/lib/rules_inline/state_inline.mjs';
import type Token from 'markdown-it/lib/token.mjs';
import type { PageTitleIndex } from '../source-model';
import {
  ALERT_PATTERN,
  createMarkdown,
  QUESTION_PATTERN,
} from '../utils/markdown';
import {
  checkIncludeDepth,
  checkPartialTarget,
  parsePartialDirective,
  setTokenSourceFile,
} from '../utils/markdown-partials';
import { resolvePathname, splitHref } from '../utils/final-html';
import { isInternalLink } from '../utils/link';
import { normalizeOutputPath, toDisplayPath, toUrlPath } from '../utils/paths';
import { checkTraceFiles } from '../utils/trace';
import { getExtensionToShikiLanguage } from '../site-variables';
import { getSiteVars, substituteContent } from '../variables';
import type { SiteVariables } from '../types';

/** Blockquote markers, list markers, and indentation before a block */
const CONTAINER_PREFIX_PATTERN =
  /^(?:[ \t]*(?:>|[-+*](?=[ \t]|$)|\d{1,9}[.)](?=[ \t]|$)))*[ \t]*/;
/** A container prefix, then any definition list marker (`: ` or `~ `) */
const LINE_PREFIX_PATTERN =
  /^(?:[ \t]*(?:>|[-+*](?=[ \t]|$)|\d{1,9}[.)](?=[ \t]|$)|[:~](?=[ \t])))*[ \t]*/;
/**
 * HTML blocks that end only at a closing tag or marker (types 1 to 5): how
 * each starts, how it ends, and a line that ends it
 */
const HTML_BLOCK_CLOSERS: [RegExp, RegExp, string][] = [
  [
    /^\s*<(?:script|pre|style|textarea)(?=[\s>]|$)/i,
    /<\/(?:script|pre|style|textarea)>/i,
    '</$tag>',
  ],
  [/^\s*<!--/, /-->/, '-->'],
  [/^\s*<\?/, /\?>/, '?>'],
  [/^\s*<![A-Za-z]/, /^\s*<![A-Za-z][^>]*>/, '>'],
  [/^\s*<!\[CDATA\[/, /\]\]>/, ']]>'],
];
/** ` # ` with its `#` escaped or written as a character reference */
const ESCAPED_HASH_SEPARATOR_PATTERN = /^ (?:\\#|&#35;|&#[xX]23;|&num;) /;
/** List markers and definition markers, which later lines indent past */
const LIST_MARKER_PATTERN = /[-+*]|\d{1,9}[.)]|[:~]/g;
/**
 * Whether a line starts a list item even right after a paragraph, so it is
 * not lazy text: a bullet or `1.` with text, or an item of a list around the
 * block that ends at column `col`
 */
function startsListItemAfterParagraph(line: string, col: number): boolean {
  const prefix = line.match(CONTAINER_PREFIX_PATTERN)![0];
  return (
    LIST_ITEM_PREFIX_PATTERN.test(prefix) &&
    line.trim() !== prefix.trim() &&
    (/(?:^|[\s>])(?:[-+*]|1[.)])[ \t]+$/.test(prefix) ||
      prefix.search(LIST_ITEM_PREFIX_PATTERN) < col)
  );
}

/** A container prefix that ends in a list marker, which starts a list item */
const LIST_ITEM_PREFIX_PATTERN = /(?:[-+*]|\d{1,9}[.)])[ \t]*$/;
/** ASCII punctuation, which a backslash makes literal in Markdown */
const MARKDOWN_PUNCTUATION_PATTERN = /[!-/:-@[-`{-~]/g;

/** What exporting a page needs to know about the rest of the site */
export interface ExportContext {
  siteVariables: SiteVariables;
  pageTitles: PageTitleIndex;
  /**
   * Root-relative URL paths the build publishes (`/a/b.html`, `/a/`) mapped
   * to paths in the export, relative to its root (`a/b.md`)
   */
  exportPaths: ReadonlyMap<string, string>;
  /**
   * Every URL path an internal link can name in the build, including ones the
   * export leaves out, such as generated files
   */
  validTargets: ReadonlySet<string>;
  /** Reads a file as written, or returns null when there is none */
  readFile: (filePath: string) => string | null;
  /** Reads a traced source file as the build publishes it */
  readTraceFile: (filePath: string) => string;
}

export interface ExportPage {
  /** Absolute path of the source file */
  filePath: string;
  /** Path of the exported file, relative to the export root, with `/` */
  relPath: string;
  /** Front matter title, after site variable substitution */
  title?: string;
  /**
   * A literate Java page, which keeps `<!--- -->` comments and where the build
   * does not allow trace blocks
   */
  literateJava?: boolean;
}

type SpanKind = 'link' | 'image' | 'superlink' | 'wikilink' | 'html_inline';

/** Where an inline construct was parsed from */
interface InlineSpan {
  kind: SpanKind;
  token: Token;
  inline: Token;
  src: string;
  /** Offset of `src` in the inline token's content */
  base: number;
  start: number;
  end: number;
  /** Index of the `]` that ends a link's, image's, or superlink's first label */
  labelEnd: number;
  /** Index of the `]` that ends a superlink's description */
  descriptionEnd: number;
  /**
   * Parsed from an image's alt text, which the build renders as plain text,
   * so its links are not anchors
   */
  inAlt: boolean;
}

interface ParseRecord {
  spans: InlineSpan[];
  /** Each inline token's content before core rules changed it */
  contents: Map<Token, string>;
  /**
   * Inline tokens of table cells, which have no map, with their row's line;
   * their content has `\|` unescaped
   */
  cells: Map<Token, number>;
  /** Line ranges of link reference definitions */
  references: [number, number][];
  /** Ranges of inline footnotes (`^[...]`) in inline tokens' content */
  footnotes: { inline: Token; start: number; end: number }[];
  /** The file each line came from, for errors in included partials */
  origins?: readonly string[];
}

/** Reference definitions, by normalized label, as markdown-it keeps them */
type References = Record<string, { href: string; title: string }>;

interface ParseEnv {
  references?: References;
}

interface ParseOptions {
  wikilinks?: boolean;
  origins?: readonly string[];
}

/** Text inserted at a column of a line, after removing some characters */
interface PrefixChange {
  col: number;
  text: string;
  remove?: number;
}

interface Edit {
  start: number;
  end: number;
  replace: (render: (start: number, end: number) => string) => string;
}

const EXPECTED_TOKENS: Record<SpanKind, string> = {
  link: 'link_open',
  image: 'image',
  superlink: 'superlink_open',
  wikilink: 'wikilink_open',
  html_inline: 'html_inline',
};

const plainMarkdown = new MarkdownIt({ html: true });

/**
 * Renders inline Markdown for HTML, such as a summary, as the build does:
 * with typography, and with math parsed but kept as written, since GitHub
 * renders `$...$` math itself
 */
const summaryMarkdown = new MarkdownIt({ html: true, typographer: true }).use(
  markdownItKatex,
);
const keepMath =
  (open: string, close: string) => (tokens: Token[], idx: number) =>
    summaryMarkdown.utils.escapeHtml(`${open}${tokens[idx].content}${close}`);
summaryMarkdown.renderer.rules.math_inline = keepMath('$', '$');
summaryMarkdown.renderer.rules.math_inline_block = keepMath('$$', '$$');
summaryMarkdown.renderer.rules.math_inline_bare_block = keepMath('$$', '$$');

/** Renders inline Markdown as HTML, for markup that GitHub does not parse */
export function renderInlineHtml(
  markdown: string,
  references?: References,
): string {
  return summaryMarkdown.renderInline(markdown, { references }).trim();
}

interface RuleEntry<T> {
  name: string;
  fn: T;
  alt: string[];
}

function hasRule(
  ruler: MarkdownIt['inline']['ruler'] | MarkdownIt['block']['ruler'],
  name: string,
): boolean {
  const rules = (ruler as unknown as { __rules__: { name: string }[] })
    .__rules__;
  return rules.some(entry => entry.name === name);
}

/** A copy of a rule's entry, which `ruler.at` replaces in place */
function findRule<T>(
  ruler: MarkdownIt['inline']['ruler'] | MarkdownIt['block']['ruler'],
  name: string,
): RuleEntry<T> {
  const rules = (ruler as unknown as { __rules__: RuleEntry<T>[] }).__rules__;
  const rule = rules.find(entry => entry.name === name);
  if (!rule) {
    throw new Error(`markdown-it rule "${name}" not found`);
  }
  return { ...rule, alt: [...rule.alt] };
}

/**
 * Records where links, images, superlinks, wikilinks, raw inline HTML, and
 * reference definitions were parsed from, so they can be rewritten in place
 */
function recorderPlugin(md: MarkdownIt, record: ParseRecord): void {
  type RuleInline = (state: StateInline, silent: boolean) => boolean;
  let current: Token | null = null;
  // The text being parsed, innermost last: an inline token's content, then
  // labels that rules parse on their own, such as image alt text and inline
  // footnotes, each with its offset in the content
  let sources: { src: string; base: number; alt?: boolean }[] = [];
  const baseOf = (src: string) =>
    sources.findLast(source => source.src === src)?.base;

  /** Runs a rule that parses the label opened at `labelOpen` as its own text */
  const parsingLabel = (
    rule: RuleInline,
    state: StateInline,
    silent: boolean,
    labelOpen: number,
    alt: boolean,
  ) => {
    const base = baseOf(state.src);
    const start = state.pos;
    const labelEnd = silent
      ? -1
      : state.md.helpers.parseLinkLabel(state, labelOpen, false);
    state.pos = start;
    if (base === undefined || labelEnd < 0) {
      return rule(state, silent);
    }
    sources.push({
      src: state.src.slice(labelOpen + 1, labelEnd),
      base: base + labelOpen + 1,
      alt,
    });
    try {
      return rule(state, silent);
    } finally {
      sources.pop();
    }
  };

  md.core.ruler.at('inline', (state: StateCore) => {
    let previous: Token | undefined;
    let row = -1;
    for (const token of state.tokens) {
      if (token.type === 'tr_open') {
        row = token.map?.[0] ?? -1;
      }
      if (token.type === 'inline') {
        current = token;
        sources = [{ src: token.content, base: 0 }];
        record.contents.set(token, token.content);
        if (
          (previous?.type === 'th_open' || previous?.type === 'td_open') &&
          row >= 0
        ) {
          record.cells.set(token, row);
        }
        // Errors name the partial that the text came from, as in the build
        const line = token.map?.[0] ?? record.cells.get(token);
        const origin = line === undefined ? undefined : record.origins?.[line];
        if (origin) {
          setTokenSourceFile(token, origin);
        }
        state.md.inline.parse(
          token.content,
          state.md,
          state.env,
          token.children ?? (token.children = []),
        );
      }
      previous = token;
    }
    current = null;
  });

  const footnote = findRule<RuleInline>(md.inline.ruler, 'footnote_inline');
  md.inline.ruler.at(
    'footnote_inline',
    (state, silent) => {
      const start = state.pos;
      const base = baseOf(state.src);
      // `^[text]`
      if (!parsingLabel(footnote.fn, state, silent, start + 1, false)) {
        return false;
      }
      if (!silent && current && base !== undefined) {
        record.footnotes.push({
          inline: current,
          start: base + start,
          end: base + state.pos,
        });
      }
      return true;
    },
    { alt: footnote.alt },
  );

  for (const kind of Object.keys(EXPECTED_TOKENS) as SpanKind[]) {
    // Wikilinks are off where no page titles are given
    if (!hasRule(md.inline.ruler, kind)) {
      continue;
    }
    const rule = findRule<RuleInline>(md.inline.ruler, kind);
    md.inline.ruler.at(
      kind,
      (state, silent) => {
        const start = state.pos;
        const base = baseOf(state.src);
        const tokenCount = state.tokens.length;
        const matched =
          kind === 'image'
            ? // `![alt](src)`
              parsingLabel(rule.fn, state, silent, start + 1, true)
            : rule.fn(state, silent);
        if (!matched) {
          return false;
        }
        const token = state.tokens
          .slice(tokenCount)
          .find(t => t.type === EXPECTED_TOKENS[kind]);
        if (!silent && current && token && base !== undefined) {
          const end = state.pos;
          // Labels found as the rules found them
          let labelEnd = -1;
          let descriptionEnd = -1;
          if (kind === 'link' || kind === 'image') {
            labelEnd = state.md.helpers.parseLinkLabel(
              state,
              kind === 'image' ? start + 1 : start,
              kind === 'link',
            );
          } else if (kind === 'superlink') {
            labelEnd = state.md.helpers.parseLinkLabel(state, start, true);
            descriptionEnd = state.md.helpers.parseLinkLabel(
              state,
              labelEnd + 1,
              true,
            );
          }
          state.pos = end;
          record.spans.push({
            kind,
            token,
            inline: current,
            src: state.src,
            base,
            start,
            end,
            labelEnd,
            descriptionEnd,
            inAlt: sources.some(source => source.alt),
          });
        }
        return true;
      },
      { alt: rule.alt },
    );
  }

  type RuleBlock = (
    state: StateBlock,
    startLine: number,
    endLine: number,
    silent: boolean,
  ) => boolean;
  const reference = findRule<RuleBlock>(md.block.ruler, 'reference');
  md.block.ruler.at(
    'reference',
    (state, startLine, endLine, silent) => {
      if (!reference.fn(state, startLine, endLine, silent)) {
        return false;
      }
      if (!silent) {
        record.references.push([startLine, state.line]);
      }
      return true;
    },
    { alt: reference.alt },
  );
}

/** Marks `{{{ _partial.md }}}` directives, as the build's partials plugin finds them */
function partialDirectivePlugin(md: MarkdownIt): void {
  md.block.ruler.before(
    'paragraph',
    'export_partial',
    (state, startLine, _endLine, silent) => {
      const relativePath = parsePartialDirective(
        state.src.slice(
          state.bMarks[startLine] + state.tShift[startLine],
          state.eMarks[startLine],
        ),
      );
      if (relativePath === null) {
        return false;
      }
      if (!silent) {
        const token = state.push('export_partial', '', 0);
        token.map = [startLine, startLine + 1];
        token.info = relativePath;
        // Indentation beyond the container's, which the partial's own lines
        // do not take, since the build parses the partial from column 0
        token.meta = { extraIndent: state.sCount[startLine] - state.blkIndent };
      }
      state.line = startLine + 1;
      return true;
    },
    { alt: ['paragraph', 'reference', 'blockquote', 'list'] },
  );
}

function linePrefix(line: string): string {
  return line.match(LINE_PREFIX_PATTERN)![0];
}

/** The prefix of the lines after a block's first line: list markers become spaces */
function continuationPrefix(prefix: string): string {
  return prefix.replace(LIST_MARKER_PATTERN, marker =>
    ' '.repeat(marker.length),
  );
}

/** Prefixes each line after the first, keeping blank lines free of trailing spaces */
function indentLines(text: string, prefix: string): string {
  return text
    .split('\n')
    .map((line, index) => {
      if (index === 0) {
        return line;
      }
      return line === '' ? prefix.trimEnd() : prefix + line;
    })
    .join('\n');
}

/**
 * A URL written as a Markdown link destination: in angle brackets when it has
 * spaces, with the characters that would end it escaped
 */
function markdownDestination(url: string, bracketed = false): string {
  // An `&` that would start a character reference is written as one
  const escaped = url.replace(/&(?=#?[A-Za-z0-9]+;)/g, '&amp;');
  if (bracketed || /\s/.test(escaped)) {
    return `<${escaped.replace(/[\\<>]/g, '\\$&')}>`;
  }
  return escaped.replace(/[\\()]/g, '\\$&');
}

/**
 * Whether a link span is an inline link, `[text](destination)`. markdown-it
 * reads `[text]` as a shortcut reference when the destination is not valid.
 */
function isInlineLink(span: InlineSpan): boolean {
  return span.src[span.labelEnd + 1] === '(' && span.end > span.labelEnd + 1;
}

/**
 * Escapes unbalanced brackets outside code spans, which would end a link's
 * text early or leave it open; balanced ones, such as an image's, stay
 */
function escapeBrackets(text: string): string {
  // UTF-16 units, to match the string indexes below
  const chars = text.split('');
  const open: number[] = [];
  for (let i = 0; i < chars.length; i++) {
    const char = chars[i];
    if (char === '\\') {
      i++;
    } else if (char === '`') {
      const run = /^`+/.exec(text.slice(i))![0];
      const close = text.indexOf(run, i + run.length);
      i = close < 0 ? i + run.length - 1 : close + run.length - 1;
    } else if (char === '[') {
      open.push(i);
    } else if (char === ']') {
      if (open.length > 0) {
        open.pop();
      } else {
        chars[i] = '\\]';
      }
    }
  }
  for (const i of open) {
    chars[i] = '\\[';
  }
  return chars.join('');
}

/** Columns that text starting at `column` takes, with tab stops every 4 */
function expandedWidth(text: string, column: number): number {
  let end = column;
  for (const char of text) {
    end = char === '\t' ? end + 4 - (end % 4) : end + 1;
  }
  return end - column;
}

/**
 * Escapes an attribute value for either quote style. `entities`'
 * escapeAttribute leaves `'` as is, which would end a single-quoted value.
 */
function escapeAttribute(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function escapeMarkdown(text: string): string {
  return text.replace(MARKDOWN_PUNCTUATION_PATTERN, char => `\\${char}`);
}

function normalizeNewlines(text: string): string {
  const normalized = text.replace(/\r\n?/g, '\n');
  return normalized.endsWith('\n') ? normalized : `${normalized}\n`;
}

/**
 * Applies edits that may nest: an edit's replacement can render the text of
 * its own range with the edits inside it applied. Insertions at the start or
 * end of another edit's range come before or after it, not inside.
 */
export function applyEdits(text: string, edits: Edit[]): string {
  interface Node extends Edit {
    index: number;
    children: Node[];
  }
  const nodes: Node[] = edits
    .map((edit, index) => ({ ...edit, index, children: [] }))
    .sort((a, b) => {
      if (a.start !== b.start) {
        return a.start - b.start;
      }
      const aInsert = a.start === a.end;
      const bInsert = b.start === b.end;
      if (aInsert !== bInsert) {
        return aInsert ? -1 : 1;
      }
      return b.end - a.end || a.index - b.index;
    });

  const contains = (outer: Node, inner: Node) =>
    outer.start < outer.end &&
    inner.start >= outer.start &&
    inner.end <= outer.end &&
    !(
      inner.start === inner.end &&
      (inner.start === outer.start || inner.start === outer.end)
    );

  const root: Node = {
    start: 0,
    end: text.length,
    replace: () => '',
    index: -1,
    children: [],
  };
  const stack: Node[] = [root];
  for (const node of nodes) {
    while (stack.length > 1 && !contains(stack[stack.length - 1], node)) {
      stack.pop();
    }
    const parent = stack[stack.length - 1];
    const previous = parent.children[parent.children.length - 1];
    if (previous && node.start < previous.end) {
      throw new Error(
        `overlapping edits at ${previous.start}-${previous.end} and ${node.start}-${node.end}`,
      );
    }
    parent.children.push(node);
    stack.push(node);
  }

  function render(start: number, end: number, children: Node[]): string {
    let result = '';
    let pos = start;
    for (const child of children) {
      if (child.start < start || child.end > end) {
        continue;
      }
      result += text.slice(pos, child.start);
      result += child.replace((a, b) => render(a, b, child.children));
      pos = child.end;
    }
    return result + text.slice(pos, end);
  }

  return render(0, text.length, root.children);
}

/** Converts one page's Markdown to GitHub Flavored Markdown */
class PageExporter {
  constructor(
    private readonly context: ExportContext,
    private readonly page: ExportPage,
    /**
     * Exports a title, which the build renders without wikilinks and outside
     * the page body, whose links it checks
     */
    private readonly forTitle = false,
  ) {}

  private get displayPath(): string {
    return toDisplayPath(this.page.filePath);
  }

  private createParser(record: ParseRecord, wikilinks: boolean): MarkdownIt {
    const md = createMarkdown(this.context.siteVariables, {
      filePath: this.page.filePath,
      pageTitles: wikilinks ? this.context.pageTitles : undefined,
    });
    md.use(partialDirectivePlugin);
    md.use(recorderPlugin, record);
    return md;
  }

  /**
   * Parses Markdown. Without wikilinks, `[[...]]` stays unresolved, for a
   * look at text whose references may be defined in partials not yet
   * included. `origins` names the file each line came from.
   */
  private parse(
    text: string,
    { wikilinks = !this.forTitle, origins }: ParseOptions = {},
  ): { tokens: Token[]; record: ParseRecord; references: References } {
    const record: ParseRecord = {
      spans: [],
      contents: new Map(),
      cells: new Map(),
      references: [],
      footnotes: [],
      origins,
    };
    const env: ParseEnv = {};
    const tokens = this.createParser(record, wikilinks).parse(text, env);
    return { tokens, record, references: env.references ?? {} };
  }

  /**
   * Closes a block that runs to the end of the text because nothing closed
   * it: a fence, math, an alert, a question, or an HTML block of types 1 to
   * 5, which end only at a closing tag or marker
   */
  private closeOpenBlocks(text: string): string {
    const lines = text.split('\n');
    // markdown-it does not count a line after a final newline
    const lineCount = text.endsWith('\n') ? lines.length - 1 : lines.length;
    const { tokens } = this.parse(text, { wikilinks: false });
    const last = tokens.findLast(
      token => token.level === 0 && token.map !== null,
    );
    if (!last || last.map![1] < lineCount) {
      return text;
    }
    const [open, end] = last.map!;
    const close = (closer: string) => `${text}\n${closer}`;
    switch (last.type) {
      case 'fence': {
        // A closing fence is indented less than 4 spaces
        const closer = new RegExp(
          `^ {0,3}${RegExp.escape(last.markup[0])}{${last.markup.length},}[ \\t]*$`,
        );
        const closed = end - 1 > open && closer.test(lines[end - 1]);
        return closed ? text : close(last.markup);
      }
      case 'math_block': {
        const dollars =
          lines.slice(open, end).join('\n').split('$$').length - 1;
        return dollars >= 2 ? text : close('$$');
      }
      // A container that reaches the end has no closing line
      case 'container_alert_open':
      case 'container_question_open':
        return close(last.markup);
      case 'question_multiple_choice':
        return close('???');
      case 'html_block': {
        const closer = HTML_BLOCK_CLOSERS.find(([start]) =>
          start.test(last.content),
        );
        if (closer && !closer[1].test(last.content)) {
          const tag = /^\s*<([a-z]+)/i.exec(last.content)?.[1] ?? '';
          return close(closer[2].replace('$tag', tag));
        }
        return text;
      }
      default:
        return text;
    }
  }

  /**
   * Replaces partial directives with the partials' text, recursively, with
   * the file each resulting line came from
   */
  expandPartials(
    text: string,
    fromFile: string,
    depth = 0,
  ): { text: string; origins: string[] } {
    const unchanged = () => ({
      text,
      origins: text.split('\n').map(() => fromFile),
    });
    if (!text.includes('{{{')) {
      return unchanged();
    }
    const { tokens } = this.parse(text, { wikilinks: false });
    const directives = tokens.filter(token => token.type === 'export_partial');
    if (directives.length === 0) {
      return unchanged();
    }
    // Named as the build names them: by the including file's path, and the
    // page's for an empty path
    const caller = fromFile;
    const lines = text.split('\n');
    const origins = lines.map(() => fromFile);
    for (const directive of directives.reverse()) {
      const relativePath = directive.info;
      if (!relativePath) {
        throw new Error(`${this.page.filePath}: partial path is empty`);
      }
      const resolvedPath = path.resolve(path.dirname(fromFile), relativePath);
      // In the build's order, with its messages
      const raw = this.context.readFile(resolvedPath);
      if (raw === null) {
        throw new Error(
          `${caller}: partial not found: ${relativePath} (resolved to ${resolvedPath})`,
        );
      }
      checkPartialTarget(caller, relativePath, resolvedPath);
      checkIncludeDepth(caller, depth);
      const partial = this.expandPartials(
        normalizeNewlines(
          substituteContent(
            raw,
            getSiteVars(this.context.siteVariables),
            resolvedPath,
            this.page.literateJava,
          ),
        ),
        resolvedPath,
        depth + 1,
      );
      // The build parses a partial on its own, so a block left open ends
      // with it; once included, it would run on into the page
      const partialText = this.closeOpenBlocks(partial.text.replace(/\n$/, ''));

      const line = directive.map![0];
      const original = lines[line];
      const prefix = original.slice(0, original.indexOf('{{{'));
      const indent = continuationPrefix(prefix);
      // The build parses a partial as blocks of their own, so blank lines keep
      // it from joining the lines around it. A directive that is a list item
      // already starts a block of its own. Inside a list item, this makes the
      // list loose (see Limitations in spec/export.md).
      const isBlank = (text: string | undefined) =>
        text === undefined || /^[\s>]*$/.test(text);
      const continuation = indent === prefix;
      const breakBefore = continuation && !isBlank(lines[line - 1]);
      // After it, even a list item partial, unless a new list item follows:
      // other text would be read as part of the partial's last block
      const next = lines[line + 1];
      const breakAfter =
        !isBlank(next) && !startsListItemAfterParagraph(next, prefix.length);
      const { extraIndent } = directive.meta as { extraIndent: number };
      const withoutExtra = (text: string) =>
        text.slice(
          0,
          text.length -
            Math.min(text.match(/ *$/)![0].length, Math.max(0, extraIndent)),
        );
      const included = indentLines(
        withoutExtra(prefix) + partialText,
        withoutExtra(indent),
      ).split('\n');
      const blank = indent.trimEnd();
      lines.splice(
        line,
        1,
        ...(breakBefore ? [blank] : []),
        ...included,
        ...(breakAfter ? [blank] : []),
      );
      origins.splice(
        line,
        1,
        ...(breakBefore ? [fromFile] : []),
        ...included.map((_, i) => partial.origins[i] ?? resolvedPath),
        ...(breakAfter ? [fromFile] : []),
      );
    }
    return { text: lines.join('\n'), origins };
  }

  /**
   * Rewrites a URL written on this page to point into the export. An anchor's
   * link must name something the build publishes, as the build checks.
   */
  rewriteUrl(url: string, checked = false): string | null {
    if (!isInternalLink(url) || url.startsWith('?')) {
      return null;
    }
    const isAnchor = checked && !this.forTitle;
    const { pathname, suffix } = splitHref(url);
    const absolute = pathname.startsWith('/');
    const target = resolvePathname(`/${this.page.relPath}`, pathname);
    if (target === null) {
      return null;
    }
    const isPublished = (urlPath: string) =>
      this.context.exportPaths.has(urlPath) ||
      this.context.validTargets.has(urlPath);
    if (isAnchor) {
      // The build's checks, with its messages
      const indexPath = normalizeOutputPath(
        path.posix.join(target, 'index.html'),
      );
      if (indexPath !== target && isPublished(indexPath)) {
        throw new Error(
          `${this.displayPath}: directory link must reference index.html explicitly: "${url}" (resolved to "${target}", expected "${indexPath}")`,
        );
      }
      if (!isPublished(target)) {
        throw new Error(
          `${this.displayPath}: broken internal link: "${url}" (resolved to "${target}")`,
        );
      }
    }
    // A relative link to a file exported at its own path already works,
    // unless it climbs above the site root, which browsers clamp but the
    // export's readers do not
    const climbs = path.posix
      .normalize(
        path.posix.join(path.posix.dirname(this.page.relPath), pathname),
      )
      .startsWith('..');
    if (
      !absolute &&
      !climbs &&
      this.context.exportPaths.get(target) === target.slice(1)
    ) {
      return null;
    }
    const linked = this.linkTo(target, absolute || climbs);
    if (linked === null) {
      return null;
    }
    const rewritten = linked + suffix;
    return rewritten === url ? null : rewritten;
  }

  /** A relative link from this page to a URL path the build publishes */
  linkTo(target: string, rewriteUnknown = true): string | null {
    const pageDir = path.posix.dirname(`/${this.page.relPath}`);
    const exported = this.context.exportPaths.get(target);
    let relative: string;
    if (exported !== undefined) {
      relative =
        path.posix.relative(pageDir, `/${exported}`) ||
        path.posix.basename(exported);
    } else if (rewriteUnknown) {
      relative = path.posix.relative(pageDir, target) || '.';
      if (target.endsWith('/') && !relative.endsWith('/')) {
        relative += '/';
      }
    } else {
      return null;
    }
    return toUrlPath(relative);
  }

  /** A Markdown link destination as written, rewritten into the export */
  private rewriteDestination(raw: string, isAnchor: boolean): string {
    const bracketed = raw.startsWith('<') && raw.endsWith('>');
    // Backslash escapes and character references, as markdown-it reads them
    const url = plainMarkdown.utils.unescapeAll(
      bracketed ? raw.slice(1, -1) : raw,
    );
    const rewritten = this.rewriteUrl(url, isAnchor);
    if (rewritten === null) {
      return raw;
    }
    return markdownDestination(rewritten, bracketed);
  }

  /** Edits for the `href` and `src` values in raw HTML */
  htmlUrlEdits(
    html: string,
    foreign?: HtmlScanState,
    /** False where the build renders no anchors, such as image alt text */
    checkAnchors = true,
  ): { start: number; end: number; url: string }[] {
    const edits = [];
    for (const value of findUrlAttributes(html, foreign)) {
      // Character references only: backslashes mean nothing in HTML
      const url = value.url.includes('&')
        ? decodeHTMLAttribute(value.url)
        : value.url;
      const rewritten = this.rewriteUrl(url, checkAnchors && value.isAnchor);
      if (rewritten !== null) {
        edits.push({
          start: value.start,
          end: value.end,
          url: escapeAttribute(rewritten),
        });
      }
    }
    return edits;
  }

  /**
   * Exports a short piece of inline Markdown, such as a question. A letter in
   * front keeps it from reading as a block, such as `??? question`, since
   * the build renders it with renderInline.
   */
  exportInline(markdown: string): string {
    return this.transform(normalizeNewlines(`x${markdown.trimStart()}`))
      .slice(1)
      .trim();
  }

  transform(text: string, origins?: readonly string[]): string {
    const { tokens, record, references } = this.parse(text, { origins });
    // Definitions as tab labels need them: a label is part of the page in
    // the build, but is rendered here on its own
    const exportedReferences: References = Object.fromEntries(
      Object.entries(references).map(([label, reference]) => [
        label,
        {
          ...reference,
          href: this.rewriteUrl(reference.href) ?? reference.href,
        },
      ]),
    );
    const lines = text.split('\n');
    const lineStarts: number[] = [];
    let offset = 0;
    for (const line of lines) {
      lineStarts.push(offset);
      offset += line.length + 1;
    }
    const lineStart = (line: number) =>
      line < lines.length ? lineStarts[line] : text.length;
    const lineEnd = (line: number) => lineStarts[line] + lines[line].length;

    const edits: Edit[] = [];
    const replace = (
      start: number,
      end: number,
      replacement: Edit['replace'] | string,
    ) =>
      edits.push({
        start,
        end,
        replace:
          typeof replacement === 'string' ? () => replacement : replacement,
      });

    // Changes to the start of lines, by line: blockquote markers that alerts
    // add, and definition markers and indentation that definitions remove
    const insertions = new Map<number, PrefixChange[]>();
    const effectivePrefix = (line: number, col: number) => {
      const original = lines[line].slice(0, col);
      const changes = (insertions.get(line) ?? [])
        .filter(change => change.col <= col)
        .sort((a, b) => a.col - b.col);
      let result = '';
      let pos = 0;
      for (const change of changes) {
        result += original.slice(pos, change.col) + change.text;
        pos = Math.min(col, change.col + (change.remove ?? 0));
      }
      return result + original.slice(pos);
    };
    /** The column where a block starts on a line, and the prefix of its later lines */
    const blockStart = (line: number) => {
      const col = linePrefix(lines[line]).length;
      return {
        col,
        start: lineStarts[line] + col,
        indent: continuationPrefix(effectivePrefix(line, col)),
      };
    };
    /** Where a line's text starts after its prefix, without the prefix's trailing spaces */
    const blankStart = (line: number) =>
      lineStarts[line] + linePrefix(lines[line]).trimEnd().length;
    /** Whether a line is empty but for blockquote markers, or past the end */
    const isBlankLine = (line: number) =>
      line >= lines.length || /^[\s>]*$/.test(lines[line]);
    const isMarkerLine = (line: number, marker: string) => {
      if (line >= lines.length) {
        return false;
      }
      const rest = lines[line].slice(linePrefix(lines[line]).length).trim();
      return rest.length >= 3 && [...rest].every(char => char === marker);
    };

    const mappers = new Map<Token, (offset: number) => number>();
    const cursors = new Map<number, number>();
    const inlineMapper = (inline: Token) => {
      let mapper = mappers.get(inline);
      if (mapper) {
        return mapper;
      }
      const content = record.contents.get(inline) ?? inline.content;

      const row = record.cells.get(inline);
      if (row !== undefined) {
        // Cells are found left to right; each `|` was written `\|`
        const written = content.replace(/\|/g, '\\|');
        const col = lines[row].indexOf(written, cursors.get(row) ?? 0);
        if (col < 0) {
          throw new Error(
            `${this.displayPath}: cannot export line ${row + 1}: text not found`,
          );
        }
        cursors.set(row, col + written.length);
        mapper = (contentOffset: number) =>
          lineStarts[row] +
          col +
          contentOffset +
          (content.slice(0, contentOffset).match(/\|/g)?.length ?? 0);
        mappers.set(inline, mapper);
        return mapper;
      }

      mapper = blockMapper(content, inline.map![0]);
      mappers.set(inline, mapper);
      return mapper;
    };

    /**
     * Maps offsets in block content, whose lines are the ends of source lines
     * after their container prefixes, back to the source
     */
    const blockMapper = (content: string, firstLine: number) => {
      const notFound = (line: number) =>
        new Error(
          `${this.displayPath}: cannot export line ${line + 1}: text not found`,
        );
      const contentLines = content.split('\n');
      const cols = contentLines.map((contentLine, index) => {
        const line = firstLine + index;
        const source = lines[line] ?? '';
        if (index < contentLines.length - 1 && source.endsWith(contentLine)) {
          return source.length - contentLine.length;
        }
        const trimmed = source.trimEnd();
        if (trimmed.endsWith(contentLine)) {
          return trimmed.length - contentLine.length;
        }
        // markdown-it turns part of a tab in the indentation into spaces, so
        // only the text after the indentation is in the source as written
        const text = contentLine.trimStart();
        const col = source.indexOf(text, cursors.get(line) ?? 0);
        if (col < 0) {
          throw notFound(line);
        }
        cursors.set(line, col + text.length);
        return col - (contentLine.length - text.length);
      });
      const contentLineStarts: number[] = [];
      let pos = 0;
      for (const contentLine of contentLines) {
        contentLineStarts.push(pos);
        pos += contentLine.length + 1;
      }
      return (contentOffset: number) => {
        let index = contentLineStarts.length - 1;
        while (index > 0 && contentLineStarts[index] > contentOffset) {
          index--;
        }
        return (
          lineStarts[firstLine + index] +
          cols[index] +
          contentOffset -
          contentLineStarts[index]
        );
      };
    };

    // Raw HTML is scanned in document order, so an SVG that spans blocks
    // and paragraphs is known in all of them
    const htmlScans: {
      offset: number;
      scan: (foreign: HtmlScanState) => void;
    }[] = [];

    // Block constructs, outermost first, so nested blocks see the
    // blockquote markers of alerts around them
    tokens.forEach((token, index) => {
      if (token.type === 'container_alert_open') {
        this.exportAlert(token, {
          lines,
          blockStart,
          isMarkerLine,
          blankStart,
          insertions,
          lineStart,
          lineEnd,
          replace,
        });
      } else if (
        token.type === 'container_question_open' ||
        token.type === 'question_multiple_choice'
      ) {
        const question =
          token.type === 'question_multiple_choice'
            ? (token.meta as { question: string }).question
            : token.info.trim().match(QUESTION_PATTERN)![1];
        const [open, end] = token.map!;
        const closed = isMarkerLine(end, '?');
        this.exportDetails(question, open, closed ? end : -1, end, {
          blockStart,
          blankStart,
          isBlankLine,
          lineStart,
          lineEnd,
          replace,
        });
      } else if (token.type === 'tabs_panel_open') {
        const [open, end] = token.map!;
        const label = tokens[index + 2].content;
        this.exportDetails(
          label,
          open,
          end - 1,
          end,
          { blockStart, blankStart, isBlankLine, lineStart, lineEnd, replace },
          exportedReferences,
        );
      } else if (token.type === 'columns_open') {
        const [open, end] = token.map!;
        const separator =
          tokens
            .slice(index + 1)
            .filter(
              t => t.type === 'column_open' && t.level === token.level + 1,
            )[1].map![0] - 1;
        for (const line of [open, separator, end - 1]) {
          replace(blankStart(line), lineEnd(line), '');
        }
      } else if (token.type === 'dt_open') {
        const line = token.map![0];
        const { start, indent } = blockStart(line);
        const first = tokens[index - 1]?.type === 'dl_open';
        replace(
          start,
          lineEnd(line),
          render =>
            (first ? `<dl>\n${indent}` : '') +
            indentLines(
              `<dt>\n\n${render(start, lineEnd(line))}\n\n</dt>`,
              indent,
            ),
        );
      } else if (token.type === 'dd_open') {
        this.exportDefinition(tokens, index, {
          lines,
          insertions,
          indentAt: (line, col) =>
            continuationPrefix(effectivePrefix(line, col)),
          lineStart,
          lineEnd,
          replace,
        });
      } else if (
        token.type === 'fence' &&
        // As the build reads a fence's language
        token.info.trim().split(/\s+/)[0] === 'trace'
      ) {
        const [open, end] = token.map!;
        const { start, indent } = blockStart(open);
        replace(
          start,
          lineEnd(end - 1),
          indentLines(this.exportTrace(token.content), indent),
        );
      } else if (token.type === 'html_block') {
        // Scanned without the lines' blockquote markers, which would end a
        // tag that spans lines
        const content = token.content.replace(/\n$/, '');
        const map = blockMapper(content, token.map![0]);
        htmlScans.push({
          offset: map(0),
          scan: foreign => {
            for (const edit of this.htmlUrlEdits(content, foreign)) {
              replace(map(edit.start), map(edit.end), edit.url);
            }
          },
        });
      } else if (token.type === 'heading_open') {
        const inline = tokens[index + 1];
        const content = record.contents.get(inline) ?? '';
        const separator = findSubtitleSeparator(
          content,
          nonTextRanges(inline, record),
        );
        if (separator) {
          const map = inlineMapper(inline);
          replace(map(separator[0]), map(separator[1]), ' - ');
        }
      }
    });

    // Reference labels that links use: their definitions become anchors'
    // hrefs, which the build checks
    const linkedLabels = new Set<string>();
    const definedLabels = new Set<string>();
    for (const span of record.spans) {
      if (span.kind !== 'link' || span.inAlt || isInlineLink(span)) {
        continue;
      }
      const text = span.src.slice(span.start + 1, span.labelEnd);
      let label = text;
      if (span.src[span.labelEnd + 1] === '[') {
        // The link rule ends a full reference at its label's `]`
        const written = span.src.slice(span.labelEnd + 2, span.end - 1);
        label = written.trim() === '' ? text : written;
      }
      linkedLabels.add(plainMarkdown.utils.normalizeReference(label));
    }

    for (const [open, end] of record.references) {
      const { start } = blockStart(open);
      const definitionEnd = lineEnd(end - 1);
      const labelEnd = findReferenceLabelEnd(text.slice(start, definitionEnd));
      if (labelEnd < 0) {
        continue;
      }
      // markdown-it uses only a label's first definition
      // A label can wrap lines, which start with their containers' prefixes
      const label = plainMarkdown.utils.normalizeReference(
        text
          .slice(start + 1, start + labelEnd)
          .split('\n')
          .map((part, i) =>
            i === 0 ? part : part.slice(linePrefix(part).length),
          )
          .join('\n'),
      );
      const isAnchor = linkedLabels.has(label) && !definedLabels.has(label);
      definedLabels.add(label);
      // The destination can start on a later line, after that line's prefix
      let pos = start + labelEnd + 2;
      while (pos < definitionEnd && /\s/.test(text[pos])) {
        if (text[pos] === '\n') {
          const line = lineStarts.indexOf(pos + 1);
          pos += 1 + linePrefix(lines[line]).length;
        } else {
          pos++;
        }
      }
      const lineEndAtPos = text.indexOf('\n', pos);
      const destination = plainMarkdown.helpers.parseLinkDestination(
        text,
        pos,
        lineEndAtPos < 0 ? text.length : lineEndAtPos,
      );
      if (destination.ok && destination.pos > pos) {
        const raw = text.slice(pos, destination.pos);
        const rewritten = this.rewriteDestination(raw, isAnchor);
        if (rewritten !== raw) {
          replace(pos, destination.pos, rewritten);
        }
      }
    }

    // Place every table cell left to right, so a cell is not found in an
    // earlier cell with the same text
    for (const cell of record.cells.keys()) {
      inlineMapper(cell);
    }

    for (const span of record.spans) {
      if (!span.inline.map && !record.cells.has(span.inline)) {
        continue;
      }
      const map = inlineMapper(span.inline);
      const at = (srcOffset: number) => map(span.base + srcOffset);
      if (span.kind === 'html_inline') {
        htmlScans.push({
          offset: at(span.start),
          scan: foreign => this.exportSpan(span, at, replace, foreign),
        });
      } else {
        this.exportSpan(span, at, replace, { stack: [] });
      }
    }

    const foreign: HtmlScanState = { stack: [] };
    for (const { scan } of htmlScans.sort((a, b) => a.offset - b.offset)) {
      scan(foreign);
    }

    return applyEdits(text, edits);
  }

  private exportSpan(
    span: InlineSpan,
    at: (srcOffset: number) => number,
    replace: (
      start: number,
      end: number,
      replacement: Edit['replace'] | string,
    ) => void,
    foreign: HtmlScanState,
  ): void {
    const { src, start, end } = span;
    if (span.kind === 'wikilink') {
      // Unresolved wikilinks, such as in image alt text, stay text
      if (span.token.type !== 'link_open') {
        return;
      }
      const { title } = span.token.meta as { title: string };
      const inner = src.slice(start + 2, end - 2);
      const pipe = inner.indexOf('|');
      const leading = inner.length - inner.trimStart().length;
      const [labelStart, labelEnd] =
        pipe < 0
          ? [start + 2 + leading, start + 2 + leading + title.length]
          : [start + 2 + pipe + 1, end - 2];
      const target = this.context.pageTitles.byTitle.get(title)![0];
      const href = markdownDestination(this.linkTo(target)!);
      replace(
        at(start),
        at(end),
        render =>
          `[${escapeBrackets(render(at(labelStart), at(labelEnd)))}](${href})`,
      );
    } else if (span.kind === 'superlink') {
      const { labelEnd: titleEnd, descriptionEnd } = span;
      const descriptionStart = titleEnd + 2;
      let pos = descriptionEnd + 2;
      while (pos < end && /\s/.test(src[pos])) {
        pos++;
      }
      const destination = plainMarkdown.helpers.parseLinkDestination(
        src,
        pos,
        end,
      );
      // The superlink rule accepts only a destination, with no title
      if (!destination.ok) {
        return;
      }
      const raw = src.slice(pos, destination.pos);
      const href = this.rewriteDestination(raw, !span.inAlt);
      replace(
        at(start),
        at(end),
        render =>
          `[${render(at(start + 1), at(titleEnd))}](${href}) - ` +
          render(at(descriptionStart), at(descriptionEnd)),
      );
      // Each superlink was a block of its own: a hard line break, which must
      // end the line, keeps the next one on its own line
      const trailing = /^[ \t]*\n/.exec(src.slice(end))?.[0];
      if (trailing) {
        replace(at(end), at(end + trailing.length - 1), '\\');
      }
    } else if (span.kind === 'link' || span.kind === 'image') {
      if (span.labelEnd < 0 || !isInlineLink(span)) {
        return;
      }
      let pos = span.labelEnd + 2;
      while (pos < end && /\s/.test(src[pos])) {
        pos++;
      }
      const destination = plainMarkdown.helpers.parseLinkDestination(
        src,
        pos,
        end,
      );
      if (!destination.ok || destination.pos <= pos) {
        return;
      }
      const raw = src.slice(pos, destination.pos);
      const rewritten = this.rewriteDestination(
        raw,
        span.kind === 'link' && !span.inAlt,
      );
      if (rewritten !== raw) {
        replace(at(pos), at(destination.pos), rewritten);
      }
    } else {
      // Only the attribute values change, so a tag that spans lines keeps
      // the markers an alert added to them
      for (const edit of this.htmlUrlEdits(
        src.slice(start, end),
        foreign,
        !span.inAlt,
      )) {
        replace(at(start + edit.start), at(start + edit.end), edit.url);
      }
    }
  }

  private exportAlert(
    token: Token,
    helpers: {
      lines: string[];
      blockStart: (line: number) => {
        col: number;
        start: number;
        indent: string;
      };
      isMarkerLine: (line: number, marker: string) => boolean;
      blankStart: (line: number) => number;
      insertions: Map<number, PrefixChange[]>;
      lineStart: (line: number) => number;
      lineEnd: (line: number) => number;
      replace: (start: number, end: number, replacement: string) => void;
    },
  ): void {
    const { lines, blockStart, insertions, lineStart, lineEnd, replace } =
      helpers;
    const match = token.info.trim().match(ALERT_PATTERN)!;
    const type = match[1].toUpperCase();
    const title = (match[2] || match[3])?.trim();
    const [open, end] = token.map!;
    const { col, start, indent } = blockStart(open);

    let opening = `> [!${type}]`;
    if (title) {
      opening += `\n${indent}> **${escapeMarkdown(title)}**\n${indent}>`;
    }
    replace(start, lineEnd(open), opening);

    // Indentation is measured in columns, where a tab reaches the next stop
    // of 4, so lines indented with tabs and with spaces line up
    const openPrefix = lines[open].slice(0, col);
    const visual = /^[ \t]*$/.test(openPrefix)
      ? expandedWidth(openPrefix, 0)
      : null;
    for (let line = open + 1; line < end; line++) {
      const lead = lines[line].match(/^[ \t]*/)![0];
      if (visual !== null && lead.includes('\t')) {
        // The marker goes at the opening line's column, inside the tabs,
        // so they become the spaces they stood for
        const width = expandedWidth(lead, 0);
        const blankLine = lines[line].trim() === '';
        const text =
          ' '.repeat(visual) +
          (blankLine ? '>' : '> ') +
          ' '.repeat(Math.max(0, width - visual));
        replace(lineStart(line), lineStart(line) + lead.length, text);
        const changes = insertions.get(line) ?? [];
        changes.push({ col: 0, text, remove: lead.length });
        insertions.set(line, changes);
        continue;
      }
      const length = lines[line].length;
      const target = visual ?? col;
      const at = Math.min(
        target,
        lines[line].trim() === ''
          ? length
          : visual !== null
            ? lead.length
            : length,
      );
      const blank = lines[line].slice(at).trim() === '';
      const padding = ' '.repeat(target - at);
      replace(
        lineStart(line) + at,
        lineStart(line) + at,
        padding + (blank ? '>' : '> '),
      );
      const lineInsertions = insertions.get(line) ?? [];
      lineInsertions.push({ col: at, text: `${padding}> ` });
      insertions.set(line, lineInsertions);

      // After `> `, a tab would reach a nearer tab stop, so indentation with
      // tabs becomes the spaces it stood for
      const indentation = lines[line].slice(at).match(/^[ \t]*/)![0];
      if (indentation.includes('\t')) {
        const startColumn = expandedWidth(lines[line].slice(0, at), 0);
        const width = expandedWidth(indentation, startColumn);
        replace(
          lineStart(line) + at,
          lineStart(line) + at + indentation.length,
          ' '.repeat(width),
        );
      }
    }

    // A blank line ends the blockquote. Before a blank line or a new list
    // item, which end it too, the closing line goes, so a tight list stays
    // tight.
    if (helpers.isMarkerLine(end, '!')) {
      const next = lines[end + 1];
      const endsAnyway =
        next === undefined ||
        next.trim() === '' ||
        startsListItemAfterParagraph(next, col);
      if (endsAnyway && !insertions.has(end) && end + 1 < lines.length) {
        replace(lineStart(end), lineStart(end + 1), '');
      } else {
        replace(helpers.blankStart(end), lineEnd(end), '');
      }
    }
  }

  /** A `<details>` element from an opening line to a closing line */
  private exportDetails(
    summary: string,
    open: number,
    close: number,
    end: number,
    helpers: {
      blockStart: (line: number) => {
        col: number;
        start: number;
        indent: string;
      };
      blankStart: (line: number) => number;
      isBlankLine: (line: number) => boolean;
      lineStart: (line: number) => number;
      lineEnd: (line: number) => number;
      replace: (start: number, end: number, replacement: string) => void;
    },
    /** The page's reference definitions, for a summary the page parses */
    references?: References,
  ): void {
    const { blockStart, isBlankLine, lineStart, lineEnd, replace } = helpers;
    const { start, indent } = blockStart(open);
    const html = renderInlineHtml(this.exportInline(summary), references);
    replace(
      start,
      lineEnd(open),
      indentLines(`<details>\n<summary>${html}</summary>\n`, indent),
    );
    // A blank line ends the HTML block, so the text after it is Markdown
    const after = (line: number) =>
      isBlankLine(line) ? '' : `\n${indent.trimEnd()}`;
    if (close >= 0) {
      replace(
        helpers.blankStart(close),
        lineEnd(close),
        `\n${indent}</details>${after(close + 1)}`,
      );
    } else {
      const at = lineStart(end);
      replace(
        at,
        at,
        `${indent.trimEnd()}\n${indent}</details>${after(end)}\n`,
      );
    }
  }

  /** `: definition` becomes `<dd>`, its lines outdented to the marker */
  private exportDefinition(
    tokens: Token[],
    index: number,
    helpers: {
      lines: string[];
      insertions: Map<number, PrefixChange[]>;
      indentAt: (line: number, col: number) => string;
      lineStart: (line: number) => number;
      lineEnd: (line: number) => number;
      replace: (start: number, end: number, replacement: string) => void;
    },
  ): void {
    const { lines, insertions, indentAt, lineStart, lineEnd, replace } =
      helpers;
    const containerPrefix = (line: number) =>
      lines[line].match(CONTAINER_PREFIX_PATTERN)![0];
    // The map of a term's second and later definitions starts at the term
    const [mapStart, end] = tokens[index].map!;
    let open = mapStart;
    while (
      open < end - 1 &&
      !/^[:~][ \t]/.test(lines[open].slice(containerPrefix(open).length))
    ) {
      open++;
    }
    const col = containerPrefix(open).length;
    const indent = indentAt(open, col);
    const markerEnd =
      col + 1 + lines[open].slice(col + 1).match(/^[ \t]*/)![0].length;
    replace(
      lineStart(open) + col,
      lineStart(open) + markerEnd,
      `<dd>\n${indent.trimEnd()}\n${indent}`,
    );
    // Blocks inside the definition start where its text now starts
    const removed = (line: number, count: number) => {
      const changes = insertions.get(line) ?? [];
      changes.push({ col, text: '', remove: count });
      insertions.set(line, changes);
    };
    removed(open, markerEnd - col);

    // Later lines are indented to the text after the marker
    const contentIndent = new RegExp(`^(?:\\t| {0,${markerEnd - col}})`);
    let last = open;
    for (let line = open + 1; line < end; line++) {
      if (lines[line].trim() !== '') {
        last = line;
        const spaces = lines[line].slice(col).match(contentIndent)![0].length;
        if (spaces > 0) {
          replace(lineStart(line) + col, lineStart(line) + col + spaces, '');
          removed(line, spaces);
        }
      }
    }

    let depth = 0;
    let closeIndex = index;
    for (; closeIndex < tokens.length; closeIndex++) {
      const type = tokens[closeIndex].type;
      if (type === 'dd_open') {
        depth++;
      } else if (type === 'dd_close' && --depth === 0) {
        break;
      }
    }
    const lastInList = tokens[closeIndex + 1]?.type === 'dl_close';
    const closing = `\n\n</dd>${lastInList ? '\n</dl>' : ''}`;
    const at = lineEnd(last);
    replace(at, at, indentLines(closing, indent));
  }

  /** Code blocks with the contents of a trace block's files */
  private exportTrace(content: string): string {
    if (this.page.literateJava) {
      throw new Error(
        `${this.displayPath}: trace blocks are not supported here`,
      );
    }
    const files = content
      .split('\n')
      .map(line => line.trim())
      .filter(line => line !== '');
    if (files.length === 0) {
      throw new Error(
        `${this.displayPath}: trace block must name a source file`,
      );
    }
    const languages = getExtensionToShikiLanguage(this.context.siteVariables);
    const sources = files.map(file => {
      const absolutePath = path.resolve(path.dirname(this.page.filePath), file);
      return {
        requestedPath: file,
        absolutePath,
        text: this.context.readTraceFile(absolutePath),
      };
    });
    // A trace the build would reject is not exported either
    checkTraceFiles(files[0], sources);
    return sources
      .map(({ absolutePath: filePath, text }) => {
        const source = text.replace(/\r\n?/g, '\n').replace(/\n$/, '');
        const ext = path.extname(filePath).slice(1);
        const language =
          Object.entries(languages).find(
            ([key]) => key.toLowerCase() === ext.toLowerCase(),
          )?.[1] ?? ext;
        const longest = Math.max(
          0,
          ...[...source.matchAll(/`+/g)].map(run => run[0].length),
        );
        const fence = '`'.repeat(Math.max(3, longest + 1));
        return `${fence}${language}\n${source}\n${fence}`;
      })
      .join('\n\n');
  }
}

const TAG_NAME_PATTERN = /<([a-zA-Z][^\s/>]*)/y;
const CLOSING_TAG_NAME_PATTERN = /<\/([a-zA-Z][^\s/>]*)/y;
/** Elements whose content is not in the HTML namespace */
const FOREIGN_ELEMENTS = new Set(['svg', 'math']);
/** HTML elements whose start tag ends SVG or MathML content */
const FOREIGN_BREAKOUT_ELEMENTS = new Set([
  'b',
  'big',
  'blockquote',
  'body',
  'br',
  'center',
  'code',
  'dd',
  'div',
  'dl',
  'dt',
  'em',
  'embed',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'head',
  'hr',
  'i',
  'img',
  'li',
  'listing',
  'menu',
  'meta',
  'nobr',
  'ol',
  'p',
  'pre',
  'ruby',
  's',
  'small',
  'span',
  'strong',
  'strike',
  'sub',
  'sup',
  'table',
  'tt',
  'u',
  'ul',
  'var',
]);
/** Elements in SVG or MathML whose content is HTML again */
const HTML_INTEGRATION_POINTS = new Set([
  'foreignobject',
  'desc',
  'title',
  'mi',
  'mo',
  'mn',
  'ms',
  'mtext',
]);

/**
 * Where a scan of raw HTML is, shared by the pieces of HTML on a page, such
 * as the tags of one paragraph, which are parsed one by one
 */
interface HtmlScanState {
  /**
   * Open SVG and MathML elements, and HTML integration points in them;
   * the build checks `<a>` elements only in the HTML namespace
   */
  stack: { name: string; html: boolean }[];
  /**
   * An element whose content is text, such as `<script>`, left open at the
   * end of an earlier piece of HTML
   */
  rawText?: string;
}

function inHtmlNamespace(state: HtmlScanState): boolean {
  return state.stack.length === 0 || state.stack.at(-1)!.html;
}
const ATTRIBUTE_PATTERN =
  /([^\s"'>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/y;
/** Elements whose content is text, not markup, as the HTML parser reads it */
const RAW_TEXT_ELEMENTS = new Set([
  'script',
  'style',
  'textarea',
  'title',
  'xmp',
  'iframe',
  'noembed',
  'noframes',
  'plaintext',
]);

/**
 * The `href` and `src` values in tags in raw HTML, skipping comments and the
 * content of elements such as `<script>`
 */
function findUrlAttributes(
  html: string,
  foreign: HtmlScanState = { stack: [] },
): { start: number; end: number; url: string; isAnchor: boolean }[] {
  const values = [];
  const lower = html.toLowerCase();
  let pos = 0;
  if (foreign.rawText) {
    const close = lower.indexOf(`</${foreign.rawText}`);
    if (close < 0) {
      return [];
    }
    foreign.rawText = undefined;
    pos = close;
  }
  while (pos < html.length) {
    const open = html.indexOf('<', pos);
    if (open < 0) {
      break;
    }
    // `<!-->` and `<!--->` are whole, empty comments to the HTML parser
    const abrupt = /^<!---?>/.exec(html.slice(open, open + 6))?.[0];
    if (abrupt) {
      pos = open + abrupt.length;
      continue;
    }
    if (html.startsWith('<!--', open)) {
      const close = html.indexOf('-->', open + 4);
      if (close < 0) {
        break;
      }
      pos = close + 3;
      continue;
    }
    if (html.startsWith('</', open)) {
      CLOSING_TAG_NAME_PATTERN.lastIndex = open;
      const closing = CLOSING_TAG_NAME_PATTERN.exec(html)?.[1].toLowerCase();
      if (closing && foreign.stack.at(-1)?.name === closing) {
        foreign.stack.pop();
      }
      pos = open + 2;
      continue;
    }
    TAG_NAME_PATTERN.lastIndex = open;
    const name = TAG_NAME_PATTERN.exec(html)?.[1];
    if (!name) {
      pos = open + 1;
      continue;
    }
    // Some HTML elements end SVG and MathML content, as the HTML parser reads
    if (
      !inHtmlNamespace(foreign) &&
      FOREIGN_BREAKOUT_ELEMENTS.has(name.toLowerCase())
    ) {
      while (!inHtmlNamespace(foreign)) {
        foreign.stack.pop();
      }
    }

    let i = open + 1 + name.length;
    // A `/` right before `>` that is not part of an unquoted value
    let selfClosing = false;
    while (i < html.length && html[i] !== '>') {
      if (/[\s/]/.test(html[i])) {
        selfClosing = html[i] === '/' && html[i + 1] === '>';
        i++;
        continue;
      }
      ATTRIBUTE_PATTERN.lastIndex = i;
      const attribute = ATTRIBUTE_PATTERN.exec(html);
      if (!attribute) {
        i++;
        continue;
      }
      const url = attribute[2] ?? attribute[3] ?? attribute[4];
      if (url !== undefined && /^(?:href|src)$/i.test(attribute[1])) {
        const end =
          i + attribute[0].length - (attribute[4] === undefined ? 1 : 0);
        values.push({
          start: end - url.length,
          end,
          url,
          // The build checks only links of HTML `<a>` elements
          isAnchor:
            inHtmlNamespace(foreign) &&
            name.toLowerCase() === 'a' &&
            attribute[1].toLowerCase() === 'href',
        });
      }
      i += attribute[0].length;
    }
    pos = i + 1;
    const lowerName = name.toLowerCase();
    const htmlNamespace = inHtmlNamespace(foreign);
    if (!selfClosing) {
      if (htmlNamespace && FOREIGN_ELEMENTS.has(lowerName)) {
        foreign.stack.push({ name: lowerName, html: false });
      } else if (!htmlNamespace && HTML_INTEGRATION_POINTS.has(lowerName)) {
        foreign.stack.push({ name: lowerName, html: true });
      }
    }

    // In SVG and MathML, these elements hold markup
    if (htmlNamespace && RAW_TEXT_ELEMENTS.has(lowerName)) {
      const close = lower.indexOf(`</${name.toLowerCase()}`, pos);
      if (close < 0) {
        // Its text goes on in the next piece of HTML, such as the next tag
        // of the same paragraph
        foreign.rawText = name.toLowerCase();
        break;
      }
      pos = close;
    }
  }
  return values;
}

/** Index of the `]` before `:` in a reference definition */
function findReferenceLabelEnd(definition: string): number {
  if (!definition.startsWith('[')) {
    return -1;
  }
  for (let i = 1; i < definition.length; i++) {
    if (definition[i] === '\\') {
      i++;
    } else if (definition[i] === ']') {
      return definition[i + 1] === ':' ? i : -1;
    }
  }
  return -1;
}

/**
 * Ranges of an inline token's content that the build's subtitle rule does not
 * look in, since they are not text: raw HTML, images, link destinations and
 * titles, a wikilink's title before `|`, and inline footnotes
 */
function nonTextRanges(inline: Token, record: ParseRecord): [number, number][] {
  const ranges: [number, number][] = [];
  for (const span of record.spans) {
    if (span.inline !== inline) {
      continue;
    }
    const at = (offset: number) => span.base + offset;
    if (span.kind === 'html_inline' || span.kind === 'image') {
      ranges.push([at(span.start), at(span.end)]);
    } else if (span.kind === 'link') {
      ranges.push([at(span.labelEnd), at(span.end)]);
    } else if (span.kind === 'superlink') {
      ranges.push([at(span.descriptionEnd), at(span.end)]);
    } else if (span.kind === 'wikilink') {
      const pipe = span.src.indexOf('|', span.start);
      if (pipe >= 0 && pipe < span.end) {
        ranges.push([at(span.start), at(pipe + 1)]);
      }
    }
  }
  for (const footnote of record.footnotes) {
    if (footnote.inline === inline) {
      ranges.push([footnote.start, footnote.end]);
    }
  }
  return ranges;
}

/** Index of the ` # ` that starts a heading subtitle, outside code spans */
function findSubtitleSeparator(
  content: string,
  /** Ranges the build does not look in */
  skipped: [number, number][] = [],
): [number, number] | null {
  // The build first checks the source text, as written, for a ` # `
  const parts = content.split(/ # /);
  if (parts.length < 2 || !parts[0] || !parts.slice(1).join(' # ').trim()) {
    return null;
  }
  for (let i = 0; i < content.length; i++) {
    const char = content[i];
    const covering = skipped.filter(([start, end]) => start <= i && i < end);
    if (covering.length > 0) {
      i = Math.max(...covering.map(([, end]) => end)) - 1;
    } else if (content.startsWith(' # ', i)) {
      return [i, i + 3];
    } else if (ESCAPED_HASH_SEPARATOR_PATTERN.test(content.slice(i, i + 9))) {
      // Then splits the text, where an escaped `#` or a character reference
      // for it is plain `#`
      const separator = content.slice(i).match(ESCAPED_HASH_SEPARATOR_PATTERN)!;
      return [i, i + separator[0].length];
    } else if (char === '\\') {
      i++;
    } else if (char === '`') {
      const run = /^`+/.exec(content.slice(i))![0];
      const close = content.indexOf(run, i + run.length);
      i = close < 0 ? i + run.length - 1 : close + run.length - 1;
    }
  }
  return null;
}

/**
 * Converts a Markdown or literate Java page body, after front matter and with
 * site variables substituted, to GitHub Flavored Markdown with the title as
 * its first heading
 */
export function exportMarkdownPage(
  context: ExportContext,
  page: ExportPage,
  body: string,
): string {
  const exporter = new PageExporter(context, page);
  const expanded = exporter.expandPartials(
    normalizeNewlines(body),
    page.filePath,
  );
  const exported = exporter
    .transform(expanded.text, expanded.origins)
    .replace(/^(?:[ \t]*\n)+/, '')
    .replace(/\n+$/, '\n');
  const title = exportTitle(context, page);
  // A trailing run of `#` would be read as the heading's closing sequence
  const heading = title ? `# ${title.replace(/(^|\s)(#+)$/, '$1\\$2')}\n` : '';
  if (exported.trim() === '') {
    return heading;
  }
  return heading ? `${heading}\n${exported}` : exported;
}

/** An HTML page body with the title as an `<h1>` and links into the export */
export function exportHtmlPage(
  context: ExportContext,
  page: ExportPage,
  body: string,
): string {
  const exporter = new PageExporter(context, page);
  const edits = exporter
    .htmlUrlEdits(body)
    .map(edit => ({
      start: edit.start,
      end: edit.end,
      replace: () => edit.url,
    }));
  const html = applyEdits(body, edits).replace(/^(?:[ \t]*\r?\n)+/, '');
  const title = exportTitle(context, page);
  return title ? `<h1>${renderInlineHtml(title)}</h1>\n\n${html}` : html;
}

/**
 * A page title as inline Markdown on one line, with its links converted like
 * the body's. The build renders a title's line breaks as spaces.
 */
function exportTitle(
  context: ExportContext,
  page: ExportPage,
): string | undefined {
  return page.title
    ? new PageExporter(context, page, true).exportInline(
        page.title.replace(/\s*\n\s*/g, ' '),
      )
    : undefined;
}
