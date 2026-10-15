import fs from 'fs';
import path from 'path';
import { escapeUTF8 } from 'entities';
import type MarkdownIt from 'markdown-it';
import { makeLogger } from '../log';
import { B } from '../colors';
import createTemplateGlobals from '../template-globals';
import { getExtensionToShikiLanguage } from '../site-variables';
import { getDefaultFontPreloadFiles } from '../generate-fonts';
import { encodePublicAssetPath } from '../custom-fonts';
import { config, hasNav } from '../templates';
import { render } from '../templates';
import {
  getProjectConfigBaseName,
  getSupportedConfigFileNamesText,
} from '../config-files';
import {
  resolveBreadcrumbLinkTarget,
  validateBreadcrumbs,
} from '../validate-config-links';
import {
  extractJavaMethodToc,
  renderCodeSegment,
  renderCodeWithComments,
  rewriteProseLinks,
} from './code';
import { extensionIsMarkdown } from './file-types';
import { createTraceHelpers } from './trace';
import { stripHtmlComments } from './html-comments';
import { addDetailsPreviewSummaries } from './details-preview';
import { htmlToPlainText } from './plain-text';
import { finalizeHtmlPage } from './final-html';
import {
  createApplyBasePath,
  normalizeOutputPath,
  toDisplayPath,
  toPosix,
  toUrlPath,
} from './paths';
import {
  getSiteVars,
  substituteContent,
  substituteFrontMatterValue,
} from '../variables';
import pkg from '../../package.json' with { type: 'json' };
import { parseFrontMatterAndContent } from './front-matter';
import {
  getPageAuthorAssets,
  getPageScripts,
  type PageAuthorAssets,
} from '../author-scripts';
import { createMarkdown } from './markdown';
import { generateTocHtml, generateCodeTocHtml } from '../toc-plugin';
import {
  extractLiterateJavaCode,
  hasMainMethod,
  deriveClassName,
  compileJavaSource,
  executeLiterateJava,
} from './literate-java';
import type { DocumentNavigation, DocumentPageTitle } from '../document-index';
import type { SourceEntry } from '../source-model';
import type {
  Asset,
  BreadcrumbEntry,
  SiteVariables,
  RenderPlainTextOptions,
  RenderCodePageOptions,
  RenderLiterateJavaOptions,
  RenderCopiedContentOptions,
  RenderDependencyCollector,
} from '../types';

const log = makeLogger(import.meta.url);

const tadaVersion: string = pkg.version;

export { stripHtmlComments } from './html-comments';

const REQUIRED_FRONT_MATTER_FIELDS = ['title'];

// Internal page variables and retired front matter keys. Internal values would
// be overwritten or, for `template`, select a nonexistent template.
const RESERVED_FRONT_MATTER_KEYS: readonly string[] = [
  'template',
  'titleHtml',
  'descriptionHtml',
  'tocHtml',
  'tocItems',
  'codeFilePath',
  'downloadName',
  'filePath',
  'documentNavigation',
  'parent',
  'parentLabel',
];

// Front matter fields Tada reads. Any other key is ignored with a warning.
const KNOWN_FRONT_MATTER_FIELDS: ReadonlySet<string> = new Set([
  'title',
  'description',
  'author',
  'published',
  'toc',
  'slides',
  'breadcrumbs',
  'skip',
  'stdin',
  'scripts',
]);

/** Reads a page, whose front matter can use variables */
function readPage(
  filePath: string,
  ext: string,
): { pageVariables: Record<string, unknown>; content: string } {
  return parseFrontMatterAndContent(
    fs.readFileSync(filePath, 'utf-8'),
    ext,
    toDisplayPath(filePath),
  );
}

/** Returns only the front matter fields Tada reads, warning about others */
function dropUnknownFrontMatterKeys(
  pageVariables: Record<string, unknown>,
  filePath: string,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(pageVariables).filter(([key]) => {
      if (KNOWN_FRONT_MATTER_FIELDS.has(key)) {
        return true;
      }
      log.warn`${toDisplayPath(filePath)}: ignoring unknown front matter field "${key}"; put custom variables under "vars" in the site config`;
      return false;
    }),
  );
}

