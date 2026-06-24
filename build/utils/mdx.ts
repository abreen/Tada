import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';
import { compileSync, createProcessor, runSync } from '@mdx-js/mdx';
import { convertMarkdown as curlyQuote } from 'quote-quote';
import katex from 'katex';
import renderA11yString from 'katex/contrib/render-a11y-string';
import textToId, { deduplicateId } from '../text-to-id';
import { isBundledLanguage, isPlainTextLanguage } from '../site-variables';
import { highlightCode } from './shiki-highlighter';
import { footnoteLabel } from './markdown';
import type { RenderDependencyCollector } from '../types';
import type { SiteVariables } from '../types';

const FRAGMENT = Symbol('TadaMdxFragment');
const COLUMN = Symbol('TadaMdxColumn');
const CHOICE = Symbol('TadaMdxChoice');
const SLIDE = Symbol('TadaMdxSlide');
const FOOTNOTE = Symbol('TadaMdxFootnote');
const VOID_ELEMENTS = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'param',
  'source',
  'track',
  'wbr',
]);

interface RawHtml {
  kind: 'raw';
  html: string;
}

interface MdxElement {
  type: string | symbol;
  props: Record<string, unknown>;
}

type MdxNode =
  | RawHtml
  | MdxElement
  | MdxNode[]
  | string
  | number
  | boolean
  | null
  | undefined;

export interface MdxRenderOptions {
  filePath: string;
  templateParams: Record<string, unknown>;
  dependencyCollector?: RenderDependencyCollector;
  state?: MdxRenderState;
  metadata?: MdxRenderMetadata;
  renderFence?: (source: string, language: string) => string | null;
}

export interface MdxRenderMetadata {
  tocItems: unknown[];
  alertIds: string[];
}

interface MdxRenderState {
  alertIds: Map<string, number>;
  alertIdList: string[];
  headingIds: Map<string, number>;
  definitionIds: Map<string, number>;
  tocItems: unknown[];
  includeStack: string[];
}

function jsxAttribute(name: string, value: string | null): AstNode {
  return { type: 'mdxJsxAttribute', name, value };
}

function footnotesAndDefinitionsPlugin() {
  return (tree: AstNode) => {
    const definitions = new Map<string, AstNode[]>();
    const rootChildren: AstNode[] = [];

    for (const child of tree.children || []) {
      if (
        child.type === 'definition' &&
        typeof child.identifier === 'string' &&
        child.identifier.startsWith('^')
      ) {
        definitions.set(child.identifier.slice(1), [
          { type: 'text', value: String(child.url || '') },
        ]);
        continue;
      }
      if (child.type === 'paragraph' && child.children?.[0]?.type === 'text') {
        const first = child.children[0];
        const match = (first.value || '').match(/^\[\^([^\]]+)\]:\s*/);
        if (match) {
          const rest = (first.value || '').slice(match[0].length);
          definitions.set(match[1], [
            ...(rest ? [{ type: 'text', value: rest }] : []),
            ...child.children.slice(1),
          ]);
          continue;
        }
      }
      rootChildren.push(child);
    }

    const order: string[] = [];
    const splitReferences = (value: string): AstNode[] => {
      const result: AstNode[] = [];
      const pattern = /\[\^([^\]]+)\]/g;
      let start = 0;
      for (const match of value.matchAll(pattern)) {
        const id = match[1];
        if (!definitions.has(id)) {
          continue;
        }
        const offset = match.index!;
        if (offset > start) {
          result.push({ type: 'text', value: value.slice(start, offset) });
        }
        let index = order.indexOf(id);
        if (index === -1) {
          order.push(id);
          index = order.length - 1;
        }
        result.push({
          type: 'mdxJsxTextElement',
          name: 'FootnoteRef',
          attributes: [jsxAttribute('index', String(index + 1))],
          children: [],
        });
        start = offset + match[0].length;
      }
      if (start < value.length) {
        result.push({ type: 'text', value: value.slice(start) });
      }
      return result.length > 0 ? result : [{ type: 'text', value }];
    };

    const visit = (node: AstNode): void => {
      if (!node.children) {
        return;
      }
      const children: AstNode[] = [];
      for (const child of node.children) {
        if (child.type === 'text' && child.value?.includes('[^')) {
          children.push(...splitReferences(child.value));
        } else {
          visit(child);
          children.push(child);
        }
      }
      node.children = children;
    };

    tree.children = rootChildren;
    visit(tree);

    tree.children = (tree.children || []).map(child => {
      if (child.type !== 'paragraph' || child.children?.[0]?.type !== 'text') {
        return child;
      }
      const first = child.children[0];
      const match = (first.value || '').match(/^([^\n]+)\n:\s*(.*)$/);
      if (!match) {
        return child;
      }
      return {
        type: 'mdxJsxFlowElement',
        name: 'Definition',
        attributes: [jsxAttribute('term', match[1])],
        children: [
          ...(match[2] ? [{ type: 'text', value: match[2] }] : []),
          ...child.children.slice(1),
        ],
      };
    });

    if (order.length > 35) {
      footnoteLabel(order.length);
    }
    if (order.length > 0) {
      tree.children.push({
        type: 'mdxJsxFlowElement',
        name: 'Footnotes',
        attributes: [],
        children: order.map((id, index) => ({
          type: 'mdxJsxFlowElement',
          name: 'Footnote',
          attributes: [jsxAttribute('index', String(index + 1))],
          children: definitions.get(id) || [],
        })),
      });
    }
  };
}

