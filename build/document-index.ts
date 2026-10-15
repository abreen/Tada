import path from 'path';
import indexSchema from '../schema/index.schema.json' with { type: 'json' };
import { readConfigFile } from './config-loader';
import { compile as compileJsonSchema, doValidation } from './json-schema';
import { PAGE_RENDER_KINDS, type TadaProjectScan } from './source-model';
import {
  isValidPublicAssetPath,
  normalizeOutputPath,
  toDisplayPath,
  toUrlPath,
} from './utils/paths';
import type { ValidateFunction } from 'ajv';
import type { BuildDiagnostic } from './build-types';
import type { SiteVariables } from './types';

export interface DocumentPageTitle {
  /** Plain text */
  title: string;
  /** Inline HTML, without links */
  titleHtml: string;
}

/** A link to an indexed page */
export interface DocumentLink extends DocumentPageTitle {
  /** Root-relative and percent-encoded */
  href: string;
}

/** An entry in the part of a document tree that one page shows */
export interface DocumentTreeEntry extends DocumentLink {
  current: boolean;
  /** Whether the entry has children, shown or not */
  isBranch: boolean;
  /** Shown only for the current page and its ancestors */
  children: DocumentTreeEntry[];
}

/** What an indexed page knows about its place in its document tree */
export interface DocumentNavigation {
  /** The index file that lists the page */
  indexFile: string;
  /** From the root down to the page's parent */
  ancestors: DocumentLink[];
  tree: DocumentTreeEntry;
  previous?: DocumentLink;
  next?: DocumentLink;
}

/** Navigation for every indexed page, by source path */
export type DocumentIndex = ReadonlyMap<string, DocumentNavigation>;

export interface DocumentIndexFile {
  filePath: string;
  /** The parsed file, with site variables substituted */
  value: unknown;
}

interface RawBranch {
  page: string;
  children: RawNode[];
}

type RawNode = string | RawBranch;

interface IndexNode extends DocumentLink {
  sourcePath: string;
  parent?: IndexNode;
  children: IndexNode[];
}

let validator: ValidateFunction | undefined;

function validateIndexValue(value: unknown, displayPath: string): void {
  validator ??= compileJsonSchema(indexSchema);
  doValidation(validator, value, displayPath);
}

/** Paths name sources in or below the index file's directory, literally */
function validateSourcePath(sourcePath: string, displayPath: string): void {
  if (!isValidPublicAssetPath(sourcePath)) {
    throw new Error(
      `${displayPath}: invalid source path "${sourcePath}" (use a relative path to a file in or below this directory)`,
    );
  }
}

function getPageHref(sourcePath: string, scan: TadaProjectScan): string {
  const output = [...(scan.sources.get(sourcePath)?.outputs ?? [])].find(file =>
    file.endsWith('.html'),
  );
  return normalizeOutputPath(toUrlPath(`/${output}`));
}

const URL_SCHEME_PATTERN = /^[a-zA-Z][a-zA-Z0-9+.-]*:/;

/** A URL relative to `pageHref` as a root-relative URL */
function toRootRelative(url: string, pageHref: string): string {
  if (
    url.startsWith('/') ||
    url.startsWith('#') ||
    URL_SCHEME_PATTERN.test(url)
  ) {
    return url;
  }
  const resolved = new URL(url, `http://tada.invalid${pageHref}`);
  return resolved.pathname + resolved.search + resolved.hash;
}

/**
 * Prepares a page's title HTML to show on other pages. Entries are links
 * themselves, so links keep only their content. Relative image URLs are made
 * root-relative so they work from any directory. An image's `srcset` is
 * replaced by `src`, which the final HTML gives the site's base path, and
 * `<source>` elements are dropped in favor of their fallback image.
 */