function renderInlineField(
  md: MarkdownIt,
  vars: Record<string, unknown>,
  field: string,
): void {
  const raw = vars[field];
  if (!raw || typeof raw !== 'string') {
    return;
  }
  const html = md.renderInline(raw);
  vars[`${field}Html`] = html;
  vars[field] = htmlToPlainText(html);
}

/** A code page is titled by its file name */
function getCodePageTitle(filePath: string): DocumentPageTitle {
  const fileName = path.basename(filePath);
  return { title: fileName, titleHtml: `<code>${escapeUTF8(fileName)}</code>` };
}

/**
 * YAML reads an unquoted title like `1.10` as a number, losing the text the
 * author wrote, so an indexed page's title, which other pages show, must be a
 * string.
 */
function requireTextTitle(title: unknown, filePath: string): void {
  if (title !== undefined && title !== null && typeof title !== 'string') {
    throw new Error(
      `${filePath}: "title" must be text; quote it, as in title: "1.10"`,
    );
  }
}

/** Renders the title and description as inline Markdown */
function renderFrontMatterText(
  pageVariables: Record<string, unknown>,
  siteVariables: SiteVariables,
  filePath: string,
): void {
  const md = createMarkdown(siteVariables, {
    filePath,
    slides: pageVariables.slides === true,
  });
  renderInlineField(md, pageVariables, 'title');
  renderInlineField(md, pageVariables, 'description');
}

// Rendered titles for document indexes, by page, reused while a page's title
// is unchanged so watch rebuilds render only edited titles
const pageTitleCache = new WeakMap<
  SiteVariables,
  Map<string, { key: string; title: DocumentPageTitle | undefined }>
>();

/** Forgets cached titles of pages other than those given */
export function retainPageTitles(
  siteVariables: SiteVariables,
  sourcePaths: ReadonlySet<string>,
): void {
  for (const filePath of pageTitleCache.get(siteVariables)?.keys() ?? []) {
    if (!sourcePaths.has(filePath)) {
      pageTitleCache.get(siteVariables)!.delete(filePath);
    }
  }
}

/**
 * A page's title as its own render produces it, without rendering the page;
 * undefined for a page whose title is missing or has no text. The title comes
 * from the front matter the project scan already read, so the page is read
 * again only when its front matter is invalid, to report the error.
 */
export function readPageTitle(
  filePath: string,
  entry: Pick<SourceEntry, 'renderKind' | 'title' | 'titleFields'>,
  siteVariables: SiteVariables,
): DocumentPageTitle | undefined {
  if (entry.renderKind === 'code-page') {
    return getCodePageTitle(filePath);
  }
  // Front matter that rendering rejects is read again to report its error
  const raw =
    entry.titleFields && !entry.titleFields.invalid
      ? entry.titleFields
      : readPage(filePath, path.extname(filePath).toLowerCase()).pageVariables;
  requireTextTitle(raw.title, filePath);
  const pageVariables: Record<string, unknown> = {
    // The scan substituted the title, unless substitution fails: then this
    // reports the error
    title:
      entry.title ??
      substituteFrontMatterValue(raw.title, siteVariables, filePath),
    slides: raw.slides,
  };

  let cache = pageTitleCache.get(siteVariables);
  if (!cache) {
    cache = new Map();
    pageTitleCache.set(siteVariables, cache);
  }
  const key = JSON.stringify([pageVariables.title, pageVariables.slides]);
  const cached = cache.get(filePath);
  if (cached?.key === key) {
    return cached.title;
  }

  renderFrontMatterText(pageVariables, siteVariables, filePath);
  const title =
    typeof pageVariables.titleHtml === 'string' && pageVariables.title
      ? {
          title: pageVariables.title as string,
          titleHtml: pageVariables.titleHtml,
        }
      : undefined;
  cache.set(filePath, { key, title });
  return title;
}

interface TemplateParametersInput {
  pageVariables: Record<string, unknown>;
  siteVariables: SiteVariables;
  content: string | null;
  subPath: string;
  isWatchMode: boolean;
  bannerHtml?: string;
  authorAssets?: PageAuthorAssets;
}

