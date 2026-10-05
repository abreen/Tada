import MarkdownIt from 'markdown-it';
import path from 'path';
import { parse as parseJava } from 'java-parser';
import { hastToHtml } from 'shiki';
import { makeLogger } from '../log';
import { getExtensionToShikiLanguage } from '../site-variables';
import { highlightCodeToHast } from './shiki-highlighter';
import externalLinksPlugin from '../external-links-plugin';
import { createApplyBasePath } from './paths';
import katexPlugin from './katex';
import { splitLines } from './literate-java';
import type { JavaTocEntry, SiteVariables } from '../types';

interface CstNode {
  name?: string;
  image?: string;
  startLine?: number;
  startOffset?: number;
  children?: Record<string, CstNode[]>;
}

interface MethodMeta {
  baseName: string;
  line: number;
  params: string[];
}

interface FieldMeta {
  name: string;
  line: number;
}

interface CodeSegment {
  type: string | null;
  lines: string[];
  startLine: number;
}

const log = makeLogger(import.meta.url);

const PROSE_LINE = /^\s*\/\/\/(\s|$)/;

function createCodeMarkdown(siteVariables: SiteVariables): MarkdownIt {
  return new MarkdownIt({ html: true, typographer: true })
    .use(externalLinksPlugin, siteVariables)
    .use(katexPlugin);
}

// Matches Markdown links: [text](url)
const MARKDOWN_LINK = /\[([^\]]*)\]\(([^)]+)\)/g;

/**
 * Rewrites Markdown links in raw `///` comment lines so that relative and
 * absolute paths become full URLs using `base + basePath`.
 */