function getEntryTitleHtml(titleHtml: string, pageHref: string): string {
  return (
    new HTMLRewriter()
      .on('a, span.external-link-tail', {
        element(element) {
          element.removeAndKeepContent();
        },
      })
      .on('[src]', {
        element(element) {
          // HTMLRewriter returns null for an empty value
          const src = element.getAttribute('src');
          if (src) {
            element.setAttribute('src', toRootRelative(src, pageHref));
          }
        },
      })
      // Sources choose among alternatives the fallback image already stands in for
      .on('source', {
        element(element) {
          element.remove();
        },
      })
      .on('img[srcset]', {
        element(element) {
          // The first candidate stands in for a missing src. A URL runs to the
          // next whitespace, so commas inside it (as in data URLs) are kept.
          const url = /^[\s,]*(\S*)/
            .exec(element.getAttribute('srcset') ?? '')![1]
            .replace(/,+$/, '');
          element.removeAttribute('srcset');
          if (!element.hasAttribute('src') && url) {
            element.setAttribute('src', toRootRelative(url, pageHref));
          }
        },
      })
      .transform(titleHtml)
  );
}

function parseIndexFile(
  { filePath, value }: DocumentIndexFile,
  scan: TadaProjectScan,
  readTitle: (sourcePath: string) => DocumentPageTitle | undefined,
): IndexNode {
  const displayPath = toDisplayPath(filePath);
  validateIndexValue(value, displayPath);

  const baseDir = path.dirname(filePath);
  const seen = new Set<string>();
  const parseNode = (raw: RawNode, parent?: IndexNode): IndexNode => {
    const relPath = typeof raw === 'string' ? raw : raw.page;
    validateSourcePath(relPath, displayPath);
    const sourcePath = path.join(baseDir, ...relPath.split('/'));
    const entry = scan.sources.get(sourcePath);
    if (!entry) {
      throw new Error(`${displayPath}: no such source: "${relPath}"`);
    }
    if (!PAGE_RENDER_KINDS.has(entry.renderKind)) {
      throw new Error(
        `${displayPath}: "${relPath}" does not build a page (partials, skipped pages, and copied files cannot be indexed)`,
      );
    }
    if (seen.has(sourcePath)) {
      throw new Error(`${displayPath}: "${relPath}" is listed more than once`);
    }
    seen.add(sourcePath);

    const title = readTitle(sourcePath);
    if (!title) {
      throw new Error(
        `${displayPath}: "${relPath}" has no title; indexed pages need a "title" with text`,
      );
    }
    const href = getPageHref(sourcePath, scan);
    const node: IndexNode = {
      sourcePath,
      title: title.title,
      titleHtml: getEntryTitleHtml(title.titleHtml, href),
      href,
      parent,
      children: [],
    };
    if (typeof raw !== 'string') {
      node.children = raw.children.map(child => parseNode(child, node));
    }
    return node;
  };

  return parseNode(value as RawBranch);
}

function toLink({ title, titleHtml, href }: IndexNode): DocumentLink {
  return { title, titleHtml, href };
}

/** The root, the path to the current page, siblings along it, and its children */
function getTreeEntry(
  node: IndexNode,
  current: IndexNode,
  openNodes: ReadonlySet<IndexNode>,
): DocumentTreeEntry {
  return {
    ...toLink(node),
    current: node === current,
    isBranch: node.children.length > 0,
    children: openNodes.has(node)
      ? node.children.map(child => getTreeEntry(child, current, openNodes))
      : [],
  };
}

function getNavigation(
  root: IndexNode,
  order: readonly IndexNode[],
  position: number,
  indexFile: string,
): DocumentNavigation {
  const current = order[position];
  const ancestors: IndexNode[] = [];
  for (let node = current.parent; node; node = node.parent) {
    ancestors.unshift(node);
  }
  const previous = order[position - 1];
  const next = order[position + 1];
  return {
    indexFile,
    ancestors: ancestors.map(toLink),
    tree: getTreeEntry(root, current, new Set([...ancestors, current])),
    ...(previous ? { previous: toLink(previous) } : {}),
    ...(next ? { next: toLink(next) } : {}),
  };
}

function flatten(node: IndexNode): IndexNode[] {
  return [node, ...node.children.flatMap(flatten)];
}