function resolveAuthor(
  pageVariables: Record<string, unknown>,
  filePath: string,
  dependencyCollector?: RenderDependencyCollector,
): void {
  if (!pageVariables.author) {
    return;
  }
  const authors = config('authors') as
    | Record<string, Record<string, unknown>>
    | undefined;
  if (!authors) {
    throw new Error(
      `${filePath}: author "${pageVariables.author}" specified but no author config found (tried ${getSupportedConfigFileNamesText(getProjectConfigBaseName('authors'))})`,
    );
  }
  const authorKey = pageVariables.author as string;
  dependencyCollector?.setAuthorKey?.(authorKey);
  const authorEntry = authors[authorKey];
  if (!authorEntry) {
    throw new Error(
      `${filePath}: unknown author "${authorKey}" (not found in author config)`,
    );
  }
  pageVariables.author = authorEntry;
}

function rejectReservedFrontMatterKeys(
  pageVariables: Record<string, unknown>,
  filePath: string,
): void {
  const key = RESERVED_FRONT_MATTER_KEYS.find(k =>
    Object.hasOwn(pageVariables, k),
  );
  if (key) {
    throw new Error(
      `${toDisplayPath(filePath)}: front matter key "${key}" is reserved`,
    );
  }
}

// Only the site's home page may omit its title (and so its heading)
const HOME_PAGE_URL_PATH = '/index.html';

function validateFrontMatter(
  pageVariables: Record<string, unknown>,
  filePath: string,
  sourceUrlPath: string,
): void {
  const isHomePage = sourceUrlPath === HOME_PAGE_URL_PATH;
  const missing = REQUIRED_FRONT_MATTER_FIELDS.filter(
    field => !pageVariables[field] && !(isHomePage && field === 'title'),
  );
  if (missing.length > 0) {
    const noun = missing.length === 1 ? 'field' : 'fields';
    const fields = missing.map(f => `"${f}"`).join(', ');
    throw new Error(
      `${filePath}: missing required front matter ${noun}: ${fields}`,
    );
  }

  // The breadcrumb trail ends with the page title
  const breadcrumbs = pageVariables.breadcrumbs;
  if (
    !pageVariables.title &&
    Array.isArray(breadcrumbs) &&
    breadcrumbs.length > 0
  ) {
    throw new Error(
      `${filePath}: front matter "breadcrumbs" requires a "title"`,
    );
  }
}

function createTemplateParameters({
  pageVariables,
  siteVariables,
  content,
  subPath,
  isWatchMode,
  bannerHtml,
  authorAssets,
}: TemplateParametersInput): Record<string, unknown> {
  const applyBasePath = createApplyBasePath(siteVariables);
  const siteHasNav = hasNav();
  return {
    authorScriptPaths: (authorAssets?.js ?? []).map(file =>
      normalizeOutputPath('/' + file),
    ),
    ...createTemplateGlobals(pageVariables, siteVariables, subPath),
    site: siteVariables,
    page: pageVariables,
    content,
    bannerHtml,
    isWatchMode,
    hasNav: siteHasNav,
    // Without a nav or search, the header scrolls away with the page
    isHeaderFloating: siteHasNav || siteVariables.features.search,
    speculationRulesHrefMatches: `${applyBasePath('/')}*`,
    tadaVersion,
  };
}

// The banner is the same on every page, so it is rendered once per site config
const bannerHtmlCache = new WeakMap<SiteVariables, string>();

function renderSiteBanner(siteVariables: SiteVariables): string {
  if (!siteVariables.banner) {
    return '';
  }

  let html = bannerHtmlCache.get(siteVariables);
  if (html === undefined) {
    // Rendered apart from the page, so its tab groups need their own IDs
    html = createMarkdown(siteVariables, {
      tabsIdPrefix: 'banner-tabs',
    }).render(siteVariables.banner);
    bannerHtmlCache.set(siteVariables, html);
  }
  return html;
}

// `<meta charset>` is the first element in `<head>` so browsers find it within
// the first 1024 bytes. Tags injected into the head go right after it.
const CHARSET_META_PATTERN = /<meta charset="UTF-8"\s*\/?>/;

