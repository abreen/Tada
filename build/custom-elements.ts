import {
  html as spec,
  parseFragment,
  type DefaultTreeAdapterMap,
} from 'parse5';
import type { Render, RenderInfo } from '../types/client';

type Node = DefaultTreeAdapterMap['node'];
type Element = DefaultTreeAdapterMap['element'];

/** The render functions one renderer module exports, by element name */
export interface ScriptRenderers {
  /** The renderer module, for error messages, such as `src/a.render.ts` */
  file: string;
  elements: ReadonlyMap<string, Render>;
}

/** A render function and the file that exports it */
export interface PageRenderer {
  render: Render;
  file: string;
  /** The script the renderer belongs to */
  script: string;
}

// Names the HTML standard reserves, from its valid custom element name rules
const RESERVED_ELEMENT_NAMES = new Set([
  'annotation-xml',
  'color-profile',
  'font-face',
  'font-face-src',
  'font-face-uri',
  'font-face-format',
  'font-face-name',
  'missing-glyph',
]);

/**
 * Whether `name` is a valid custom element name made of ASCII characters: it
 * starts with a lowercase letter, has a hyphen, and has no uppercase letters
 */
export function isValidCustomElementName(name: string): boolean {
  return (
    /^[a-z][a-z0-9._]*-[a-z0-9._-]*$/.test(name) &&
    !RESERVED_ELEMENT_NAMES.has(name)
  );
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

/**
 * Checks a renderer module's exports and returns its render functions. Throws
 * for a module without a default export or with a malformed one.
 */
export function validateRendererModule(
  module: Record<string, unknown>,
  file: string,
): ScriptRenderers {
  const exported = module.default;
  if (!isPlainObject(exported)) {
    throw new Error(
      `${file}: the default export must be an object mapping element names to render functions, such as { 'tz-chooser': render }`,
    );
  }
  const elements = new Map<string, Render>();
  for (const [name, render] of Object.entries(exported)) {
    if (!isValidCustomElementName(name)) {
      throw new Error(
        `${file}: "${name}" is not a valid custom element name; use lowercase letters and a hyphen, such as "tz-chooser"`,
      );
    }
    if (typeof render !== 'function') {
      throw new Error(`${file}: "${name}" must be a render function`);
    }
    elements.set(name, render as Render);
  }
  return { file, elements };
}

/**
 * The render functions for a page's scripts, by element name. Throws if two
 * scripts render the same element.
 */
export function getPageRenderers(
  scripts: readonly string[],
  renderers: ReadonlyMap<string, ScriptRenderers> | undefined,
  label: string,
): Map<string, PageRenderer> {
  const pageRenderers = new Map<string, PageRenderer>();
  for (const script of scripts) {
    const scriptRenderers = renderers?.get(script);
    for (const [name, render] of scriptRenderers?.elements ?? []) {
      const other = pageRenderers.get(name);
      if (other) {
        throw new Error(
          `${label}: <${name}> is rendered by both "${other.script}" and "${script}"`,
        );
      }
      pageRenderers.set(name, { render, file: scriptRenderers!.file, script });
    }
  }
  return pageRenderers;
}

function isElement(node: Node): node is Element {
  return 'tagName' in node;
}

// The outermost elements that have renderers, in document order. Elements in
// <template> contents are inert, and parse5 reads <noscript> as text.
function findRenderedElements(
  nodes: Node[],
  renderers: ReadonlyMap<string, PageRenderer>,
  found: Element[] = [],
): Element[] {
  for (const node of nodes) {
    if (!isElement(node)) {
      continue;
    }
    if (node.namespaceURI === spec.NS.HTML && renderers.has(node.tagName)) {
      found.push(node);
    } else if (node.tagName !== 'template') {
      findRenderedElements(node.childNodes, renderers, found);
    }
  }
  return found;
}

function describeValue(value: unknown): string {
  if (value === null) {
    return 'null';
  }
  return Array.isArray(value) ? 'an array' : typeof value;
}

function callRender(
  element: Element,
  renderer: PageRenderer,
  info: RenderInfo,
  label: string,
): string {
  const tag = `<${element.tagName}>`;
  let output: unknown;
  try {
    output = renderer.render(info);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `${label}: ${tag} render failed (${renderer.file}): ${message}`,
      { cause: error },
    );
  }
  if (output instanceof Promise) {
    // The rejection would otherwise go unhandled
    output.catch(() => {});
    throw new Error(
      `${label}: ${tag} render function in ${renderer.file} must return a string, not a Promise; load data with top-level await in the renderer module instead`,
    );
  }
  if (typeof output !== 'string') {
    throw new Error(
      `${label}: ${tag} render function in ${renderer.file} must return a string, got ${describeValue(output)}`,
    );
  }
  return output;
}

/**
 * Fills each element in `html` that has a renderer with its render function's
 * output, keeping the element's start tag as written. Elements inside a
 * rendered element are passed to its render function as written, not rendered
 * themselves. Throws for an element without an end tag or a render function
 * that fails.
 */
export function renderCustomElements(
  html: string,
  renderers: ReadonlyMap<string, PageRenderer>,
  page: RenderInfo['page'],
  vars: RenderInfo['vars'],
  label: string,
): string {
  const lower = html.toLowerCase();
  if (![...renderers.keys()].some(name => lower.includes(`<${name}`))) {
    return html;
  }
  const fragment = parseFragment(html, { sourceCodeLocationInfo: true });
  const elements = findRenderedElements(fragment.childNodes, renderers);
  let result = html;
  // From last to first, so earlier offsets stay valid
  for (const element of elements.reverse()) {
    const location = element.sourceCodeLocation!;
    if (!location.endTag) {
      throw new Error(
        `${label}: <${element.tagName}> needs a closing tag </${element.tagName}>`,
      );
    }
    const start = location.startTag!.endOffset;
    const end = location.endTag.startOffset;
    const info: RenderInfo = {
      attributes: Object.freeze(
        Object.fromEntries(
          element.attrs.map(({ name, value }) => [name, value]),
        ),
      ),
      html: html.slice(start, end),
      page,
      vars,
    };
    const output = callRender(
      element,
      renderers.get(element.tagName)!,
      info,
      label,
    );
    result = result.slice(0, start) + output + result.slice(end);
  }
  return result;
}