function tablePlugin() {
  const inlineProcessor = createProcessor({ format: 'mdx' });
  return (tree: AstNode, file: { value: unknown }) => {
    const source = String(file.value);
    const splitRow = (line: string): string[] => {
      const trimmed = line.trim().replace(/^\|/, '').replace(/\|$/, '');
      return trimmed
        .split(/(?<!\\)\|/)
        .map(cell => cell.trim().replace(/\\\|/g, '|'));
    };
    const inlineChildren = (value: string): AstNode[] => {
      const parsed = inlineProcessor.parse(value) as AstNode;
      const paragraph = parsed.children?.[0];
      return paragraph?.type === 'paragraph' && paragraph.children
        ? paragraph.children
        : [{ type: 'text', value }];
    };
    const cell = (
      name: 'th' | 'td',
      value: string,
      align: string | undefined,
    ): AstNode => ({
      type: 'mdxJsxFlowElement',
      name,
      attributes: align ? [jsxAttribute('align', align)] : [],
      children: inlineChildren(value),
    });
    const row = (
      values: string[],
      name: 'th' | 'td',
      alignments: Array<string | undefined>,
    ): AstNode => ({
      type: 'mdxJsxFlowElement',
      name: 'tr',
      attributes: [],
      children: values.map((value, index) =>
        cell(name, value, alignments[index]),
      ),
    });

    tree.children = (tree.children || []).map(node => {
      const start = node.position?.start?.offset;
      const end = node.position?.end?.offset;
      if (
        node.type !== 'paragraph' ||
        typeof start !== 'number' ||
        typeof end !== 'number'
      ) {
        return node;
      }
      const lines = source.slice(start, end).split('\n');
      if (lines.length < 2) {
        return node;
      }
      const headers = splitRow(lines[0]);
      const delimiters = splitRow(lines[1]);
      if (
        headers.length !== delimiters.length ||
        !delimiters.every(value => /^:?-{3,}:?$/.test(value))
      ) {
        return node;
      }
      const alignments = delimiters.map(value =>
        value.startsWith(':') && value.endsWith(':')
          ? 'center'
          : value.startsWith(':')
            ? 'left'
            : value.endsWith(':')
              ? 'right'
              : undefined,
      );
      const bodyRows = lines.slice(2).map(line => splitRow(line));
      return {
        type: 'mdxJsxFlowElement',
        name: 'table',
        attributes: [],
        children: [
          {
            type: 'mdxJsxFlowElement',
            name: 'thead',
            attributes: [],
            children: [row(headers, 'th', alignments)],
          },
          {
            type: 'mdxJsxFlowElement',
            name: 'tbody',
            attributes: [],
            children: bodyRows.map(values => row(values, 'td', alignments)),
          },
        ],
      };
    });
  };
}

interface AstNode {
  type: string;
  body?: AstNode[];
  children?: AstNode[];
  value?: string | null;
  position?: { start?: { offset?: number }; end?: { offset?: number } };
  [key: string]: unknown;
}

function mathElement(formula: string, display = false): AstNode {
  return {
    type: display ? 'mdxJsxFlowElement' : 'mdxJsxTextElement',
    name: 'Math',
    attributes: [
      { type: 'mdxJsxAttribute', name: 'formula', value: formula },
      ...(display
        ? [{ type: 'mdxJsxAttribute', name: 'display', value: null }]
        : []),
    ],
    children: [],
  };
}

function splitInlineMath(value: string): AstNode[] {
  const nodes: AstNode[] = [];
  let textStart = 0;
  let index = 0;

  while (index < value.length) {
    if (
      value[index] !== '$' ||
      value[index - 1] === '\\' ||
      value[index + 1] === '$' ||
      /\s|\d/.test(value[index + 1] || '')
    ) {
      index++;
      continue;
    }
    let close = index + 1;
    while (close < value.length) {
      if (
        value[close] === '$' &&
        value[close - 1] !== '\\' &&
        value[close - 1] !== ' '
      ) {
        break;
      }
      close++;
    }
    if (close >= value.length) {
      index++;
      continue;
    }
    if (index > textStart) {
      nodes.push({ type: 'text', value: value.slice(textStart, index) });
    }
    nodes.push(mathElement(value.slice(index + 1, close)));
    index = close + 1;
    textStart = index;
  }

  if (textStart < value.length) {
    nodes.push({ type: 'text', value: value.slice(textStart) });
  }
  return nodes.length === 0 ? [{ type: 'text', value }] : nodes;
}

function mathPlugin() {
  return (tree: AstNode) => {
    const visit = (node: AstNode): void => {
      if (!node.children) {
        return;
      }
      const transformed: AstNode[] = [];
      for (const child of node.children) {
        if (
          child.type === 'paragraph' &&
          child.children?.length === 1 &&
          child.children[0].type === 'text'
        ) {
          const value = child.children[0].value || '';
          const display = value.match(/^\s*\$\$([\s\S]+)\$\$\s*$/);
          if (display) {
            transformed.push(mathElement(display[1], true));
            continue;
          }
        }
        if (child.type === 'text' && child.value?.includes('$')) {
          transformed.push(...splitInlineMath(child.value));
          continue;
        }
        if (child.type !== 'code' && child.type !== 'inlineCode') {
          visit(child);
        }
        transformed.push(child);
      }
      node.children = transformed;
    };
    visit(tree);
  };
}

function mathJsx(formula: string, display = false): string {
  return `<Math formula={${JSON.stringify(formula)}}${display ? ' display' : ''} />`;
}

