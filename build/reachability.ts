import path from 'path';
import { JSDOM } from 'jsdom';

function stripQueryAndHash(href: string): string {
  return href.split('#')[0].split('?')[0];
}

function isExternalOrAnchor(href: string): boolean {
  if (!href || href.startsWith('#') || href.startsWith('//')) {
    return true;
  }

  return /^[a-zA-Z][a-zA-Z\d+.-]*:/.test(href);
}

function normalizeUrlPath(pathname: string): string {
  const normalized = path.posix.normalize(pathname);
  if (normalized === '.' || normalized === '') {
    return '/';
  }

  return normalized.startsWith('/') ? normalized : `/${normalized}`;
}

function stripBasePath(pathname: string, basePath: string): string {
  const normalizedPath = normalizeUrlPath(pathname);
  const normalizedBasePath = normalizeUrlPath(basePath || '/');

  if (normalizedBasePath === '/') {
    return normalizedPath;
  }

  if (normalizedPath === normalizedBasePath) {
    return '/';
  }

  const prefix = `${normalizedBasePath}/`;
  if (normalizedPath.startsWith(prefix)) {
    return normalizeUrlPath(normalizedPath.slice(normalizedBasePath.length));
  }

  return normalizedPath;
}

function toCandidateAssetPaths(urlPath: string): string[] {
  const normalizedPath = normalizeUrlPath(urlPath);

  if (normalizedPath === '/') {
    return ['index.html'];
  }

  if (normalizedPath.endsWith('.html')) {
    return [normalizedPath.slice(1)];
  }

  if (path.posix.extname(normalizedPath)) {
    return [];
  }

  const withoutLeadingSlash = normalizedPath.slice(1);
  if (normalizedPath.endsWith('/')) {
    return [`${withoutLeadingSlash}index.html`];
  }

  return [`${withoutLeadingSlash}/index.html`, `${withoutLeadingSlash}.html`];
}

interface ResolveInternalPathOptions {
  href: string | null;
  fromAssetPath: string;
  basePath?: string;
}

function resolveInternalPath({
  href,
  fromAssetPath,
  basePath = '/',
}: ResolveInternalPathOptions): string | null {
  if (!href) {
    return null;
  }

  const trimmedHref = href.trim();
  if (!trimmedHref || isExternalOrAnchor(trimmedHref)) {
    return null;
  }

  const pathname = stripQueryAndHash(trimmedHref);
  if (!pathname) {
    return null;
  }

  const resolvedPath = pathname.startsWith('/')
    ? stripBasePath(pathname, basePath)
    : normalizeUrlPath(
        path.posix.join(path.posix.dirname(`/${fromAssetPath}`), pathname),
      );

  try {
    return normalizeUrlPath(decodeURIComponent(resolvedPath));
  } catch {
    return normalizeUrlPath(resolvedPath);
  }
}

interface ResolveHrefToHtmlOptions {
  href: string | null;
  fromAssetPath: string;
  basePath?: string;
  knownAssets: Set<string>;
}

export function resolveHrefToHtmlAssetPath({
  href,
  fromAssetPath,
  basePath = '/',
  knownAssets,
}: ResolveHrefToHtmlOptions): string | null {
  const decodedPath = resolveInternalPath({ href, fromAssetPath, basePath });
  if (!decodedPath) {
    return null;
  }

  for (const candidate of toCandidateAssetPaths(decodedPath)) {
    if (knownAssets.has(candidate)) {
      return candidate;
    }
  }

  return null;
}

interface ResolveHrefToPdfOptions {
  href: string | null;
  fromAssetPath: string;
  basePath?: string;
  knownPdfPaths: Set<string>;
}

export function resolveHrefToPdfPath({
  href,
  fromAssetPath,
  basePath = '/',
  knownPdfPaths,
}: ResolveHrefToPdfOptions): string | null {
  const decodedPath = resolveInternalPath({ href, fromAssetPath, basePath });
  if (!decodedPath || !decodedPath.toLowerCase().endsWith('.pdf')) {
    return null;
  }

  return knownPdfPaths.has(decodedPath) ? decodedPath : null;
}

interface CollectDirectLinksOptions {
  html: string;
  fromAssetPath: string;
  knownAssets: Set<string>;
  knownPdfPaths?: Set<string>;
  basePath?: string;
}