export function rewriteProseLinks(
  lines: string[],
  siteVariables: SiteVariables,
  pageDirPath: string,
): string[] {
  const applyBasePath = createApplyBasePath(siteVariables);
  const codeExtensions = Object.keys(
    getExtensionToShikiLanguage(siteVariables),
  );

  function rewriteCodeExt(p: string): string {
    for (const ext of codeExtensions) {
      if (p.endsWith(`.${ext}`)) {
        return p + '.html';
      }
    }
    return p;
  }

  function rewriteHref(href: string): string {
    // Separate pathname from query/fragment
    const [, pathname, suffix] = href.match(/^([^?#]*)(.*)$/)!;

    // Leave external, protocol-relative, and anchor-only links unchanged
    if (
      /^[a-zA-Z][a-zA-Z\d+.-]*:/.test(href) ||
      href.startsWith('//') ||
      href.startsWith('#')
    ) {
      return href;
    }

    if (pathname.startsWith('/')) {
      // Absolute path: apply code ext rewriting, then base + basePath
      return (
        siteVariables.base + applyBasePath(rewriteCodeExt(pathname)) + suffix
      );
    }

    // Relative path: resolve against page directory, then base + basePath
    const resolved = path.posix.normalize(`/${pageDirPath}/${pathname}`);
    return (
      siteVariables.base + applyBasePath(rewriteCodeExt(resolved)) + suffix
    );
  }

  return lines.map(line => {
    if (!PROSE_LINE.test(line)) {
      return line;
    }
    return line.replace(MARKDOWN_LINK, (whole, text, href) => {
      return `[${text}](${rewriteHref(href)})`;
    });
  });
}

const KIND_LABELS: Record<string, string> = {
  constructor: 'Constructor',
  field: 'Field',
  method: 'Method',
};

const JAVA_TYPE_DECLARATION_NODES = new Set([
  'classDeclaration',
  'interfaceDeclaration',
  'enumDeclaration',
  'recordDeclaration',
]);

function extractJavaMethodMeta(methodNode: CstNode): MethodMeta | null {
  const methodHeader = methodNode.children?.methodHeader?.[0];
  const methodDeclarator = methodHeader?.children?.methodDeclarator?.[0];
  const identifier = methodDeclarator?.children?.Identifier?.[0];
  if (!identifier?.image || !identifier.startLine) {
    return null;
  }

  return {
    baseName: identifier.image,
    line: identifier.startLine,
    params: extractParameterNames(
      methodDeclarator?.children?.formalParameterList?.[0],
    ),
  };
}

function extractJavaConstructorMeta(
  constructorNode: CstNode,
): MethodMeta | null {
  const constructorDeclarator =
    constructorNode.children?.constructorDeclarator?.[0];
  const identifier =
    constructorDeclarator?.children?.simpleTypeName?.[0]?.children
      ?.typeIdentifier?.[0]?.children?.Identifier?.[0];
  if (!identifier?.image || !identifier.startLine) {
    return null;
  }

  return {
    baseName: identifier.image,
    line: identifier.startLine,
    params: extractParameterNames(
      constructorDeclarator?.children?.formalParameterList?.[0],
    ),
  };
}

function extractParameterNames(
  formalParameterListNode: CstNode | undefined,
): string[] {
  if (!formalParameterListNode) {
    return [];
  }

  const formalParameters =
    formalParameterListNode.children?.formalParameter || [];
  return formalParameters
    .map((parameterNode: CstNode) => {
      const regularParameter =
        parameterNode.children?.variableParaRegularParameter?.[0];
      if (regularParameter) {
        const declaratorId =
          regularParameter.children?.variableDeclaratorId?.[0];
        const identifier = declaratorId?.children?.Identifier?.[0];
        const underscore = declaratorId?.children?.Underscore?.[0];
        return identifier?.image || underscore?.image || null;
      }

      const varArgParameter =
        parameterNode.children?.variableArityParameter?.[0];
      return varArgParameter?.children?.Identifier?.[0]?.image || null;
    })
    .filter(Boolean) as string[];
}

function formatCallableName(
  baseName: string,
  parameterNames: string[],
): string {
  return `${baseName}(${parameterNames.join(', ')})`;
}

function collectTokensInOrder(node: CstNode): CstNode[] {
  const tokens: CstNode[] = [];
  function collect(n: CstNode | undefined): void {
    if (!n) {
      return;
    }
    if (n.image !== undefined) {
      tokens.push(n);
      return;
    }
    const children = n.children || {};
    for (const childArray of Object.values(children)) {
      for (const child of childArray) {
        if (child) {
          collect(child);
        }
      }
    }
  }
  collect(node);
  tokens.sort((a, b) => (a.startOffset ?? 0) - (b.startOffset ?? 0));
  return tokens;
}

function buildTypeString(unannTypeNode: CstNode): string {
  return collectTokensInOrder(unannTypeNode)
    .map(t => (t.image === ',' ? ', ' : t.image))
    .join('');
}

function extractJavaFieldMetas(fieldNode: CstNode): FieldMeta[] {
  const unannType = fieldNode.children?.unannType?.[0];
  if (!unannType) {
    return [];
  }
  const typeStr = buildTypeString(unannType);

  const variableDeclaratorList =
    fieldNode.children?.variableDeclaratorList?.[0];
  if (!variableDeclaratorList) {
    return [];
  }

  const results: FieldMeta[] = [];
  for (const declarator of variableDeclaratorList.children
    ?.variableDeclarator || []) {
    const declaratorId = declarator.children?.variableDeclaratorId?.[0];
    const identifier = declaratorId?.children?.Identifier?.[0];
    if (!identifier?.image || !identifier.startLine) {
      continue;
    }

    const dimsNode = declaratorId?.children?.dims?.[0];
    const dimsStr = dimsNode
      ? collectTokensInOrder(dimsNode)
          .map(t => t.image)
          .join('')
      : '';

    results.push({
      name: `${typeStr}${dimsStr} ${identifier.image}`,
      line: identifier.startLine,
    });
  }
  return results;
}

export function extractJavaMethodToc(sourceCode: string): JavaTocEntry[] {
  let cst: CstNode;
  try {
    cst = parseJava(sourceCode) as CstNode;
  } catch (err: unknown) {
    log.error`Failed to parse Java source for TOC: ${(err as Error).message}`;
    return [];
  }

  const callables: Array<{
    kind: 'method' | 'constructor' | 'field';
    baseName?: string;
    name?: string;
    line: number;
    params?: string[];
  }> = [];

  function visit(node: CstNode, typeDepth: number): void {
    if (!node || !node.name) {
      return;
    }

    if (
      (node.name === 'methodDeclaration' ||
        node.name === 'interfaceMethodDeclaration') &&
      typeDepth <= 1
    ) {
      const method = extractJavaMethodMeta(node);
      if (method) {
        callables.push({ ...method, kind: 'method' });
      }
    } else if (node.name === 'constructorDeclaration' && typeDepth === 1) {
      const constructor = extractJavaConstructorMeta(node);
      if (constructor) {
        callables.push({ ...constructor, kind: 'constructor' });
      }
    } else if (
      (node.name === 'fieldDeclaration' ||
        node.name === 'constantDeclaration') &&
      typeDepth <= 1
    ) {
      for (const field of extractJavaFieldMetas(node)) {
        callables.push({ ...field, kind: 'field' });
      }
    }

    const nextTypeDepth = JAVA_TYPE_DECLARATION_NODES.has(node.name)
      ? typeDepth + 1
      : typeDepth;
    const children = node.children || {};
    for (const value of Object.values(children)) {
      for (const child of value) {
        if (child && child.name) {
          // Anonymous classes have a classBody without a type declaration.
          if (
            node.name === 'unqualifiedClassInstanceCreationExpression' &&
            child.name === 'classBody'
          ) {
            continue;
          }
          visit(child, nextTypeDepth);
        }
      }
    }
  }

  visit(cst, 0);

  return callables.map(callable => {
    const label = KIND_LABELS[callable.kind] ?? 'Member';
    if (callable.name !== undefined) {
      return {
        kind: callable.kind,
        label,
        name: callable.name,
        line: callable.line,
      };
    }
    return {
      kind: callable.kind,
      label,
      name: formatCallableName(callable.baseName!, callable.params!),
      line: callable.line,
    };
  });
}

function escapeAttr(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

interface HastNode {
  type: string;
  value?: string;
  children?: HastNode[];
}

function hasText(node: HastNode): boolean {
  if (node.type === 'text') {
    return Boolean(node.value);
  }
  return node.children?.some(hasText) ?? false;
}

/**
 * Returns the HTML of each highlighted line. Shiki tokenizes line by line, so
 * each `span.line` is balanced on its own, even inside multi-line tokens such
 * as block comments. Empty lines get a non-breaking space so that their row
 * keeps its height.
 */
function highlightLines(source: string, lang: string): string[] {
  const pre = highlightCodeToHast(source, lang).children[0];
  const code = pre?.type === 'element' ? pre.children[0] : undefined;
  if (code?.type !== 'element') {
    throw new Error('unexpected highlighter output');
  }

  const lines: string[] = [];
  for (const line of code.children) {
    if (line.type === 'element') {
      const html = hastToHtml(line, {
        characterReferences: { useNamedReferences: true },
      });
      lines.push(hasText(line) ? html : `${html}&nbsp;`);
    }
  }
  return lines;
}

export function renderCodeSegment(
  lines: string[],
  startLine: number,
  lang: string,
  { linkLineNumbers = true }: { linkLineNumbers?: boolean } = {},
): string {
  // Lines from CRLF sources end with CR. Shiki treats CRLF as a line break
  // but would keep the last line's CR as text.
  const sourceLines = lines.map(line =>
    line.endsWith('\r') ? line.slice(0, -1) : line,
  );
  let lineHtml: string[];

  try {
    const highlighted = highlightLines(sourceLines.join('\n'), lang);
    lineHtml = sourceLines.map((_, i) => highlighted[i] ?? '');
  } catch (err: unknown) {
    log.error`Failed to highlight code block: ${(err as Error).message}`;
    lineHtml = sourceLines.map(line => escapeHtml(line));
  }

  const rows = lineHtml.map((line, i) => {
    const lineNumber = startLine + i;
    const lineNumEl = linkLineNumbers
      ? `<a class="line-number" data-pagefind-ignore tabindex="-1" id="L${lineNumber}" href="#L${lineNumber}">${lineNumber}</a>`
      : `<span class="line-number" data-pagefind-ignore data-line="${lineNumber}">${lineNumber}</span>`;
    return `<span class="code-row">${lineNumEl}<code class="shiki language-${lang}">${line}</code></span>`;
  });

  return `<pre>${rows.join('')}</pre>`;
}

export function renderCodeWithComments(
  sourceCode: string,
  lang: string,
  siteVariables: SiteVariables,
  pageDirPath?: string,
): string {
  const md = createCodeMarkdown(siteVariables);
  const lines = splitLines(sourceCode);

  // Group lines into segments
  const segments: CodeSegment[] = [];
  let currentType: string | null = null;
  let currentLines: string[] = [];
  let currentStart = 1;

  for (let i = 0; i < lines.length; i++) {
    const type =
      lang === 'java' && PROSE_LINE.test(lines[i]) ? 'prose' : 'code';
    if (type !== currentType) {
      if (currentLines.length > 0) {
        segments.push({
          type: currentType,
          lines: currentLines,
          startLine: currentStart,
        });
      }
      currentType = type;
      currentLines = [lines[i]];
      currentStart = i + 1;
    } else {
      currentLines.push(lines[i]);
    }
  }
  if (currentLines.length > 0) {
    segments.push({
      type: currentType,
      lines: currentLines,
      startLine: currentStart,
    });
  }

  return segments
    .map(segment => {
      if (segment.type === 'code') {
        return renderCodeSegment(segment.lines, segment.startLine, lang);
      } else {
        const indent = Math.min(
          ...segment.lines.map(line => {
            const match = line.match(/^(\s*)\/\/\//);
            return match ? match[1].length : 0;
          }),
        );
        const prose = segment.lines
          .map(line => line.replace(/^\s*\/\/\/(\s?)/, ''))
          .join('\n');
        const rewrittenLines =
          pageDirPath !== undefined
            ? rewriteProseLinks(segment.lines, siteVariables, pageDirPath)
            : segment.lines;
        const source = escapeAttr(rewrittenLines.join('\n'));
        return `<div class="code-prose" data-prose-source="${source}" style="--prose-indent: ${indent}ch"><div class="code-prose-gutter"></div><div class="code-prose-content">${md.render(prose)}</div></div>`;
      }
    })
    .join('');
}