/**
 * Builds navigation for every page listed in the given index files. Each file
 * is a separate tree, and a page may appear in only one of them.
 */
export function buildDocumentIndex(
  indexFiles: readonly DocumentIndexFile[],
  scan: TadaProjectScan,
  readTitle: (sourcePath: string) => DocumentPageTitle | undefined,
): { index: DocumentIndex; diagnostics: BuildDiagnostic[] } {
  const diagnostics: BuildDiagnostic[] = [];

  const filesByDir = new Map<string, string[]>();
  for (const { filePath } of indexFiles) {
    const dir = path.dirname(filePath);
    filesByDir.set(dir, [...(filesByDir.get(dir) ?? []), filePath]);
  }
  const conflicting = new Set<string>();
  for (const files of filesByDir.values()) {
    if (files.length > 1) {
      diagnostics.push({
        message: `${files.map(toDisplayPath).sort().join(', ')}: keep only one document index per directory`,
      });
      files.forEach(file => conflicting.add(file));
    }
  }

  const trees: { indexFile: string; order: IndexNode[] }[] = [];
  const listedBy = new Map<string, string>();
  for (const file of indexFiles) {
    if (conflicting.has(file.filePath)) {
      continue;
    }
    const indexFile = toDisplayPath(file.filePath);
    let order: IndexNode[];
    try {
      order = flatten(parseIndexFile(file, scan, readTitle));
    } catch (error) {
      diagnostics.push({
        message: error instanceof Error ? error.message : String(error),
      });
      continue;
    }
    for (const node of order) {
      const existing = listedBy.get(node.sourcePath);
      if (existing) {
        diagnostics.push({
          message: `${toDisplayPath(node.sourcePath)}: listed in both ${existing} and ${indexFile}; a page may appear in only one document index`,
        });
      }
      listedBy.set(node.sourcePath, indexFile);
    }
    trees.push({ indexFile, order });
  }
  if (diagnostics.length > 0) {
    return { index: new Map(), diagnostics };
  }

  const index = new Map<string, DocumentNavigation>();
  for (const { indexFile, order } of trees) {
    order.forEach((node, position) => {
      index.set(
        node.sourcePath,
        getNavigation(order[0], order, position, indexFile),
      );
    });
  }
  return { index, diagnostics };
}

/**
 * Reads every document index file in the scan and builds navigation,
 * reporting the problems in every file
 */
export function loadDocumentIndex(
  scan: TadaProjectScan,
  siteVariables: SiteVariables,
  readTitle: (sourcePath: string) => DocumentPageTitle | undefined,
):
  | { ok: true; value: DocumentIndex }
  | { ok: false; diagnostics: BuildDiagnostic[] } {
  const indexFiles: DocumentIndexFile[] = [];
  const readDiagnostics: BuildDiagnostic[] = [];
  for (const [filePath, entry] of scan.sources) {
    if (entry.renderKind !== 'document-index') {
      continue;
    }
    try {
      indexFiles.push({
        filePath,
        value: readConfigFile(filePath, toDisplayPath(filePath), siteVariables),
      });
    } catch (error) {
      readDiagnostics.push({
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }
  const { index, diagnostics } = buildDocumentIndex(
    indexFiles,
    scan,
    readTitle,
  );
  const allDiagnostics = [...readDiagnostics, ...diagnostics];
  return allDiagnostics.length > 0
    ? { ok: false, diagnostics: allDiagnostics }
    : { ok: true, value: index };
}

/** Pages whose navigation differs between two builds */
export function getChangedDocumentPages(
  previous: DocumentIndex,
  next: DocumentIndex,
): Set<string> {
  const changed = new Set<string>();
  if (previous === next) {
    return changed;
  }
  for (const sourcePath of new Set([...previous.keys(), ...next.keys()])) {
    if (
      JSON.stringify(previous.get(sourcePath)) !==
      JSON.stringify(next.get(sourcePath))
    ) {
      changed.add(sourcePath);
    }
  }
  return changed;
}
