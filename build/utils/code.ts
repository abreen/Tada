import MarkdownIt from 'markdown-it';
import { parse as parseJava } from 'java-parser';
import { JSDOM } from 'jsdom';
import { makeLogger } from '../log';
import { getHighlighter } from './shiki-highlighter';
import externalLinksPlugin from '../external-links-plugin';
import applyBasePathPlugin from '../apply-base-path-plugin';
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

const log = makeLogger(__filename);

const PROSE_LINE = /^\s*\/\/\/(\s|$)/;

function createCodeMarkdown(
  siteVariables: SiteVariables,
  options: Record<string, unknown> = {},
): MarkdownIt {
  return new MarkdownIt({ html: true, typographer: true })
    .use(externalLinksPlugin, siteVariables)
    .use(applyBasePathPlugin, siteVariables, options);
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

function extractJavaMethodMeta(
  methodNode: CstNode,
  requireBody = true,
): MethodMeta | null {
  const methodBody = methodNode.children?.methodBody?.[0];
  const hasBody = Boolean(methodBody?.children?.block?.length);
  if (requireBody && !hasBody) {
    return null;
  }

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

    if (node.name === 'methodDeclaration' && typeDepth <= 1) {
      const method = extractJavaMethodMeta(node);
      if (method) {
        callables.push({ ...method, kind: 'method' });
      }
    } else if (node.name === 'interfaceMethodDeclaration' && typeDepth <= 1) {
      const method = extractJavaMethodMeta(node, false);
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

function createCodeLine(document: Document): HTMLSpanElement {
  const line = document.createElement('span');
  line.className = 'code-line';
  return line;
}

function cloneOpenElements(
  openElements: Node[],
  line: HTMLSpanElement,
): Node[] {
  const containers: Node[] = [line];

  for (const openElement of openElements) {
    const clone = openElement.cloneNode(false);
    containers[containers.length - 1].appendChild(clone);
    containers.push(clone);
  }

  return containers;
}

function splitHighlightedHtmlIntoLines(
  highlightedHtml: string,
  lineCount: number,
): string[] {
  const fragment = JSDOM.fragment(`<code>${highlightedHtml}</code>`);
  const codeEl = fragment.firstChild as HTMLElement;
  const document = codeEl.ownerDocument;
  const lines: HTMLSpanElement[] = [];
  const openElements: Node[] = [];
  let currentLine = createCodeLine(document);
  let currentContainers: Node[] = [currentLine];
  let currentLineHasContent = false;

  function finishCurrentLine(): void {
    if (!currentLineHasContent) {
      currentContainers[currentContainers.length - 1].appendChild(
        document.createTextNode('\u00A0'),
      );
    }
    lines.push(currentLine);
    currentLine = createCodeLine(document);
    currentContainers = cloneOpenElements(openElements, currentLine);
    currentLineHasContent = false;
  }

  function visit(node: Node): void {
    if (node.nodeType === 3) {
      const parts = (node.textContent || '').split('\n');
      for (let i = 0; i < parts.length; i++) {
        if (parts[i].length > 0) {
          currentContainers[currentContainers.length - 1].appendChild(
            document.createTextNode(parts[i]),
          );
          currentLineHasContent = true;
        }
        if (i < parts.length - 1) {
          finishCurrentLine();
        }
      }
      return;
    }

    if (node.nodeType !== 1) {
      return;
    }

    const clone = node.cloneNode(false);
    currentContainers[currentContainers.length - 1].appendChild(clone);
    openElements.push(node);
    currentContainers.push(clone);

    for (const child of Array.from(node.childNodes)) {
      visit(child);
    }

    currentContainers.pop();
    openElements.pop();
  }

  for (const child of Array.from(codeEl.childNodes)) {
    visit(child);
  }

  if (currentLineHasContent || lines.length < lineCount) {
    if (!currentLineHasContent) {
      currentContainers[currentContainers.length - 1].appendChild(
        document.createTextNode('\u00A0'),
      );
    }
    lines.push(currentLine);
  }

  while (lines.length < lineCount) {
    lines.push(createCodeLine(document));
  }

  return lines.map(line => line.innerHTML);
}

export function renderCodeSegment(
  lines: string[],
  startLine: number,
  lang: string,
): string {
  const source = lines.join('\n');
  let lineHtml: string[] | undefined;

  try {
    const highlighter = getHighlighter();
    const html = highlighter.codeToHtml(source, {
      lang,
      themes: { light: 'github-light', dark: 'github-dark' },
      defaultColor: false,
    });
    const fragment = JSDOM.fragment(html);
    const inner = (fragment.querySelector('code') as HTMLElement).innerHTML;
    lineHtml = splitHighlightedHtmlIntoLines(inner, lines.length);
  } catch (err: unknown) {
    log.error`Failed to highlight code block: ${(err as Error).message}`;
  }

  if (!lineHtml) {
    lineHtml = lines.map(line => escapeHtml(line));
  }

  const rows = lineHtml.map((line, i) => {
    const lineNumber = startLine + i;
    return `<span class="code-row"><a class="line-number" data-pagefind-ignore tabindex="-1" id="L${lineNumber}" href="#L${lineNumber}">${lineNumber}</a><code class="shiki language-${lang}">${line}</code></span>`;
  });

  return `<pre>${rows.join('')}</pre>`;
}

export function renderCodeWithComments(
  sourceCode: string,
  lang: string,
  siteVariables: SiteVariables,
): string {
  const md = createCodeMarkdown(siteVariables);
  const lines = sourceCode.split('\n');
  if (lines[lines.length - 1] === '') {
    lines.pop();
  }

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
        const source = escapeAttr(segment.lines.join('\n'));
        return `<div class="code-prose" data-prose-source="${source}" style="--prose-indent: ${indent}ch"><div class="code-prose-gutter"></div><div class="code-prose-content">${md.render(prose)}</div></div>`;
      }
    })
    .join('');
}
