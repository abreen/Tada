import fs from 'fs';
import path from 'path';
import _ from 'lodash';
import type MarkdownIt from 'markdown-it';
import type StateCore from 'markdown-it/lib/rules_core/state_core.mjs';
import type StateBlock from 'markdown-it/lib/rules_block/state_block.mjs';
import { extensionIsMarkdown, isPartial } from './file-types';
import { stripHtmlComments } from './html-comments';
import type { RenderDependencyCollector } from '../types';

const MAX_INCLUDE_DEPTH = 10;
const PARTIAL_DIRECTIVE_PATTERN = /^\{\{\{([\s\S]*?)\}\}\}$/;
const ESCAPED_PARTIAL_DIRECTIVE_PATTERN = /^\\\{\{\{[\s\S]*\}\}\}$/;
const PARTIAL_CONTEXT_STACK_KEY = '__tadaMarkdownPartialContextStack';
const LOOSE_PARTIAL_LIST_META_KEY = '__tadaLoosePartialList';

interface MarkdownPartialContext {
  filePath: string;
  depth: number;
}

interface MarkdownPartialsEnv {
  [PARTIAL_CONTEXT_STACK_KEY]?: MarkdownPartialContext[];
}

interface MarkdownPartialsOptions {
  filePath: string;
  templateParams: Record<string, unknown>;
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
  if (!isPartial(resolvedPath)) {
    throw new Error(
      `${caller.filePath}: partial target must start with "_": ${relativePath}`,
    );
  }
  if (!extensionIsMarkdown(path.extname(resolvedPath).toLowerCase())) {
    throw new Error(
      `${caller.filePath}: partial target must be a Markdown file: ${relativePath}`,
    );
  }

  options.dependencyCollector?.partials?.add(resolvedPath);
  if (caller.depth >= MAX_INCLUDE_DEPTH) {
    throw new Error(
      `${caller.filePath}: maximum include depth (${MAX_INCLUDE_DEPTH}) exceeded`,
    );
  }

  const raw = fs.readFileSync(resolvedPath, 'utf-8');
  const content = stripHtmlComments(raw);

  try {
    return {
      resolvedPath,
      content: _.template(content)(options.templateParams),
    };
  } catch (err) {
    throw new Error(
      `${resolvedPath}: Lodash template error in partial: ${(err as Error).message}`,
      { cause: err },
    );
  }
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
      content,
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
      const trimmedLine = getLineText(state, startLine).trim();
      if (ESCAPED_PARTIAL_DIRECTIVE_PATTERN.test(trimmedLine)) {
        return false;
      }

      const match = trimmedLine.match(PARTIAL_DIRECTIVE_PATTERN);
      if (!match) {
        return false;
      }

      if (silent) {
        return true;
      }

      const relativePath = match[1].trim();
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
