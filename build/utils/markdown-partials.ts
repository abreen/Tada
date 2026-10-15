import fs from 'fs';
import path from 'path';
import { substituteContent } from '../variables';
import type MarkdownIt from 'markdown-it';
import type StateCore from 'markdown-it/lib/rules_core/state_core.mjs';
import type StateBlock from 'markdown-it/lib/rules_block/state_block.mjs';
import type Token from 'markdown-it/lib/token.mjs';
import { extensionIsMarkdown, isPartial } from './file-types';
import type { RenderDependencyCollector } from '../types';

const MAX_INCLUDE_DEPTH = 10;
const PARTIAL_DIRECTIVE_PATTERN = /^\{\{\{([\s\S]*?)\}\}\}$/;
const ESCAPED_PARTIAL_DIRECTIVE_PATTERN = /^\\\{\{\{[\s\S]*\}\}\}$/;
const PARTIAL_CONTEXT_STACK_KEY = '__tadaMarkdownPartialContextStack';
const LOOSE_PARTIAL_LIST_META_KEY = '__tadaLoosePartialList';
const SOURCE_FILE_META_KEY = '__tadaSourceFile';

/**
 * The partial an inline token's text came from, for errors raised after
 * partials are expanded; undefined for the page's own text
 */
export function getTokenSourceFile(token: Token): string | undefined {
  const meta = token.meta as Record<string, unknown> | null;
  const sourceFile = meta?.[SOURCE_FILE_META_KEY];
  return typeof sourceFile === 'string' ? sourceFile : undefined;
}

/**
 * The path in a `{{{ path }}}` directive line, trimmed, or null when the line
 * is not a directive (including an escaped `\{{{`)
 */
export function parsePartialDirective(line: string): string | null {
  const trimmedLine = line.trim();
  if (ESCAPED_PARTIAL_DIRECTIVE_PATTERN.test(trimmedLine)) {
    return null;
  }
  return trimmedLine.match(PARTIAL_DIRECTIVE_PATTERN)?.[1].trim() ?? null;
}

/** Fails unless a directive's target can be included as a partial */
export function checkPartialTarget(
  callerPath: string,
  relativePath: string,
  resolvedPath: string,
): void {
  if (!isPartial(resolvedPath)) {
    throw new Error(
      `${callerPath}: partial target must start with "_": ${relativePath}`,
    );
  }
  if (!extensionIsMarkdown(path.extname(resolvedPath).toLowerCase())) {
    throw new Error(
      `${callerPath}: partial target must be a Markdown file: ${relativePath}`,
    );
  }
}

/** Fails when including one more partial would exceed the nesting limit */
export function checkIncludeDepth(callerPath: string, depth: number): void {
  if (depth >= MAX_INCLUDE_DEPTH) {
    throw new Error(
      `${callerPath}: maximum include depth (${MAX_INCLUDE_DEPTH}) exceeded`,
    );
  }
}

interface MarkdownPartialContext {
  filePath: string;
  depth: number;
}

interface MarkdownPartialsEnv {
  [PARTIAL_CONTEXT_STACK_KEY]?: MarkdownPartialContext[];
}

interface MarkdownPartialsOptions {
  filePath: string;
  vars: Record<string, unknown>;
  preserveHtmlComments?: boolean;
  dependencyCollector?: RenderDependencyCollector;
}

function getLineText(state: StateBlock, line: number): string {
  const start = state.bMarks[line] + state.tShift[line];
  const end = state.eMarks[line];
  return state.src.slice(start, end);
}

function getCurrentPartialContext(
  env: MarkdownPartialsEnv,
  filePath: string,
): MarkdownPartialContext {
  const stack = env[PARTIAL_CONTEXT_STACK_KEY];
  return stack?.[stack.length - 1] ?? { filePath, depth: 0 };
}

function renderPartialContent(
  relativePath: string,
  caller: MarkdownPartialContext,
  options: MarkdownPartialsOptions,
): { resolvedPath: string; content: string } {
  const resolvedPath = path.resolve(
    path.dirname(caller.filePath),
    relativePath,
  );

  if (!fs.existsSync(resolvedPath)) {
    throw new Error(
      `${caller.filePath}: partial not found: ${relativePath} (resolved to ${resolvedPath})`,
    );
  }
  checkPartialTarget(caller.filePath, relativePath, resolvedPath);

  options.dependencyCollector?.partials?.add(resolvedPath);
  checkIncludeDepth(caller.filePath, caller.depth);

  return {
    resolvedPath,
    content: substituteContent(
      fs.readFileSync(resolvedPath, 'utf-8'),
      options.vars,
      resolvedPath,
      options.preserveHtmlComments,
    ),
  };
}