function insertAfterCharsetMeta(html: string, tags: string): string {
  return html.replace(CHARSET_META_PATTERN, charsetMeta => charsetMeta + tags);
}

export function injectAssetTags(
  html: string,
  assetFiles: string[],
  siteVariables: SiteVariables,
  authorAssets: PageAuthorAssets = { js: [], css: [] },
): string {
  const jsAssets = assetFiles.filter(f => f.endsWith('.js'));
  const cssAssets = assetFiles.filter(f => f.endsWith('.css'));

  const scriptTags = jsAssets
    .map(
      asset =>
        `<script defer src="${normalizeOutputPath('/' + asset)}"></script>`,
    )
    .join('');
  // Render-blocking on purpose: pages never paint without the full stylesheet
  const stylesheetTags = cssAssets
    .map(
      asset =>
        `<link href="${normalizeOutputPath('/' + asset)}" rel="stylesheet">`,
    )
    .join('');
  // After Tada's stylesheet, so author rules win specificity ties
  const authorStylesheetTags = authorAssets.css
    .map(
      file =>
        `<link href="${normalizeOutputPath('/' + file)}" rel="stylesheet" data-tada-style>`,
    )
    .join('');
  // Start downloading author scripts while the page parses; the runtime mounts
  // them from markers in the page content
  const authorScriptTags = authorAssets.js
    .map(
      file =>
        `<link rel="modulepreload" href="${normalizeOutputPath('/' + file)}">`,
    )
    .join('');

  const fontPreloadTags = getDefaultFontPreloadFiles(siteVariables)
    .map(preload => {
      const urlPath =
        preload.source === 'site'
          ? encodePublicAssetPath(preload.filePath)
          : preload.filePath;
      return `<link rel="preload" href="${normalizeOutputPath('/' + urlPath)}" as="font" type="font/woff2" crossorigin>`;
    })
    .join('');

  return insertAfterCharsetMeta(
    html,
    `${fontPreloadTags}${stylesheetTags}${authorStylesheetTags}`,
  ).replace('</head>', `${scriptTags}${authorScriptTags}</head>`);
}

export function injectKatexStylesheet(html: string): string {
  const tag = `<link href="/katex/katex.min.css" rel="stylesheet">`;
  return insertAfterCharsetMeta(html, tag);
}

export function preparePageTemplateHtml({
  templateHtml,
  assetFiles,
  siteVariables,
  authorAssets,
}: {
  templateHtml: string;
  assetFiles: string[];
  siteVariables: SiteVariables;
  authorAssets?: PageAuthorAssets;
}): string {
  let html = injectAssetTags(
    templateHtml,
    assetFiles,
    siteVariables,
    authorAssets,
  );
  if (templateHtml.includes('class="katex"')) {
    html = injectKatexStylesheet(html);
  }
  return html;
}

function toContentAssetPath(contentDir: string, filePath: string): string {
  return toPosix(path.relative(contentDir, filePath));
}