export function protectMdxMath(source: string): string {
  const lines = source.replace(/\r\n?/g, '\n').split('\n');
  const output: string[] = [];
  let fence: string | null = null;
  let displayFormula: string[] | null = null;

  const findOutsideCode = (
    line: string,
    delimiter: string,
    start = 0,
  ): number => {
    let codeTicks = 0;
    let index = 0;
    while (index < line.length) {
      if (line[index] === '`') {
        let end = index;
        while (line[end] === '`') {
          end++;
        }
        const ticks = end - index;
        codeTicks = codeTicks === ticks ? 0 : codeTicks || ticks;
        index = end;
        continue;
      }
      if (
        index >= start &&
        codeTicks === 0 &&
        line.startsWith(delimiter, index)
      ) {
        return index;
      }
      index++;
    }
    return -1;
  };

  const inline = (line: string): string => {
    let result = '';
    let index = 0;
    let codeTicks = 0;
    while (index < line.length) {
      if (line[index] === '`') {
        let end = index;
        while (line[end] === '`') {
          end++;
        }
        const ticks = end - index;
        codeTicks = codeTicks === ticks ? 0 : codeTicks || ticks;
        result += line.slice(index, end);
        index = end;
        continue;
      }
      if (
        codeTicks === 0 &&
        line[index] === '$' &&
        line[index - 1] !== '\\' &&
        line[index + 1] !== '$' &&
        !/\s|\d/.test(line[index + 1] || '')
      ) {
        let close = index + 1;
        while (close < line.length) {
          if (
            line[close] === '$' &&
            line[close - 1] !== '\\' &&
            !/\s/.test(line[close - 1] || '')
          ) {
            break;
          }
          close++;
        }
        if (close < line.length) {
          result += mathJsx(line.slice(index + 1, close));
          index = close + 1;
          continue;
        }
      }
      result += line[index];
      index++;
    }
    return result;
  };

  for (const line of lines) {
    const fenceMatch = line.match(/^\s*(`{3,}|~{3,})/);
    if (!displayFormula && fenceMatch) {
      if (!fence) {
        fence = fenceMatch[1][0];
      } else if (fence === fenceMatch[1][0]) {
        fence = null;
      }
      output.push(line);
      continue;
    }
    if (fence) {
      output.push(line);
      continue;
    }
    if (displayFormula) {
      const close = line.indexOf('$$');
      if (close === -1) {
        displayFormula.push(line);
      } else {
        displayFormula.push(line.slice(0, close));
        output.push(mathJsx(displayFormula.join('\n'), true));
        output.push(inline(line.slice(close + 2)));
        displayFormula = null;
      }
      continue;
    }
    const open = findOutsideCode(line, '$$');
    if (open !== -1) {
      const close = findOutsideCode(line, '$$', open + 2);
      if (close !== -1) {
        output.push(
          inline(line.slice(0, open)) +
            mathJsx(line.slice(open + 2, close), true) +
            inline(line.slice(close + 2)),
        );
      } else {
        const before = inline(line.slice(0, open));
        if (before) {
          output.push(before);
        }
        displayFormula = [line.slice(open + 2)];
      }
      continue;
    }
    output.push(inline(line));
  }

  if (displayFormula) {
    output.push(`$$${displayFormula.join('\n')}`);
  }
  return output.join('\n');
}

function normalizeVoidElements(source: string): string {
  const voidTag = new RegExp(
    `<(${[...VOID_ELEMENTS].join('|')})(\\s(?:[^>"']|"[^"]*"|'[^']*')*)?>`,
    'gi',
  );
  let fence: string | null = null;
  return source
    .split('\n')
    .map(line => {
      const fenceMatch = line.match(/^\s*(`{3,}|~{3,})/);
      if (fenceMatch) {
        if (!fence) {
          fence = fenceMatch[1][0];
        } else if (fence === fenceMatch[1][0]) {
          fence = null;
        }
        return line;
      }
      if (fence) {
        return line;
      }
      return line
        .split(/(`+[^`]*`+)/g)
        .map(part =>
          part.startsWith('`')
            ? part
            : part.replace(voidTag, (tag, name: string, attributes = '') =>
                /\/\s*>$/.test(tag) ? tag : `<${name}${attributes || ''} />`,
              ),
        )
        .join('');
    })
    .join('\n');
}

function rejectMdxEsmPlugin() {
  return (tree: AstNode, file: { path?: string }) => {
    if (tree.children && Array.isArray(tree.children)) {
      const esm = (tree.children as AstNode[]).find(
        child => child.type === 'mdxjsEsm',
      );
      if (esm) {
        throw new Error(
          `${file.path || 'MDX'}: MDX import/export statements are not supported`,
        );
      }
    }
  };
}

function bindTadaScopePlugin() {
  return (tree: AstNode) => {
    const declaration: AstNode = {
      type: 'VariableDeclaration',
      kind: 'const',
      declarations: [
        {
          type: 'VariableDeclarator',
          id: {
            type: 'ObjectPattern',
            properties: ['page', 'site', 'vars'].map(name => ({
              type: 'Property',
              method: false,
              shorthand: true,
              computed: false,
              key: { type: 'Identifier', name },
              value: { type: 'Identifier', name },
              kind: 'init',
            })),
          },
          init: {
            type: 'MemberExpression',
            object: { type: 'Identifier', name: 'arguments' },
            property: { type: 'Literal', value: 0, raw: '0' },
            computed: true,
            optional: false,
          },
        },
      ],
    };
    const body = tree.body;
    if (!body) {
      return;
    }
    const directiveCount = body.findIndex(
      node => node.type !== 'ExpressionStatement',
    );
    body.splice(
      directiveCount === -1 ? body.length : directiveCount,
      0,
      declaration,
    );
  };
}

const LEGACY_SYNTAX: Array<{ pattern: RegExp; replacement: string }> = [
  {
    pattern: /^\s*!!!\s+(?:note|warning)\b/,
    replacement: 'use <Note> or <Warning>',
  },
  {
    pattern: /^\s*\?\?\?\s+question\b/,
    replacement: 'use <Question> or <MultipleChoice>',
  },
  { pattern: /^\s*\{\{\{\s+/, replacement: 'use <Partial>' },
  { pattern: /^\s*\+\+\+\s*$/, replacement: 'use <Columns> and <Column>' },
  { pattern: /^\s*<<<\s+details\b/, replacement: 'use <Details>' },
  { pattern: /^\s*:::\s+section\b/, replacement: 'use <Section>' },
  { pattern: /<%[=-]?/, replacement: 'use native MDX expressions' },
  { pattern: /<!---/, replacement: 'use native MDX comments ({/* ... */})' },
];

export function assertNoLegacyMdxSyntax(
  source: string,
  filePath: string,
): void {
  let fence: string | null = null;
  for (const [index, line] of source
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .entries()) {
    const fenceMatch = line.match(/^\s*(`{3,}|~{3,})/);
    if (fenceMatch) {
      if (!fence) {
        fence = fenceMatch[1][0];
      } else if (fence === fenceMatch[1][0]) {
        fence = null;
      }
      continue;
    }
    if (fence) {
      continue;
    }
    let codeFreeLine = line;
    for (let start = 0; start < codeFreeLine.length; ) {
      if (codeFreeLine[start] !== '`') {
        start++;
        continue;
      }
      let openerEnd = start;
      while (codeFreeLine[openerEnd] === '`') {
        openerEnd++;
      }
      const delimiter = codeFreeLine.slice(start, openerEnd);
      const close = codeFreeLine.indexOf(delimiter, openerEnd);
      if (close === -1) {
        start = openerEnd;
        continue;
      }
      codeFreeLine =
        codeFreeLine.slice(0, start) +
        ' '.repeat(close + delimiter.length - start) +
        codeFreeLine.slice(close + delimiter.length);
      start = close + delimiter.length;
    }
    const legacy = LEGACY_SYNTAX.find(({ pattern }) =>
      pattern.test(codeFreeLine),
    );
    if (legacy) {
      throw new Error(
        `${filePath}:${index + 1}: Tada 1.x syntax was removed; ${legacy.replacement}`,
      );
    }
  }
}

function rawHtml(html: string): RawHtml {
  return { kind: 'raw', html };
}

function isRawHtml(value: unknown): value is RawHtml {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as RawHtml).kind === 'raw' &&
    typeof (value as RawHtml).html === 'string'
  );
}

function isMdxElement(value: unknown): value is MdxElement {
  return (
    typeof value === 'object' &&
    value !== null &&
    'type' in value &&
    'props' in value
  );
}

function jsx(
  type:
    | string
    | typeof FRAGMENT
    | ((props: Record<string, unknown>) => MdxNode),
  props: Record<string, unknown> | null,
): MdxNode {
  if (typeof type === 'function') {
    return type(props ?? {});
  }
  return { type, props: props ?? {} };
}

const staticJsxRuntime = { Fragment: FRAGMENT, jsx, jsxs: jsx };

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapeAttr(value: string): string {
  return escapeHtml(value).replace(/"/g, '&quot;');
}

function attrName(name: string): string {
  if (name === 'className') {
    return 'class';
  }
  if (name === 'htmlFor') {
    return 'for';
  }
  return name;
}

function renderAttr(name: string, value: unknown, tagName: string): string {
  if (
    value === null ||
    value === undefined ||
    value === false ||
    name === 'children' ||
    name === 'key'
  ) {
    return '';
  }
  if (value === true) {
    return ` ${attrName(name)}`;
  }
  if (typeof value === 'string' || typeof value === 'number') {
    return ` ${attrName(name)}="${escapeAttr(String(value))}"`;
  }
  throw new Error(
    `MDX attribute "${name}" on <${tagName}> must be a string, number, or boolean`,
  );
}

function renderNode(node: MdxNode): string {
  if (node === null || node === undefined || node === false || node === true) {
    return '';
  }
  if (Array.isArray(node)) {
    return node.map(renderNode).join('');
  }
  if (typeof node === 'string' || typeof node === 'number') {
    return escapeHtml(String(node));
  }
  if (isRawHtml(node)) {
    return node.html;
  }
  if (!isMdxElement(node)) {
    throw new Error('MDX rendered an unsupported value');
  }

  const children = renderNode(node.props.children as MdxNode);
  if (node.type === FRAGMENT) {
    return children;
  }

  if (typeof node.type !== 'string') {
    const names = new Map<symbol, string>([
      [COLUMN, 'Column'],
      [CHOICE, 'Choice'],
      [SLIDE, 'Slide'],
      [FOOTNOTE, 'Footnote'],
    ]);
    const componentName = names.get(node.type) || 'Component';
    const parentName = new Map<symbol, string>([
      [COLUMN, 'Columns'],
      [CHOICE, 'MultipleChoice'],
      [SLIDE, 'Slides'],
      [FOOTNOTE, 'Footnotes'],
    ]).get(node.type);
    throw new Error(
      `<${componentName}> must be a direct child of <${parentName}>`,
    );
  }
  const tagName = node.type;

  const props = { ...node.props };
  if (
    /^h[1-6]$/.test(tagName) &&
    containsElementClass(props.children as MdxNode, 'heading-subtitle')
  ) {
    props.className = [props.className, 'has-subtitle']
      .filter(Boolean)
      .join(' ');
  }

  const attrs = Object.entries(props)
    .map(([name, value]) => renderAttr(name, value, tagName))
    .join('');
  if (VOID_ELEMENTS.has(tagName)) {
    return `<${tagName}${attrs}>`;
  }
  return `<${tagName}${attrs}>${children}</${tagName}>`;
}

function containsElementClass(node: MdxNode, className: string): boolean {
  if (Array.isArray(node)) {
    return node.some(child => containsElementClass(child, className));
  }
  return isMdxElement(node) && node.props.className === className;
}

function hasRenderableChildren(value: unknown): boolean {
  if (
    value === null ||
    value === undefined ||
    value === false ||
    value === true
  ) {
    return false;
  }
  if (typeof value === 'string') {
    return value.trim() !== '';
  }
  if (Array.isArray(value)) {
    return value.some(hasRenderableChildren);
  }
  return true;
}

function unexpectedProps(
  props: Record<string, unknown>,
  allowed: Set<string>,
): string[] {
  return Object.keys(props).filter(
    name => name !== 'children' && !allowed.has(name),
  );
}

function assertNoChildren(
  componentName: string,
  props: Record<string, unknown>,
): void {
  if (hasRenderableChildren(props.children)) {
    throw new Error(`<${componentName}> does not accept children`);
  }
}

function assertNoUnexpectedProps(
  componentName: string,
  props: Record<string, unknown>,
  allowed: Set<string>,
): void {
  const unexpected = unexpectedProps(props, allowed);
  if (unexpected.length > 0) {
    throw new Error(
      `<${componentName}> does not accept ${unexpected.map(p => `"${p}"`).join(', ')}`,
    );
  }
}

function meaningfulChildren(value: unknown): MdxNode[] {
  const result: MdxNode[] = [];
  const visit = (node: MdxNode): void => {
    if (Array.isArray(node)) {
      node.forEach(visit);
    } else if (typeof node !== 'string' || node.trim() !== '') {
      if (
        node !== null &&
        node !== undefined &&
        node !== false &&
        node !== true
      ) {
        result.push(node);
      }
    }
  };
  visit(value as MdxNode);
  return result;
}

function element(
  type: string | symbol,
  props: Record<string, unknown>,
): MdxElement {
  return { type, props };
}

function nodeText(node: MdxNode): string {
  if (Array.isArray(node)) {
    return node.map(nodeText).join('');
  }
  if (typeof node === 'string' || typeof node === 'number') {
    return String(node);
  }
  if (isMdxElement(node)) {
    return nodeText(node.props.children as MdxNode);
  }
  return '';
}

function typographyNode(node: MdxNode): MdxNode {
  if (Array.isArray(node)) {
    return node.map(typographyNode);
  }
  if (typeof node === 'string') {
    return curlyQuote(node);
  }
  if (isMdxElement(node)) {
    if (node.type === 'code' || node.type === 'pre') {
      return node;
    }
    return element(node.type, {
      ...node.props,
      children: typographyNode(node.props.children as MdxNode),
    });
  }
  return node;
}

function immutableCopy(
  value: unknown,
  seen = new Map<object, unknown>(),
): unknown {
  if (!value || typeof value !== 'object') {
    return value;
  }
  const existing = seen.get(value);
  if (existing) {
    return existing;
  }
  if (Array.isArray(value)) {
    const copy: unknown[] = [];
    seen.set(value, copy);
    copy.push(...value.map(item => immutableCopy(item, seen)));
    return Object.freeze(copy);
  }
  if (value instanceof Date) {
    const copy = new Date(value);
    seen.set(value, copy);
    for (const name of Object.getOwnPropertyNames(Date.prototype)) {
      if (name.startsWith('set')) {
        Object.defineProperty(copy, name, {
          value: () => {
            throw new TypeError('Cannot modify immutable MDX values');
          },
        });
      }
    }
    return Object.freeze(copy);
  }
  const copy: Record<string, unknown> = {};
  seen.set(value, copy);
  for (const [key, item] of Object.entries(value)) {
    copy[key] = immutableCopy(item, seen);
  }
  return Object.freeze(copy);
}

function requiredNodeProp(
  componentName: string,
  propName: string,
  props: Record<string, unknown>,
): MdxNode {
  const value = props[propName] as MdxNode;
  if (!hasRenderableChildren(value)) {
    throw new Error(`<${componentName}> requires a "${propName}" prop`);
  }
  return value;
}

function createComponents(options: MdxRenderOptions) {
  const { filePath, templateParams, dependencyCollector, state } = options;
  const usedAlertIds = state!.alertIds;

  const alert = (
    componentName: 'Note' | 'Warning',
    type: 'note' | 'warning',
    props: Record<string, unknown>,
  ): MdxElement => {
    assertNoUnexpectedProps(componentName, props, new Set(['title']));
    const title =
      (props.title as MdxNode) || (type === 'note' ? 'Note' : 'Warning');
    const titleId = deduplicateId(usedAlertIds, textToId(nodeText(title)));
    state!.alertIdList.push(titleId);
    state!.tocItems.push({ kind: 'alert', type, title: renderNode(title) });
    return element('div', {
      className: `alert ${type}`,
      children: [
        element('p', { className: 'title', id: titleId, children: title }),
        element('div', { className: 'content', children: props.children }),
      ],
    });
  };

  const heading = (
    level: number,
    props: Record<string, unknown>,
  ): MdxElement => {
    assertNoUnexpectedProps(`h${level}`, props, new Set());
    const children = typographyNode(props.children as MdxNode);
    const id = deduplicateId(state!.headingIds, textToId(nodeText(children)));
    state!.tocItems.push({
      kind: 'heading',
      level: String(level),
      id,
      innerHtml: renderNode(children),
    });
    return element(`h${level}`, { id, children });
  };

  return {
    FootnoteRef(props: Record<string, unknown>): MdxElement {
      assertNoChildren('FootnoteRef', props);
      assertNoUnexpectedProps('FootnoteRef', props, new Set(['index']));
      const index = Number(props.index);
      return element('a', {
        className: 'footnote-ref',
        href: `#fn${index}`,
        id: `fnref${index}`,
        children: footnoteLabel(index),
      });
    },

    Footnote(props: Record<string, unknown>): MdxElement {
      assertNoUnexpectedProps('Footnote', props, new Set(['index']));
      return element(FOOTNOTE, {
        index: Number(props.index),
        children: props.children,
      });
    },

    Footnotes(props: Record<string, unknown>): MdxElement {
      assertNoUnexpectedProps('Footnotes', props, new Set());
      const notes = meaningfulChildren(props.children);
      if (!notes.every(note => isMdxElement(note) && note.type === FOOTNOTE)) {
        throw new Error('<Footnotes> only accepts generated footnotes');
      }
      return element('div', {
        className: 'footnotes',
        children: [
          element('p', { className: 'title', children: 'Footnotes' }),
          element('ol', {
            children: notes.map(note => {
              const footnote = note as MdxElement;
              const index = Number(footnote.props.index);
              return element('li', {
                id: `fn${index}`,
                className: 'footnote-item',
                children: [
                  element('span', {
                    className: 'footnote-marker',
                    'aria-hidden': 'true',
                    children: footnoteLabel(index),
                  }),
                  ' ',
                  footnote.props.children as MdxNode,
                ],
              });
            }),
          }),
        ],
      });
    },

    Definition(props: Record<string, unknown>): MdxElement {
      assertNoUnexpectedProps('Definition', props, new Set(['term']));
      if (typeof props.term !== 'string') {
        throw new Error('<Definition> requires a string "term" prop');
      }
      const id = deduplicateId(
        state!.definitionIds,
        textToId(props.term) || 'term',
      );
      return element('dl', {
        children: [
          element('dt', { children: [element('a', { id }), props.term] }),
          element('dd', { children: props.children }),
        ],
      });
    },

    Math(props: Record<string, unknown>): RawHtml {
      assertNoChildren('Math', props);
      assertNoUnexpectedProps('Math', props, new Set(['formula', 'display']));
      if (typeof props.formula !== 'string') {
        throw new Error('<Math> requires a string "formula" prop');
      }
      if (props.display !== undefined && typeof props.display !== 'boolean') {
        throw new Error('<Math> "display" prop must be a boolean');
      }
      const display = props.display === true;
      const html = katex.renderToString(props.formula, {
        throwOnError: true,
        displayMode: display,
      });
      const a11y = escapeAttr(renderA11yString(props.formula));
      if (display) {
        return rawHtml(
          `<p class="katex-block" aria-label="${a11y}">${html}</p>`,
        );
      }
      return rawHtml(
        html.replace(
          '<span class="katex">',
          `<span class="katex" aria-label="${a11y}">`,
        ),
      );
    },

    p(props: Record<string, unknown>): MdxElement {
      return element('p', {
        ...props,
        children: typographyNode(props.children as MdxNode),
      });
    },

    a(props: Record<string, unknown>): MdxElement {
      const href = props.href;
      if (typeof href !== 'string' || !/^https?:\/\//.test(href)) {
        return element('a', props);
      }
      const url = new URL(href);
      const site = templateParams.site as SiteVariables;
      if (site.internalDomains?.includes(url.host)) {
        return element('a', props);
      }
      return element('a', {
        ...props,
        className: [props.className, 'external'].filter(Boolean).join(' '),
        target: '_blank',
        rel: 'noopener noreferrer',
      });
    },

    h1(props: Record<string, unknown>): MdxElement {
      return heading(1, props);
    },

    h2(props: Record<string, unknown>): MdxElement {
      return heading(2, props);
    },

    h3(props: Record<string, unknown>): MdxElement {
      return heading(3, props);
    },

    h4(props: Record<string, unknown>): MdxElement {
      return heading(4, props);
    },

    h5(props: Record<string, unknown>): MdxElement {
      return heading(5, props);
    },

    h6(props: Record<string, unknown>): MdxElement {
      return heading(6, props);
    },

    hr(props: Record<string, unknown>): MdxElement {
      assertNoChildren('hr', props);
      assertNoUnexpectedProps('hr', props, new Set());
      state!.tocItems.push({ kind: 'dinkus' });
      return element('hr', {});
    },

    ul(props: Record<string, unknown>): MdxElement {
      return element('ul', { ...props, className: 'styled-list' });
    },

    ol(props: Record<string, unknown>): MdxElement {
      return element('ol', { ...props, className: 'styled-list' });
    },

    li(props: Record<string, unknown>): MdxElement {
      return element('li', {
        ...props,
        children: element('div', {
          className: 'styled-list-item',
          children: props.children,
        }),
      });
    },

    pre(props: Record<string, unknown>): MdxNode {
      const children = meaningfulChildren(props.children);
      const code = children.length === 1 ? children[0] : undefined;
      if (!isMdxElement(code) || code.type !== 'code') {
        return element('pre', props);
      }
      const className = code.props.className ?? code.props.class;
      const language =
        typeof className === 'string'
          ? className.match(/(?:^|\s)language-([^\s]+)/)?.[1]
          : undefined;
      const source = nodeText(code.props.children as MdxNode).replace(
        /\n$/,
        '',
      );
      const lang = language || 'text';
      const customHtml = options.renderFence?.(source, language || '');
      if (customHtml !== undefined && customHtml !== null) {
        return rawHtml(customHtml);
      }
      let useLang: string;
      if (isPlainTextLanguage(lang)) {
        useLang = 'text';
      } else if (isBundledLanguage(lang)) {
        const site = templateParams.site as SiteVariables;
        if (!(site.shikiLanguages ?? []).includes(lang)) {
          throw new Error(
            `${filePath}: Markdown fence language "${lang}" is not listed in site.shikiLanguages`,
          );
        }
        useLang = lang;
      } else {
        throw new Error(
          `${filePath}: Markdown fence language "${lang}" is not a supported Shiki language`,
        );
      }
      return rawHtml(highlightCode(source, useLang));
    },

    Partial(props: Record<string, unknown>): RawHtml {
      assertNoChildren('Partial', props);
      assertNoUnexpectedProps('Partial', props, new Set(['source']));
      if (typeof props.source !== 'string' || props.source.trim() === '') {
        throw new Error('<Partial> requires a string "source" prop');
      }

      const partialPath = path.resolve(path.dirname(filePath), props.source);
      const extension = path.extname(partialPath).toLowerCase();
      if (!['.md', '.markdown', '.mdx'].includes(extension)) {
        throw new Error(
          `${filePath}: partial "${props.source}" must be a .md, .markdown, or .mdx file`,
        );
      }
      if (!path.basename(partialPath).startsWith('_')) {
        throw new Error(
          `${filePath}: partial basename must start with "_": ${props.source}`,
        );
      }
      if (!fs.existsSync(partialPath)) {
        throw new Error(`${filePath}: partial not found: ${props.source}`);
      }
      if (state!.includeStack.includes(partialPath)) {
        throw new Error(
          `${filePath}: partial cycle: ${[...state!.includeStack, partialPath].join(' -> ')}`,
        );
      }
      if (state!.includeStack.length - 1 >= 10) {
        throw new Error(`${filePath}: maximum partial depth of 10 exceeded`);
      }

      dependencyCollector?.partials?.add(partialPath);
      return rawHtml(
        renderMdx(fs.readFileSync(partialPath, 'utf-8'), {
          ...options,
          filePath: partialPath,
          state: {
            ...state!,
            includeStack: [...state!.includeStack, partialPath],
          },
        }),
      );
    },

    Note(props: Record<string, unknown>): MdxElement {
      return alert('Note', 'note', props);
    },

    Warning(props: Record<string, unknown>): MdxElement {
      return alert('Warning', 'warning', props);
    },

    Details(props: Record<string, unknown>): MdxElement {
      assertNoUnexpectedProps('Details', props, new Set(['summary']));
      const summary = requiredNodeProp('Details', 'summary', props);
      return element('details', {
        children: [
          element('summary', { children: summary }),
          element('div', { className: 'content', children: props.children }),
        ],
      });
    },

    Section(props: Record<string, unknown>): MdxElement {
      assertNoUnexpectedProps('Section', props, new Set());
      return element('section', { children: props.children });
    },

    Subtitle(props: Record<string, unknown>): MdxElement {
      assertNoUnexpectedProps('Subtitle', props, new Set());
      return element('span', {
        className: 'heading-subtitle',
        children: props.children,
      });
    },

    Column(props: Record<string, unknown>): MdxElement {
      assertNoUnexpectedProps('Column', props, new Set());
      return element(COLUMN, { children: props.children });
    },

    Columns(props: Record<string, unknown>): MdxElement {
      assertNoUnexpectedProps('Columns', props, new Set());
      const columns = meaningfulChildren(props.children);
      if (
        columns.length !== 2 ||
        !columns.every(child => isMdxElement(child) && child.type === COLUMN)
      ) {
        throw new Error('<Columns> requires exactly two <Column> children');
      }
      return element('div', {
        className: 'columns',
        children: columns.map(column =>
          element('div', { children: (column as MdxElement).props.children }),
        ),
      });
    },

    Question(props: Record<string, unknown>): MdxElement {
      assertNoUnexpectedProps('Question', props, new Set(['prompt']));
      const prompt = requiredNodeProp('Question', 'prompt', props);
      return element('div', {
        className: 'question',
        children: [
          element('p', {
            className: 'question-q',
            children: [
              element('span', { className: 'question-label', children: 'Q.' }),
              element('span', { children: prompt }),
            ],
          }),
          element('div', {
            className: 'question-a',
            children: [
              element('p', { className: 'question-a-label', children: 'A.' }),
              element('div', {
                className: 'question-a-body',
                'data-pagefind-ignore': true,
                children: props.children,
              }),
            ],
          }),
        ],
      });
    },

    Choice(props: Record<string, unknown>): MdxElement {
      assertNoUnexpectedProps('Choice', props, new Set(['correct']));
      if (props.correct !== undefined && typeof props.correct !== 'boolean') {
        throw new Error('<Choice> "correct" prop must be a boolean');
      }
      return element(CHOICE, {
        correct: props.correct === true,
        children: props.children,
      });
    },

    MultipleChoice(props: Record<string, unknown>): MdxElement {
      assertNoUnexpectedProps('MultipleChoice', props, new Set(['prompt']));
      const prompt = requiredNodeProp('MultipleChoice', 'prompt', props);
      const choices = meaningfulChildren(props.children);
      if (
        !choices.every(child => isMdxElement(child) && child.type === CHOICE)
      ) {
        throw new Error(
          '<MultipleChoice> only accepts direct <Choice> children',
        );
      }
      if (choices.length < 2) {
        throw new Error(
          '<MultipleChoice> requires at least two <Choice> children',
        );
      }
      if (
        choices.filter(choice => (choice as MdxElement).props.correct === true)
          .length !== 1
      ) {
        throw new Error(
          '<MultipleChoice> requires exactly one correct <Choice>',
        );
      }
      return element('div', {
        className: 'question question-multiple-choice',
        children: [
          element('p', {
            className: 'question-q',
            children: [
              element('span', { className: 'question-label', children: 'Q.' }),
              element('span', { children: prompt }),
            ],
          }),
          element('div', {
            className: 'question-multiple-choice-options',
            children: choices.map(choice => {
              const choiceElement = choice as MdxElement;
              return element('div', {
                className: 'question-multiple-choice-option',
                'data-correct': choiceElement.props.correct ? '' : undefined,
                children: choiceElement.props.children,
              });
            }),
          }),
        ],
      });
    },

    Slide(props: Record<string, unknown>): MdxElement {
      assertNoUnexpectedProps('Slide', props, new Set());
      return element(SLIDE, { children: props.children });
    },

    Slides(props: Record<string, unknown>): MdxElement {
      assertNoUnexpectedProps('Slides', props, new Set());
      const slides = meaningfulChildren(props.children);
      if (
        slides.length === 0 ||
        !slides.every(child => isMdxElement(child) && child.type === SLIDE)
      ) {
        throw new Error(
          '<Slides> requires one or more direct <Slide> children',
        );
      }
      const page = templateParams.page as Record<string, unknown>;
      page.slides = true;
      page.slideCount = slides.length;
      return element('div', {
        className: 'slide-deck',
        'data-slides-root': '',
        children: slides.map((slide, index) =>
          element('div', {
            className: 'slide',
            'data-slide-index': index,
            children: (slide as MdxElement).props.children,
          }),
        ),
      });
    },

    TimeZoneChooser(props: Record<string, unknown>): RawHtml {
      assertNoChildren('TimeZoneChooser', props);
      assertNoUnexpectedProps('TimeZoneChooser', props, new Set());
      const renderTimeZoneChooser = templateParams.renderTimeZoneChooser;
      if (typeof renderTimeZoneChooser !== 'function') {
        throw new Error(
          `${filePath}: TimeZoneChooser component is unavailable`,
        );
      }
      return rawHtml((renderTimeZoneChooser as () => string)());
    },

    Trace(props: Record<string, unknown>): RawHtml {
      assertNoChildren('Trace', props);
      assertNoUnexpectedProps(
        'Trace',
        props,
        new Set(['source', 'companions']),
      );
      if (typeof props.source !== 'string') {
        throw new Error('<Trace> requires a string "source" prop');
      }
      if (
        props.companions !== undefined &&
        (!Array.isArray(props.companions) ||
          !props.companions.every(value => typeof value === 'string'))
      ) {
        throw new Error(
          '<Trace> "companions" prop must be an array of strings',
        );
      }
      const renderTrace = templateParams.renderTrace;
      if (typeof renderTrace !== 'function') {
        throw new Error(`${filePath}: Trace component is unavailable`);
      }
      return rawHtml(
        (
          renderTrace as (
            sourceFile: string,
            companionFiles?: string[],
          ) => string
        )(props.source, props.companions as string[] | undefined),
      );
    },
  };
}

export function renderMdx(source: string, options: MdxRenderOptions): string {
  assertNoLegacyMdxSyntax(source, options.filePath);
  const preparedSource = normalizeVoidElements(protectMdxMath(source));
  const resolvedFilePath = path.resolve(options.filePath);
  const renderOptions: MdxRenderOptions = {
    ...options,
    state: options.state || {
      alertIds: new Map(),
      alertIdList: [],
      headingIds: new Map(),
      definitionIds: new Map(),
      tocItems: [],
      includeStack: [resolvedFilePath],
    },
  };
  try {
    const compiled = compileSync(
      { value: preparedSource, path: options.filePath },
      {
        outputFormat: 'function-body',
        baseUrl: pathToFileURL(path.resolve(options.filePath)),
        elementAttributeNameCase: 'html',
        format: 'mdx',
        remarkPlugins: [
          rejectMdxEsmPlugin,
          tablePlugin,
          footnotesAndDefinitionsPlugin,
          mathPlugin,
        ],
        recmaPlugins: [bindTadaScopePlugin],
      },
    );
    const runtime = {
      ...staticJsxRuntime,
      ...options.templateParams,
      page: immutableCopy(options.templateParams.page),
      site: immutableCopy(options.templateParams.site),
      vars: immutableCopy(options.templateParams.vars),
      baseUrl: pathToFileURL(path.resolve(options.filePath)),
    } as unknown as Parameters<typeof runSync>[1];
    const mdxModule = runSync(compiled, runtime);
    const Content = mdxModule.default as (props: {
      components: ReturnType<typeof createComponents>;
    }) => MdxNode;
    const html = renderNode(
      Content({ components: createComponents(renderOptions) }),
    );
    if (options.metadata) {
      options.metadata.tocItems = renderOptions.state!.tocItems;
      options.metadata.alertIds = renderOptions.state!.alertIdList;
    }
    return html;
  } catch (err) {
    if (
      err instanceof Error &&
      err.message.startsWith(`${options.filePath}:`)
    ) {
      throw err;
    }
    throw new Error(
      `${options.filePath}: MDX error: ${(err as Error).message}`,
      { cause: err },
    );
  }
}
