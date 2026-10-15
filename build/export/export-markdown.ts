import path from 'path';
import MarkdownIt from 'markdown-it';
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
} from '../utils/markdown-partials';
import { toDisplayPath, toUrlPath } from '../utils/paths';
import { getSiteVars, substituteContent } from '../variables';
import type { SiteVariables } from '../types';

const URL_SCHEME_PATTERN = /^[a-zA-Z][a-zA-Z\d+.-]*:/;
/** Blockquote markers, list markers, and indentation before a block */
const LINE_PREFIX_PATTERN =
  /^(?:[ \t]*(?:>|[-+*](?=[ \t]|$)|\d{1,9}[.)](?=[ \t]|$)))*[ \t]*/;
const LIST_MARKER_PATTERN = /[-+*]|\d{1,9}[.)]/g;
const MARKDOWN_PUNCTUATION_PATTERN = /[\\`*_[\]<>]/g;

/** What exporting a page needs to know about the rest of the site */
export interface ExportContext {
  siteVariables: SiteVariables;
  pageTitles: PageTitleIndex;
  /**
   * Root-relative URL paths the build publishes (`/a/b.html`, `/a/`) mapped
   * to paths in the export, relative to its root (`a/b.md`)
   */
  exportPaths: ReadonlyMap<string, string>;
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
  /** Keeps `<!--- -->` comments, as literate Java pages do */
  preserveHtmlComments?: boolean;
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
  /** Index of the `]` that ends a link's or image's label */
  labelEnd: number;
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

/** Renders inline Markdown as HTML, for markup that GitHub does not parse */
export function renderInlineHtml(markdown: string): string {
  return plainMarkdown.renderInline(markdown).trim();
}

interface RuleEntry<T> {
  name: string;
  fn: T;
  alt: string[];
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
  let sources: { src: string; base: number }[] = [];
  const baseOf = (src: string) =>
    sources.findLast(source => source.src === src)?.base;

  /** Runs a rule that parses the label opened at `labelOpen` as its own text */
  const parsingLabel = (
    rule: RuleInline,
    state: StateInline,
    silent: boolean,
    labelOpen: number,
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
    (state, silent) =>
      // `^[text]`
      parsingLabel(footnote.fn, state, silent, state.pos + 1),
    { alt: footnote.alt },
  );

  for (const kind of Object.keys(EXPECTED_TOKENS) as SpanKind[]) {
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
              parsingLabel(rule.fn, state, silent, start + 1)
            : rule.fn(state, silent);
        if (!matched) {
          return false;
        }
        const token = state.tokens
          .slice(tokenCount)
          .find(t => t.type === EXPECTED_TOKENS[kind]);
        if (!silent && current && token && base !== undefined) {
          const end = state.pos;
          let labelEnd = -1;
          if (kind === 'link' || kind === 'image') {
            labelEnd = state.md.helpers.parseLinkLabel(
              state,
              kind === 'image' ? start + 1 : start,
              kind === 'link',
            );
            state.pos = end;
          }
          record.spans.push({
            kind,
            token,
            inline: current,
            src: state.src,
            base,
            start,
            end,
            labelEnd,
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

function escapeMarkdown(text: string): string {
  return text.replace(MARKDOWN_PUNCTUATION_PATTERN, char => `\\${char}`);
}

function normalizeNewlines(text: string): string {
  const normalized = text.replace(/\r\n?/g, '\n');
  return normalized.endsWith('\n') ? normalized : `${normalized}\n`;
}

function safeDecode(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
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
  ) {}

  private get displayPath(): string {
    return toDisplayPath(this.page.filePath);
  }

  private createParser(record: ParseRecord): MarkdownIt {
    const md = createMarkdown(this.context.siteVariables, {
      filePath: this.page.filePath,
      pageTitles: this.context.pageTitles,
    });
    md.use(partialDirectivePlugin);
    md.use(recorderPlugin, record);
    return md;
  }

  private parse(text: string): { tokens: Token[]; record: ParseRecord } {
    const record: ParseRecord = {
      spans: [],
      contents: new Map(),
      cells: new Map(),
      references: [],
    };
    const tokens = this.createParser(record).parse(text, {});
    return { tokens, record };
  }

  /** Replaces partial directives with the partials' text, recursively */
  expandPartials(text: string, fromFile: string, depth = 0): string {
    if (!text.includes('{{{')) {
      return text;
    }
    const { tokens } = this.parse(text);
    const directives = tokens.filter(token => token.type === 'export_partial');
    if (directives.length === 0) {
      return text;
    }
    const caller = toDisplayPath(fromFile);
    const lines = text.split('\n');
    for (const directive of directives.reverse()) {
      const relativePath = directive.info;
      if (!relativePath) {
        throw new Error(`${caller}: partial path is empty`);
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
            this.page.preserveHtmlComments,
          ),
        ),
        resolvedPath,
        depth + 1,
      ).replace(/\n$/, '');

      const line = directive.map![0];
      const original = lines[line];
      const prefix = original.slice(0, original.indexOf('{{{'));
      const indent = continuationPrefix(prefix);
      // The build parses a partial as blocks of their own, so blank lines keep
      // it from joining a paragraph or list around it
      const isBlank = (text: string | undefined) =>
        text === undefined || /^[\s>]*$/.test(text);
      const before = isBlank(lines[line - 1]) ? '' : `${indent.trimEnd()}\n`;
      const after = isBlank(lines[line + 1]) ? '' : `\n${indent.trimEnd()}`;
      lines[line] =
        (before ? before + indent : prefix) +
        indentLines(partial, indent) +
        after;
    }
    return lines.join('\n');
  }

  /** Rewrites a URL written on this page to point into the export */
  rewriteUrl(url: string): string | null {
    if (
      url === '' ||
      URL_SCHEME_PATTERN.test(url) ||
      url.startsWith('//') ||
      url.startsWith('#') ||
      url.startsWith('?')
    ) {
      return null;
    }
    const [, urlPath, suffix] = url.match(/^([^?#]*)(.*)$/s)!;
    const decoded = urlPath.split('/').map(safeDecode).join('/');
    const absolute = decoded.startsWith('/');
    const pageDir = path.posix.dirname(`/${this.page.relPath}`);
    const target = path.posix.normalize(
      absolute ? decoded : path.posix.join(pageDir, decoded),
    );
    if (!target.startsWith('/') || target.startsWith('/..')) {
      return null;
    }
    // A relative link to a file exported at its own path already works
    if (!absolute && this.context.exportPaths.get(target) === target.slice(1)) {
      return null;
    }
    const linked = this.linkTo(target, absolute);
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

  private rewriteDestination(raw: string): string {
    if (raw.startsWith('<') && raw.endsWith('>')) {
      const rewritten = this.rewriteUrl(raw.slice(1, -1));
      return rewritten === null ? raw : `<${rewritten}>`;
    }
    return this.rewriteUrl(raw) ?? raw;
  }

  rewriteHtml(html: string): string {
    const rewriter = new HTMLRewriter();
    for (const attribute of ['href', 'src']) {
      rewriter.on(`[${attribute}]`, {
        element: element => {
          const value = element.getAttribute(attribute);
          const rewritten = value === null ? null : this.rewriteUrl(value);
          if (rewritten !== null) {
            element.setAttribute(attribute, rewritten);
          }
        },
      });
    }
    return rewriter.transform(html);
  }

  /** Exports a short piece of inline Markdown, such as a question */
  exportInline(markdown: string): string {
    return this.transform(normalizeNewlines(markdown)).trim();
  }

  transform(text: string): string {
    const { tokens, record } = this.parse(text);
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

    // Blockquote markers that alerts add to their lines, by line
    const insertions = new Map<number, { col: number; text: string }[]>();
    const effectivePrefix = (line: number, col: number) => {
      const original = lines[line].slice(0, col);
      let result = '';
      let pos = 0;
      for (const insertion of insertions.get(line) ?? []) {
        if (insertion.col <= col) {
          result += original.slice(pos, insertion.col) + insertion.text;
          pos = insertion.col;
        }
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
      const notFound = (line: number) =>
        new Error(
          `${this.displayPath}: cannot export line ${line + 1}: text not found`,
        );

      const row = record.cells.get(inline);
      if (row !== undefined) {
        // Cells are found left to right; each `|` was written `\|`
        const written = content.replace(/\|/g, '\\|');
        const col = lines[row].indexOf(written, cursors.get(row) ?? 0);
        if (col < 0) {
          throw notFound(row);
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

      const contentLines = content.split('\n');
      const firstLine = inline.map![0];
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
        const col = source.indexOf(contentLine, cursors.get(line) ?? 0);
        if (col < 0) {
          throw notFound(line);
        }
        cursors.set(line, col + contentLine.length);
        return col;
      });
      const contentLineStarts: number[] = [];
      let pos = 0;
      for (const contentLine of contentLines) {
        contentLineStarts.push(pos);
        pos += contentLine.length + 1;
      }
      mapper = (contentOffset: number) => {
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
      mappers.set(inline, mapper);
      return mapper;
    };

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
          lineStart,
          lineEnd,
          replace,
        });
      } else if (token.type === 'tabs_panel_open') {
        const [open, end] = token.map!;
        const label = tokens[index + 2].content;
        this.exportDetails(label, open, end - 1, end, {
          blockStart,
          blankStart,
          lineStart,
          lineEnd,
          replace,
        });
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
          blockStart,
          lineStart,
          lineEnd,
          replace,
        });
      } else if (token.type === 'fence' && token.info.trim() === 'trace') {
        const [open, end] = token.map!;
        const { start, indent } = blockStart(open);
        replace(
          start,
          lineEnd(end - 1),
          indentLines(this.exportTrace(token.content), indent),
        );
      } else if (token.type === 'html_block') {
        const [open, end] = token.map!;
        const start = lineStart(open);
        for (const value of findUrlAttributes(
          text.slice(start, lineEnd(end - 1)),
        )) {
          const rewritten = this.rewriteUrl(value.url);
          if (rewritten !== null) {
            replace(start + value.start, start + value.end, rewritten);
          }
        }
      } else if (token.type === 'heading_open') {
        const inline = tokens[index + 1];
        const content = record.contents.get(inline) ?? '';
        const separator = findSubtitleSeparator(content);
        if (separator >= 0) {
          const map = inlineMapper(inline);
          replace(map(separator), map(separator + 3), ' - ');
        }
      }
    });

    for (const [open, end] of record.references) {
      const { start } = blockStart(open);
      const definition = text.slice(start, lineEnd(end - 1));
      const labelEnd = findReferenceLabelEnd(definition);
      if (labelEnd < 0) {
        continue;
      }
      let pos = labelEnd + 2;
      while (pos < definition.length && /\s/.test(definition[pos])) {
        pos++;
      }
      const destination = plainMarkdown.helpers.parseLinkDestination(
        definition,
        pos,
        definition.length,
      );
      if (destination.ok && destination.pos > pos) {
        const raw = definition.slice(pos, destination.pos);
        const rewritten = this.rewriteDestination(raw);
        if (rewritten !== raw) {
          replace(start + pos, start + destination.pos, rewritten);
        }
      }
    }

    for (const span of record.spans) {
      if (!span.inline.map && !record.cells.has(span.inline)) {
        continue;
      }
      const map = inlineMapper(span.inline);
      const at = (srcOffset: number) => map(span.base + srcOffset);
      this.exportSpan(span, at, replace);
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
      const href = this.linkTo(target)!;
      replace(
        at(start),
        at(end),
        render => `[${render(at(labelStart), at(labelEnd))}](${href})`,
      );
    } else if (span.kind === 'superlink') {
      const md = plainMarkdown;
      const titleEnd = findLabelEnd(src, start);
      const descriptionStart = titleEnd + 2;
      const descriptionEnd = findLabelEnd(src, titleEnd + 1);
      let pos = descriptionEnd + 2;
      while (pos < end && /\s/.test(src[pos])) {
        pos++;
      }
      const destination = md.helpers.parseLinkDestination(src, pos, end);
      const raw = src.slice(pos, destination.pos);
      // Each superlink was a block of its own: keep the next one on its own line
      const lineBreak = src[end] === '\n' ? '\\' : '';
      replace(
        at(start),
        at(end),
        render =>
          `[${render(at(start + 1), at(titleEnd))}](${this.rewriteDestination(raw)}) - ` +
          render(at(descriptionStart), at(descriptionEnd)) +
          lineBreak,
      );
    } else if (span.kind === 'link' || span.kind === 'image') {
      if (span.labelEnd < 0 || src[span.labelEnd + 1] !== '(') {
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
      const rewritten = this.rewriteDestination(raw);
      if (rewritten !== raw) {
        replace(at(pos), at(destination.pos), rewritten);
      }
    } else {
      // Only the attribute values change, so a tag that spans lines keeps
      // the markers an alert added to them
      for (const value of findUrlAttributes(src.slice(start, end))) {
        const rewritten = this.rewriteUrl(value.url);
        if (rewritten !== null) {
          replace(at(start + value.start), at(start + value.end), rewritten);
        }
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
      insertions: Map<number, { col: number; text: string }[]>;
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

    for (let line = open + 1; line < end; line++) {
      const length = lines[line].length;
      const at = Math.min(col, length);
      const blank = lines[line].slice(at).trim() === '';
      const padding = ' '.repeat(col - at);
      replace(
        lineStart(line) + at,
        lineStart(line) + at,
        padding + (blank ? '>' : '> '),
      );
      const lineInsertions = insertions.get(line) ?? [];
      lineInsertions.push({ col: at, text: `${padding}> ` });
      insertions.set(line, lineInsertions);
    }

    // A blank line ends the blockquote
    if (helpers.isMarkerLine(end, '!')) {
      replace(helpers.blankStart(end), lineEnd(end), '');
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
      lineStart: (line: number) => number;
      lineEnd: (line: number) => number;
      replace: (start: number, end: number, replacement: string) => void;
    },
  ): void {
    const { blockStart, lineStart, lineEnd, replace } = helpers;
    const { start, indent } = blockStart(open);
    const html = renderInlineHtml(this.exportInline(summary));
    replace(
      start,
      lineEnd(open),
      indentLines(`<details>\n<summary>${html}</summary>\n`, indent),
    );
    if (close >= 0) {
      replace(
        helpers.blankStart(close),
        lineEnd(close),
        `\n${indent}</details>`,
      );
    } else {
      const at = lineStart(end);
      replace(at, at, `${indent.trimEnd()}\n${indent}</details>\n`);
    }
  }

  /** `: definition` becomes `<dd>`, its lines outdented to the marker */
  private exportDefinition(
    tokens: Token[],
    index: number,
    helpers: {
      lines: string[];
      blockStart: (line: number) => {
        col: number;
        start: number;
        indent: string;
      };
      lineStart: (line: number) => number;
      lineEnd: (line: number) => number;
      replace: (start: number, end: number, replacement: string) => void;
    },
  ): void {
    const { lines, blockStart, lineStart, lineEnd, replace } = helpers;
    // The map of a term's second and later definitions starts at the term
    const [mapStart, end] = tokens[index].map!;
    let open = mapStart;
    while (
      open < end - 1 &&
      !/^[:~][ \t]/.test(lines[open].slice(linePrefix(lines[open]).length))
    ) {
      open++;
    }
    const { col, start, indent } = blockStart(open);
    const markerEnd =
      col + 1 + lines[open].slice(col + 1).match(/^[ \t]*/)![0].length;
    replace(
      start,
      lineStart(open) + markerEnd,
      `<dd>\n${indent.trimEnd()}\n${indent}`,
    );

    // Later lines are indented to the text after the marker
    const contentIndent = new RegExp(`^ {0,${markerEnd - col}}`);
    let last = open;
    for (let line = open + 1; line < end; line++) {
      if (lines[line].trim() !== '') {
        last = line;
        const spaces = lines[line].slice(col).match(contentIndent)![0].length;
        if (spaces > 0) {
          replace(lineStart(line) + col, lineStart(line) + col + spaces, '');
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
    const files = content
      .split('\n')
      .map(line => line.trim())
      .filter(line => line !== '');
    if (files.length === 0) {
      throw new Error(`${this.displayPath}: trace block is empty`);
    }
    const languages = this.context.siteVariables.extensionToShikiLanguage ?? {};
    return files
      .map(file => {
        const filePath = path.resolve(path.dirname(this.page.filePath), file);
        const source = this.context
          .readTraceFile(filePath)
          .replace(/\r\n?/g, '\n')
          .replace(/\n$/, '');
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

const TAG_NAME_PATTERN = /^<([a-zA-Z][^\s/>]*)/;
const ATTRIBUTE_PATTERN =
  /([^\s"'>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/y;
/** Elements whose content is text, not markup */
const RAW_TEXT_ELEMENTS = new Set(['script', 'style', 'textarea', 'title']);

/**
 * The `href` and `src` values in tags in raw HTML, skipping comments and the
 * content of elements such as `<script>`
 */
function findUrlAttributes(
  html: string,
): { start: number; end: number; url: string }[] {
  const values = [];
  const lower = html.toLowerCase();
  let pos = 0;
  while (pos < html.length) {
    const open = html.indexOf('<', pos);
    if (open < 0) {
      break;
    }
    if (html.startsWith('<!--', open)) {
      const close = html.indexOf('-->', open + 4);
      if (close < 0) {
        break;
      }
      pos = close + 3;
      continue;
    }
    const name = TAG_NAME_PATTERN.exec(html.slice(open))?.[1];
    if (!name) {
      pos = open + 1;
      continue;
    }

    let i = open + 1 + name.length;
    while (i < html.length && html[i] !== '>') {
      if (/[\s/]/.test(html[i])) {
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
        values.push({ start: end - url.length, end, url });
      }
      i += attribute[0].length;
    }
    pos = i + 1;

    if (RAW_TEXT_ELEMENTS.has(name.toLowerCase())) {
      const close = lower.indexOf(`</${name.toLowerCase()}`, pos);
      if (close < 0) {
        break;
      }
      pos = close;
    }
  }
  return values;
}

/** Index of the `]` that closes the label opened at `open`, skipping escapes and code */
function findLabelEnd(src: string, open: number): number {
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    const char = src[i];
    if (char === '\\') {
      i++;
    } else if (char === '`') {
      const run = /^`+/.exec(src.slice(i))![0];
      const close = src.indexOf(run, i + run.length);
      i = close < 0 ? i + run.length - 1 : close + run.length - 1;
    } else if (char === '[') {
      depth++;
    } else if (char === ']' && --depth === 0) {
      return i;
    }
  }
  return -1;
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

/** Index of the ` # ` that starts a heading subtitle, outside code spans */
function findSubtitleSeparator(content: string): number {
  for (let i = 0; i < content.length; i++) {
    const char = content[i];
    if (char === '\\') {
      i++;
    } else if (char === '`') {
      const run = /^`+/.exec(content.slice(i))![0];
      const close = content.indexOf(run, i + run.length);
      i = close < 0 ? i + run.length - 1 : close + run.length - 1;
    } else if (content.startsWith(' # ', i)) {
      const main = content.slice(0, i).trim();
      const subtitle = content.slice(i + 3).trim();
      return main && subtitle ? i : -1;
    }
  }
  return -1;
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
    .transform(expanded)
    .replace(/^(?:[ \t]*\n)+/, '')
    .replace(/\n+$/, '\n');
  const heading = page.title ? `# ${page.title}\n` : '';
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
  const html = exporter.rewriteHtml(body).replace(/^(?:[ \t]*\r?\n)+/, '');
  return page.title
    ? `<h1>${renderInlineHtml(page.title)}</h1>\n\n${html}`
    : html;
}