export function renderPlainTextPageAsset({
  filePath,
  contentDir,
  siteVariables,
  validInternalTargets,
  assetFiles,
  authorScripts,
  isWatchMode,
  literateJavaOutputPaths,
  generatedPageTargets,
  codePageSourceTargets,
  dependencyCollector,
  traceCache,
  traceToolAvailability,
  documentNavigation,
  pageTitles,
}: RenderPlainTextOptions): Asset[] {
  const { dir, name, ext } = path.parse(filePath);
  const subPath = toPosix(path.relative(contentDir, path.join(dir, name)));
  const sourceUrlPath = normalizeOutputPath(`/${subPath}.html`);

  log.info`Rendering page ${B`${subPath + ext}`}`;
  const { content, pageVariables, tocItems } = renderPlainTextContent(
    filePath,
    sourceUrlPath,
    siteVariables,
    validInternalTargets,
    {
      dependencyCollector,
      traceCache,
      contentDir,
      traceToolAvailability,
      documentNavigation,
      pageTitles,
    },
  );

  pageVariables.template = 'default';

  if (pageVariables.toc && tocItems) {
    pageVariables.tocHtml = generateTocHtml(
      tocItems as Parameters<typeof generateTocHtml>[0],
    );
  }

  const authorAssets = getPageAuthorAssets(
    authorScripts,
    getPageScripts(siteVariables.scripts, pageVariables.scripts, filePath),
    filePath,
  );
  const templateParameters = createTemplateParameters({
    pageVariables,
    siteVariables,
    content,
    subPath,
    isWatchMode,
    bannerHtml: renderSiteBanner(siteVariables),
    authorAssets,
  });

  const templateHtml = render(
    `${pageVariables.template}.html`,
    templateParameters,
  ) as string;
  const finalized = finalizeHtmlPage({
    filePath,
    html: preparePageTemplateHtml({
      templateHtml,
      assetFiles,
      siteVariables,
      authorAssets,
    }),
    siteVariables,
    sourceUrlPath,
    validInternalTargets,
    literateJavaOutputPaths,
    generatedPageTargets,
    codePageSourceTargets,
    dependencyCollector,
  });

  return [
    {
      assetPath: toContentAssetPath(contentDir, path.join(dir, `${name}.html`)),
      content: finalized.html,
      htmlAnalysis: finalized.analysis,
    },
  ];
}

export function renderCodePageAsset({
  filePath,
  source,
  contentDir,
  siteVariables,
  assetFiles,
  authorScripts,
  isWatchMode,
  validInternalTargets,
  literateJavaOutputPaths,
  generatedPageTargets,
  codePageSourceTargets,
  dependencyCollector,
  documentNavigation,
}: RenderCodePageOptions): Asset[] {
  const { dir, name, ext } = path.parse(filePath);
  const subPath = toPosix(path.relative(contentDir, path.join(dir, name)));
  const lang =
    getExtensionToShikiLanguage(siteVariables)[ext.slice(1).toLowerCase()];
  const pageDirPath = toPosix(path.relative(contentDir, dir));
  const sourceUrlPath = normalizeOutputPath(
    `/${toUrlPath(path.relative(contentDir, filePath))}.html`,
  );

  log.info`Rendering code page ${B`${subPath + ext}`}`;
  const content = renderCodeWithComments(
    source,
    lang,
    siteVariables,
    pageDirPath,
  );
  const codeFilePath = normalizeOutputPath(
    `/${toUrlPath(path.relative(contentDir, filePath))}`,
  );
  const tocItems = lang === 'java' ? extractJavaMethodToc(source) : [];
  const tocHtml = generateCodeTocHtml(tocItems);
  const pageVariables: Record<string, unknown> = {
    template: 'code',
    filePath,
    ...getCodePageTitle(filePath),
    codeFilePath,
    downloadName: `${name}${ext}`,
    tocItems,
    tocHtml,
    ...(documentNavigation
      ? {
          breadcrumbs: getDocumentBreadcrumbs(documentNavigation),
          documentNavigation,
        }
      : {}),
  };

  // Code pages have no front matter, so they load only site-wide scripts
  const authorAssets = getPageAuthorAssets(
    authorScripts,
    getPageScripts(siteVariables.scripts, undefined, filePath),
    filePath,
  );
  const templateParameters = createTemplateParameters({
    pageVariables,
    siteVariables,
    content,
    subPath,
    isWatchMode,
    bannerHtml: renderSiteBanner(siteVariables),
    authorAssets,
  });

  const templateHtml = render('code.html', templateParameters) as string;
  const finalized = finalizeHtmlPage({
    filePath,
    html: preparePageTemplateHtml({
      templateHtml,
      assetFiles,
      siteVariables,
      authorAssets,
    }),
    siteVariables,
    sourceUrlPath,
    validInternalTargets,
    literateJavaOutputPaths,
    generatedPageTargets,
    codePageSourceTargets,
    dependencyCollector,
  });

  return [
    {
      assetPath: toContentAssetPath(
        contentDir,
        path.join(dir, `${name}${ext}.html`),
      ),
      content: finalized.html,
      htmlAnalysis: finalized.analysis,
    },
  ];
}