interface DirectSiteAssetLinks {
  htmlAssetPaths: string[];
  pdfPaths: string[];
}

export function collectDirectSiteAssetLinks({
  html,
  fromAssetPath,
  knownAssets,
  knownPdfPaths = new Set(),
  basePath = '/',
}: CollectDirectLinksOptions): DirectSiteAssetLinks {
  const htmlAssetPaths = new Set<string>();
  const pdfPaths = new Set<string>();
  const dom = new JSDOM(html);

  try {
    const links = dom.window.document.querySelectorAll('a');
    for (const link of links) {
      if (link.classList.contains('disabled')) {
        continue;
      }

      const href = link.getAttribute('href');
      const pdfPath = resolveHrefToPdfPath({
        href,
        fromAssetPath,
        basePath,
        knownPdfPaths,
      });
      if (pdfPath) {
        pdfPaths.add(pdfPath);
      }

      const targetPath = resolveHrefToHtmlAssetPath({
        href,
        fromAssetPath,
        basePath,
        knownAssets,
      });
      if (targetPath) {
        htmlAssetPaths.add(targetPath);
      }
    }

    const refreshTarget = getMetaRefreshTarget(dom.window.document);
    if (refreshTarget) {
      const targetPath = resolveHrefToHtmlAssetPath({
        href: refreshTarget,
        fromAssetPath,
        basePath,
        knownAssets,
      });
      if (targetPath) {
        htmlAssetPaths.add(targetPath);
      }
    }
  } finally {
    dom.window.close();
  }

  return {
    htmlAssetPaths: [...htmlAssetPaths].sort(),
    pdfPaths: [...pdfPaths].sort(),
  };
}

interface CollectReachableOptions {
  htmlAssetsByPath: Map<string, string>;
  knownPdfPaths?: Set<string>;
  rootPath?: string;
  basePath?: string;
}

interface ReachableSiteAssets {
  reachableHtmlPaths: string[];
  reachablePdfPaths: string[];
}

export function collectReachableSiteAssets({
  htmlAssetsByPath,
  knownPdfPaths = new Set(),
  rootPath = 'index.html',
  basePath = '/',
}: CollectReachableOptions): ReachableSiteAssets {
  if (!htmlAssetsByPath.has(rootPath)) {
    throw new Error(`Pagefind reachability root not found: ${rootPath}`);
  }

  const knownAssets = new Set(htmlAssetsByPath.keys());
  const reachable = new Set<string>();
  const reachablePdfPaths = new Set<string>();
  const pending: string[] = [rootPath];

  while (pending.length > 0) {
    const currentPath = pending.pop()!;
    if (reachable.has(currentPath)) {
      continue;
    }
    reachable.add(currentPath);

    const html = htmlAssetsByPath.get(currentPath)!;
    const { htmlAssetPaths, pdfPaths } = collectDirectSiteAssetLinks({
      html,
      fromAssetPath: currentPath,
      knownAssets,
      knownPdfPaths,
      basePath,
    });

    for (const pdfPath of pdfPaths) {
      reachablePdfPaths.add(pdfPath);
    }

    for (const targetPath of htmlAssetPaths) {
      if (!reachable.has(targetPath)) {
        pending.push(targetPath);
      }
    }
  }

  return {
    reachableHtmlPaths: [...reachable].sort(),
    reachablePdfPaths: [...reachablePdfPaths].sort(),
  };
}

export function collectReachableHtmlAssets(
  options: CollectReachableOptions,
): string[] {
  return collectReachableSiteAssets(options).reachableHtmlPaths;
}

function getMetaRefreshTarget(document: Document): string | null {
  const refreshTags = document.querySelectorAll('meta[http-equiv]');
  for (const tag of refreshTags) {
    const httpEquiv = tag.getAttribute('http-equiv');
    if (!httpEquiv || httpEquiv.toLowerCase() !== 'refresh') {
      continue;
    }

    const content = tag.getAttribute('content') || '';
    const match = content.match(/(?:^|;)\s*url\s*=\s*(.+)\s*$/i);
    if (!match) {
      continue;
    }

    const target = match[1].trim().replace(/^['"]|['"]$/g, '');
    if (target) {
      return target;
    }
  }

  return null;
}