function tokenizePartialContent(
  state: StateBlock,
  content: string,
  context: MarkdownPartialContext,
): void {
  const env = state.env as MarkdownPartialsEnv;
  const stack = (env[PARTIAL_CONTEXT_STACK_KEY] ??= []);
  stack.push(context);
  const tokenStart = state.tokens.length;

  try {
    const childState = new state.md.block.State(
      content.replace(/\r\n?/g, '\n'),
      state.md,
      state.env,
      state.tokens,
    );
    childState.level = state.level;
    childState.parentType = state.parentType;
    childState.tight = state.tight;
    childState.ddIndent = state.ddIndent;
    childState.listIndent = state.listIndent;

    state.md.block.tokenize(childState, childState.line, childState.lineMax);
    // A nested partial already tagged its own text
    for (const token of state.tokens.slice(tokenStart)) {
      if (token.type === 'inline' && !getTokenSourceFile(token)) {
        token.meta = {
          ...token.meta,
          [SOURCE_FILE_META_KEY]: context.filePath,
        };
      }
    }
    if (!childState.tight) {
      markCurrentListLoose(state, tokenStart);
    }
  } finally {
    stack.pop();
  }
}

function markCurrentListLoose(state: StateBlock, tokenStart: number): void {
  let closedLists = 0;
  for (let i = tokenStart - 1; i >= 0; i--) {
    const token = state.tokens[i];
    if (
      token.type === 'bullet_list_close' ||
      token.type === 'ordered_list_close'
    ) {
      closedLists++;
      continue;
    }

    if (
      token.type === 'bullet_list_open' ||
      token.type === 'ordered_list_open'
    ) {
      if (closedLists === 0) {
        token.meta = {
          ...(token.meta ?? {}),
          [LOOSE_PARTIAL_LIST_META_KEY]: true,
        };
        return;
      }
      closedLists--;
    }
  }
}

function restoreLoosePartialLists(state: StateCore): void {
  const looseListLevels: number[] = [];

  for (const token of state.tokens) {
    if (
      token.type === 'bullet_list_open' ||
      token.type === 'ordered_list_open'
    ) {
      if (token.meta?.[LOOSE_PARTIAL_LIST_META_KEY]) {
        looseListLevels.push(token.level);
      }
      continue;
    }

    if (
      token.type === 'bullet_list_close' ||
      token.type === 'ordered_list_close'
    ) {
      const listIndex = looseListLevels.lastIndexOf(token.level);
      if (listIndex !== -1) {
        looseListLevels.splice(listIndex, 1);
      }
      continue;
    }

    if (token.type !== 'paragraph_open' && token.type !== 'paragraph_close') {
      continue;
    }

    if (looseListLevels.some(level => token.level === level + 2)) {
      token.hidden = false;
    }
  }
}

export default function markdownPartialsPlugin(
  md: MarkdownIt,
  options: MarkdownPartialsOptions,
): void {
  md.core.ruler.after(
    'block',
    'tada_markdown_partial_loose_lists',
    restoreLoosePartialLists,
  );

  md.block.ruler.before(
    'paragraph',
    'tada_markdown_partial',
    (state, startLine, _endLine, silent) => {
      const relativePath = parsePartialDirective(getLineText(state, startLine));
      if (relativePath === null) {
        return false;
      }

      if (silent) {
        return true;
      }

      if (!relativePath) {
        throw new Error(`${options.filePath}: partial path is empty`);
      }

      const env = state.env as MarkdownPartialsEnv;
      const caller = getCurrentPartialContext(env, options.filePath);
      const partial = renderPartialContent(relativePath, caller, options);
      tokenizePartialContent(state, partial.content, {
        filePath: partial.resolvedPath,
        depth: caller.depth + 1,
      });
      state.line = startLine + 1;
      return true;
    },
    { alt: ['paragraph', 'reference', 'blockquote', 'list'] },
  );
}