export function renderCopiedContentAsset({
  filePath,
  source,
  contentDir,
  siteVariables,
}: RenderCopiedContentOptions): Asset[] {
  const label = 'Copying source file';
  const relPath = toContentAssetPath(contentDir, filePath);

  log.info`${label} ${B`${relPath}`}`;

  if (path.extname(filePath).toLowerCase() === '.java') {
    const pageDirPath = toPosix(
      path.relative(contentDir, path.dirname(filePath)),
    );
    const rewrittenLines = rewriteProseLinks(
      source.split('\n'),
      siteVariables,
      pageDirPath,
    );
    return [{ assetPath: relPath, content: rewrittenLines.join('\n') }];
  }

  return [{ assetPath: relPath, content: source }];
}

interface PreparePageVariablesInput {
  rawPageVariables: Record<string, unknown>;
  filePath: string;
  sourceUrlPath: string;
  siteVariables: SiteVariables;
  validInternalTargets: ReadonlySet<string>;
  /** Whether this renderer supports `slides: true` (Markdown pages only) */
  allowSlides: boolean;
  dependencyCollector?: RenderDependencyCollector;
  documentNavigation?: DocumentNavigation;
}

/** An indexed page's ancestors in its document tree */
function getDocumentBreadcrumbs(
  navigation: DocumentNavigation,
): BreadcrumbEntry[] {
  return navigation.ancestors.map(({ title, href, isCodePage }) => ({
    label: title,
    url: href,
    isCodePage,
  }));
}

/**
 * Turns parsed front matter into page variables. Shared by every renderer
 * whose source has front matter, so each one applies the same rules:
 * site variable substitution in string values, inline Markdown for the title
 * and description, required fields, author lookup, and breadcrumb validation.
 * A document index provides an indexed page's breadcrumbs.
 */
function preparePageVariables({
  rawPageVariables,
  filePath,
  sourceUrlPath,
  siteVariables,
  validInternalTargets,
  allowSlides,
  dependencyCollector,
  documentNavigation,
}: PreparePageVariablesInput): Record<string, unknown> {
  rejectReservedFrontMatterKeys(rawPageVariables, filePath);
  const knownPageVariables = dropUnknownFrontMatterKeys(
    rawPageVariables,
    filePath,
  );
  if (documentNavigation && knownPageVariables.breadcrumbs !== undefined) {
    throw new Error(
      `${filePath}: front matter "breadcrumbs" is not allowed on a page listed in ${documentNavigation.indexFile}, which provides its breadcrumbs`,
    );
  }
  if (knownPageVariables.slides === true && !allowSlides) {
    throw new Error(
      `${filePath}: slides mode is only supported on Markdown pages`,
    );
  }

  const templateString = (value: unknown): unknown =>
    substituteFrontMatterValue(value, siteVariables, filePath);
  const pageVariables: Record<string, unknown> = Object.fromEntries(
    Object.entries(knownPageVariables).map(([key, value]) => [
      key,
      templateString(value),
    ]),
  );
  if (Array.isArray(pageVariables.breadcrumbs)) {
    pageVariables.breadcrumbs = pageVariables.breadcrumbs.map(
      (entry: unknown) => {
        if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
          return entry;
        }
        const breadcrumb = entry as Record<string, unknown>;
        return {
          ...breadcrumb,
          label: templateString(breadcrumb.label),
          url: templateString(breadcrumb.url),
        };
      },
    );
  }

  renderFrontMatterText(pageVariables, siteVariables, filePath);
  if (documentNavigation) {
    pageVariables.breadcrumbs = getDocumentBreadcrumbs(documentNavigation);
    pageVariables.documentNavigation = documentNavigation;
  }

  validateFrontMatter(pageVariables, filePath, sourceUrlPath);
  resolveAuthor(pageVariables, filePath, dependencyCollector);

  const breadcrumbs = pageVariables.breadcrumbs;
  validateBreadcrumbs(
    breadcrumbs,
    filePath,
    validInternalTargets,
    sourceUrlPath,
  );
  for (const entry of breadcrumbs ?? []) {
    const resolvedTarget = resolveBreadcrumbLinkTarget(
      entry.url,
      sourceUrlPath,
    );
    if (resolvedTarget) {
      dependencyCollector?.internalTargets?.add(resolvedTarget);
    }
  }

  return pageVariables;
}

/** Parses the file, substitutes site variables, and renders Markdown pages */
function renderPlainTextContent(
  filePath: string,
  sourceUrlPath: string,
  siteVariables: SiteVariables,
  validInternalTargets: ReadonlySet<string>,
  {
    dependencyCollector,
    traceCache,
    contentDir,
    traceToolAvailability,
    documentNavigation,
    pageTitles,
  }: Pick<
    RenderPlainTextOptions,
    | 'dependencyCollector'
    | 'traceCache'
    | 'contentDir'
    | 'traceToolAvailability'
    | 'documentNavigation'
    | 'pageTitles'
  >,
): {
  content: string | null;
  pageVariables: Record<string, unknown>;
  tocItems: unknown[] | null;
} {
  const applyBasePath = createApplyBasePath(siteVariables);

  const ext = path.extname(filePath).toLowerCase();
  const { pageVariables: rawPageVariables, content } = readPage(filePath, ext);
  const pageVariables = preparePageVariables({
    rawPageVariables,
    filePath,
    sourceUrlPath,
    siteVariables,
    validInternalTargets,
    allowSlides: extensionIsMarkdown(ext),
    dependencyCollector,
    documentNavigation,
  });

  const vars = getSiteVars(siteVariables);
  let html = substituteContent(content, vars, filePath);

  let tocItems: unknown[] | null = null;
  if (extensionIsMarkdown(ext)) {
    const renderTrace = traceCache
      ? createTraceHelpers({
          filePath,
          contentDir,
          applyBasePath,
          cache: traceCache,
          toolAvailability: traceToolAvailability,
          dependencyCollector,
          siteVariables,
        }).renderTrace
      : undefined;
    const md = createMarkdown(siteVariables, {
      filePath,
      slides: pageVariables.slides === true,
      vars,
      renderTrace,
      dependencyCollector,
      pageTitles,
    });
    const env: Record<string, unknown> = {};
    html = md.render(html, env);
    tocItems = (env.tocItems as unknown[] | undefined) || null;
  }

  return { content: addDetailsPreviewSummaries(html), pageVariables, tocItems };
}

export function renderLiterateJavaPageAsset({
  filePath,
  contentDir,
  siteVariables,
  assetFiles,
  authorScripts,
  isWatchMode,
  skipExecution,
  validInternalTargets,
  literateJavaOutputPaths,
  generatedPageTargets,
  codePageSourceTargets,
  dependencyCollector,
  documentNavigation,
  pageTitles,
}: RenderLiterateJavaOptions): Asset[] {
  const { dir, name } = path.parse(filePath);
  const className = deriveClassName(filePath);
  const subPath = toPosix(path.relative(contentDir, path.join(dir, className)));

  log.info`Rendering literate Java page ${B`${name}`}`;

  const sourceUrlPath = `/${subPath}.java.html`;
  const { pageVariables: rawPageVariables, content } = readPage(
    filePath,
    '.md',
  );
  const pageVariables = preparePageVariables({
    rawPageVariables,
    filePath,
    sourceUrlPath,
    siteVariables,
    validInternalTargets,
    allowSlides: false,
    dependencyCollector,
    documentNavigation,
  });
  const vars = getSiteVars(siteVariables);
  const md = createMarkdown(siteVariables, {
    filePath,
    vars,
    preserveHtmlComments: true,
    dependencyCollector,
    pageTitles,
  });
  const env: Record<string, unknown> = {};
  const tokens = md.parse(
    substituteContent(content, vars, filePath, true),
    env,
  );
  const { javaSource, codeBlocks, visibleBlockIndices } =
    extractLiterateJavaCode(tokens);

  const stdin =
    typeof pageVariables.stdin === 'string' ? pageVariables.stdin : undefined;

  // Compile and execute the concatenated Java source
  let tempDir: string | undefined;
  let blockOutputMap: Map<number, string> | null = null;
  if (!skipExecution) {
    try {
      tempDir = compileJavaSource(javaSource, className);

      // Execute if there is a main() method
      if (hasMainMethod(javaSource)) {
        const outputEntries = executeLiterateJava(
          className,
          tempDir,
          codeBlocks,
          stdin,
        );
        blockOutputMap = new Map(
          outputEntries.map(e => [e.blockIndex, e.output]),
        );
      }
    } finally {
      if (tempDir) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    }
  }

  // Render full markdown with a custom fence rule that replaces fences
  // with Shiki-highlighted code blocks and optional JDI output columns
  let fenceIndex = 0;
  const defaultFence = md.renderer.rules.fence!;

  md.renderer.rules.fence = (tokens, idx, options, env, self) => {
    const token = tokens[idx];
    const lang = token.info.trim();

    // Non-Java fences render with the default renderer (no line numbers)
    if (lang !== '' && lang !== 'java') {
      return defaultFence(tokens, idx, options, env, self);
    }

    const code = token.content;
    const lines = code.endsWith('\n')
      ? code.slice(0, -1).split('\n')
      : code.split('\n');

    // Dedent: strip common leading whitespace for display
    const minIndent = lines.reduce((min, line) => {
      if (line.trim().length === 0) {
        return min;
      }
      const indent = line.match(/^(\s*)/)![1].length;
      return Math.min(min, indent);
    }, Infinity);
    const dedented =
      minIndent > 0 && minIndent < Infinity
        ? lines.map(l => l.slice(minIndent))
        : lines;

    const blockIdx = visibleBlockIndices[fenceIndex++];
    const startLine = codeBlocks[blockIdx].javaStartLine;

    const codeHtml = renderCodeSegment(dedented, startLine, 'java');
    const output =
      blockOutputMap && blockOutputMap.has(blockIdx)
        ? blockOutputMap.get(blockIdx)
        : null;

    if (output) {
      const escapedOutput = md.utils.escapeHtml(output);
      return `<div class="literate-code-output">${codeHtml}<pre>${escapedOutput}</pre></div>`;
    }

    return codeHtml;
  };

  const contentHtml = addDetailsPreviewSummaries(
    stripHtmlComments(md.renderer.render(tokens, md.options, env)),
  );

  // Build page variables
  const javaFileName = `${className}.java`;
  const codeFilePath = normalizeOutputPath(
    `/${toUrlPath(path.relative(contentDir, path.join(dir, javaFileName)))}`,
  );

  pageVariables.template = 'literate';
  pageVariables.codeFilePath = codeFilePath;
  pageVariables.downloadName = javaFileName;

  if (pageVariables.toc && env.tocItems) {
    pageVariables.tocHtml = generateTocHtml(
      env.tocItems as Parameters<typeof generateTocHtml>[0],
    );
  }

  const authorAssets = getPageAuthorAssets(
    authorScripts,
    getPageScripts(siteVariables.scripts, pageVariables.scripts, filePath),
    filePath,
  );
  const templateParameters = createTemplateParameters({
    pageVariables,
    siteVariables,
    content: contentHtml,
    subPath,
    isWatchMode,
    bannerHtml: renderSiteBanner(siteVariables),
    authorAssets,
  });

  const templateHtml = render('literate.html', templateParameters) as string;
  const finalized = finalizeHtmlPage({
    filePath,
    html: preparePageTemplateHtml({
      templateHtml,
      assetFiles,
      siteVariables,
      authorAssets,
    }),
    siteVariables,
    sourceUrlPath,
    validInternalTargets,
    literateJavaOutputPaths,
    generatedPageTargets,
    codePageSourceTargets,
    dependencyCollector,
  });

  return [
    {
      assetPath: toContentAssetPath(
        contentDir,
        path.join(dir, `${className}.java.html`),
      ),
      content: finalized.html,
      htmlAnalysis: finalized.analysis,
    },
    {
      assetPath: toContentAssetPath(contentDir, path.join(dir, javaFileName)),
      content: javaSource,
    },
  ];
}

export { finalizeHtmlPage } from './final-html';
