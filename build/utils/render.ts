import fs from 'fs';
import path from 'path';
import _ from 'lodash';
import type MarkdownIt from 'markdown-it';
import { stripHtml } from 'string-strip-html';
import { makeLogger } from '../log';
import { B } from '../colors';
import createTemplateGlobals from '../template-globals';
import { getExtensionToShikiLanguage } from '../site-variables';
import { config } from '../templates';
import { render } from '../templates';
import {
  getProjectConfigBaseName,
  getSupportedConfigFileNamesText,
} from '../config-files';
import {
  resolveParentLinkTarget,
  validateParentLink,
} from '../validate-config-links';
import {
  extractJavaMethodToc,
  renderCodeSegment,
  renderCodeWithComments,
  rewriteProseLinks,
} from './code';
import { extensionIsMarkdown } from './file-types';
import { createTraceHelpers } from './trace';
import { createIncludeFunction } from './include';
import { finalizeHtmlPage } from './final-html';
import {
  createApplyBasePath,
  normalizeOutputPath,
  toPosix,
  toUrlPath,
} from './paths';
import { applySourceTemplate } from './source-template';
import pkg from '../../package.json' with { type: 'json' };
import { parseFrontMatterAndContent } from './front-matter';
import { createMarkdown } from './markdown';
import { generateTocHtml, generateCodeTocHtml } from '../toc-plugin';
import {
  parseLiterateJava,
  hasMainMethod,
  deriveClassName,
  compileJavaSource,
  executeLiterateJava,
} from './literate-java';
import type {
  Asset,
  SiteVariables,
  RenderPlainTextOptions,
  RenderCodePageOptions,
  RenderLiterateJavaOptions,
  RenderCopiedContentOptions,
  RenderDependencyCollector,
  TraceToolAvailability,
} from '../types';

const log = makeLogger(import.meta.url);

const tadaVersion: string = pkg.version;

const REQUIRED_FRONT_MATTER_FIELDS = ['title'];

function isWatchMode(assetFiles: string[]): boolean {
  return assetFiles.some(f => f.includes('watch-reload-client'));
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
  vars[field] = stripHtml(html).result;
}

interface TemplateParametersInput {
  pageVariables: Record<string, unknown>;
  siteVariables: SiteVariables;
  content: string | null;
  subPath: string;
  isWatchMode: boolean;
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

function validateFrontMatter(
  pageVariables: Record<string, unknown>,
  filePath: string,
): void {
  const missing = REQUIRED_FRONT_MATTER_FIELDS.filter(
    field => !pageVariables[field],
  );
  if (missing.length > 0) {
    const noun = missing.length === 1 ? 'field' : 'fields';
    const fields = missing.map(f => `"${f}"`).join(', ');
    throw new Error(
      `${filePath}: missing required front matter ${noun}: ${fields}`,
    );
  }
}

function createTemplateParameters({
  pageVariables,
  siteVariables,
  content,
  subPath,
  isWatchMode,
}: TemplateParametersInput): Record<string, unknown> {
  const applyBasePath = createApplyBasePath(siteVariables);
  return {
    vars: siteVariables.vars || {},
    ...createTemplateGlobals(pageVariables, siteVariables, subPath),
    site: siteVariables,
    page: pageVariables,
    content,
    isWatchMode,
    speculationRulesHrefMatches: `${applyBasePath('/')}*`,
    tadaVersion,
  };
}

export function injectAssetTags(
  html: string,
  assetFiles: string[],
  distDir: string,
): string {
  const jsAssets = assetFiles.filter(f => f.endsWith('.js'));
  const cssAssets = assetFiles.filter(f => f.endsWith('.css'));

  const scriptTags = jsAssets
    .map(
      asset =>
        `<script defer src="${normalizeOutputPath('/' + asset)}"></script>`,
    )
    .join('');
  const criticalAssets = cssAssets.filter(f => f.includes('critical.bundle.'));
  const asyncAssets = cssAssets.filter(f => !f.includes('critical.bundle.'));
  const criticalTags = criticalAssets
    .map(asset => {
      const css = fs.readFileSync(path.join(distDir, asset), 'utf-8');
      return `<style>${css}</style>`;
    })
    .join('');
  const asyncLinkTags = asyncAssets
    .map(
      asset =>
        `<link href="${normalizeOutputPath('/' + asset)}" rel="stylesheet">`,
    )
    .join('');

  const fontPreloadTags = [
    'inter/InterVariable.woff2',
    'google-sans-code/GoogleSansCodeVariable.woff2',
  ]
    .filter(f => fs.existsSync(path.join(distDir, f)))
    .map(
      f =>
        `<link rel="preload" href="${normalizeOutputPath('/' + f)}" as="font" type="font/woff2" crossorigin>`,
    )
    .join('');

  return html
    .replace(
      '<head>',
      `<head>${fontPreloadTags}${criticalTags}${asyncLinkTags}`,
    )
    .replace('</head>', `${scriptTags}</head>`);
}

export function injectKatexStylesheet(html: string): string {
  const tag = `<link href="/katex/katex.min.css" rel="stylesheet">`;
  return html.replace('<head>', `<head>${tag}`);
}

export function preparePageTemplateHtml({
  templateHtml,
  assetFiles,
  distDir,
}: {
  templateHtml: string;
  assetFiles: string[];
  distDir: string;
}): string {
  let html = injectAssetTags(templateHtml, assetFiles, distDir);
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
  distDir,
  siteVariables,
  validInternalTargets,
  assetFiles,
  literateJavaOutputPaths,
  dependencyCollector,
  cachedTraceSourceDir,
  traceCache,
  traceToolAvailability,
}: RenderPlainTextOptions): Asset[] {
  const { dir, name, ext } = path.parse(filePath);
  const subPath = toPosix(path.relative(contentDir, path.join(dir, name)));
  const sourceUrlPath = normalizeOutputPath(`/${subPath}.html`);

  log.info`Rendering page ${B`${subPath + ext}`}`;
  const watchMode = isWatchMode(assetFiles);
  const { content, pageVariables, tocItems, alertIds } = renderPlainTextContent(
    filePath,
    subPath,
    sourceUrlPath,
    siteVariables,
    validInternalTargets,
    watchMode,
    {
      dependencyCollector,
      traceCache,
      contentDir,
      distDir,
      cachedTraceSourceDir,
      traceToolAvailability,
    },
  );

  validateFrontMatter(pageVariables, filePath);

  if (!pageVariables.template) {
    pageVariables.template = 'default';
  }

  if (pageVariables.toc && tocItems) {
    pageVariables.tocHtml = generateTocHtml(
      tocItems as Parameters<typeof generateTocHtml>[0],
      alertIds,
    );
  }

  const templateParameters = createTemplateParameters({
    pageVariables,
    siteVariables,
    content,
    subPath,
    isWatchMode: watchMode,
  });

  const templateHtml = render(
    `${pageVariables.template}.html`,
    templateParameters,
  ) as string;
  const finalized = finalizeHtmlPage({
    filePath,
    html: preparePageTemplateHtml({ templateHtml, assetFiles, distDir }),
    siteVariables,
    sourceUrlPath,
    validInternalTargets,
    literateJavaOutputPaths,
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
  contentDir,
  distDir,
  siteVariables,
  assetFiles,
  validInternalTargets,
  literateJavaOutputPaths,
  dependencyCollector,
}: RenderCodePageOptions): Asset[] {
  const { dir, name, ext } = path.parse(filePath);
  const subPath = toPosix(path.relative(contentDir, path.join(dir, name)));
  const lang =
    getExtensionToShikiLanguage(siteVariables)[ext.slice(1).toLowerCase()];
  const rawSource = fs.readFileSync(filePath, 'utf-8');
  const sourceCode = applySourceTemplate(rawSource, siteVariables, filePath);
  const pageDirPath = toPosix(path.relative(contentDir, dir));
  const sourceUrlPath = normalizeOutputPath(
    `/${toUrlPath(path.relative(contentDir, filePath))}.html`,
  );

  log.info`Rendering code page ${B`${subPath + ext}`}`;
  const content = renderCodeWithComments(
    sourceCode,
    lang,
    siteVariables,
    pageDirPath,
  );
  const codeFilePath = normalizeOutputPath(
    `/${toUrlPath(path.relative(contentDir, filePath))}`,
  );
  const titleHtml = `<code>${name + ext}</code>`;
  const tocItems = lang === 'java' ? extractJavaMethodToc(sourceCode) : [];
  const tocHtml = generateCodeTocHtml(tocItems);
  const pageVariables: Record<string, unknown> = {
    template: 'code',
    filePath,
    title: `${name}${ext}`,
    titleHtml,
    codeFilePath,
    downloadName: `${name}${ext}`,
    tocItems,
    tocHtml,
  };

  const templateParameters = createTemplateParameters({
    pageVariables,
    siteVariables,
    content,
    subPath,
    isWatchMode: isWatchMode(assetFiles),
  });

  const finalized = finalizeHtmlPage({
    filePath,
    html: injectAssetTags(
      render('code.html', templateParameters) as string,
      assetFiles,
      distDir,
    ),
    siteVariables,
    sourceUrlPath,
    validInternalTargets,
    literateJavaOutputPaths,
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
  contentDir,
  siteVariables,
}: RenderCopiedContentOptions): Asset[] {
  const label = 'Copying source file';
  const relPath = toContentAssetPath(contentDir, filePath);

  log.info`${label} ${B`${relPath}`}`;

  const rawSource = fs.readFileSync(filePath, 'utf-8');
  const templated = applySourceTemplate(rawSource, siteVariables, filePath);

  if (filePath.endsWith('.java')) {
    const pageDirPath = toPosix(
      path.relative(contentDir, path.dirname(filePath)),
    );
    const rewrittenLines = rewriteProseLinks(
      templated.split('\n'),
      siteVariables,
      pageDirPath,
    );
    return [{ assetPath: relPath, content: rewrittenLines.join('\n') }];
  }

  return [{ assetPath: relPath, content: templated }];
}

/** Parses the file, renders using template, returns HTML & params used to generate page */
function renderPlainTextContent(
  filePath: string,
  subPath: string,
  sourceUrlPath: string,
  siteVariables: SiteVariables,
  validInternalTargets: Set<string>,
  isWatchMode: boolean,
  {
    dependencyCollector,
    traceCache,
    contentDir,
    distDir,
    cachedTraceSourceDir,
    traceToolAvailability,
  }: {
    dependencyCollector?: RenderDependencyCollector;
    traceCache?: Map<
      string,
      {
        manifestUrl: string;
        highlightedSource: string;
        totalSteps: number;
        mtime: number;
      }
    >;
    contentDir?: string;
    distDir?: string;
    cachedTraceSourceDir?: string;
    traceToolAvailability?: TraceToolAvailability;
  } = {},
): {
  content: string | null;
  pageVariables: Record<string, unknown>;
  tocItems: unknown[] | null;
  alertIds: string[];
} {
  const md = createMarkdown(siteVariables, { filePath });
  const applyBasePath = createApplyBasePath(siteVariables);

  const ext = path.extname(filePath);
  const raw = fs.readFileSync(filePath, 'utf-8');

  const { pageVariables, content } = parseFrontMatterAndContent(raw, ext);

  // Handle substitutions inside front matter using siteVariables
  const siteOnlyParams = createTemplateParameters({
    pageVariables: {},
    siteVariables,
    content: null,
    subPath,
    isWatchMode,
  });
  const pageVariablesProcessed: Record<string, unknown> = Object.fromEntries(
    Object.entries(pageVariables).map(([k, v]) => [
      k,
      typeof v === 'string' ? _.template(v)(siteOnlyParams) : v,
    ]),
  );

  // Render title and description as inline Markdown
  renderInlineField(md, pageVariablesProcessed, 'title');
  renderInlineField(md, pageVariablesProcessed, 'description');

  resolveAuthor(pageVariablesProcessed, filePath, dependencyCollector);

  const parentError = validateParentLink(
    pageVariablesProcessed.parent,
    filePath,
    validInternalTargets,
    sourceUrlPath,
  );
  if (parentError) {
    throw new Error(parentError);
  }
  const resolvedParentTarget = resolveParentLinkTarget(
    pageVariablesProcessed.parent,
    sourceUrlPath,
  );
  if (resolvedParentTarget) {
    dependencyCollector?.internalTargets?.add(resolvedParentTarget);
  }

  const strippedContent = stripHtmlComments(content);

  const params = createTemplateParameters({
    pageVariables: pageVariablesProcessed,
    siteVariables,
    content: strippedContent,
    subPath,
    isWatchMode,
  });

  if (traceCache && contentDir && distDir) {
    const helpers = createTraceHelpers({
      filePath,
      contentDir,
      distDir,
      applyBasePath,
      cache: traceCache,
      toolAvailability: traceToolAvailability,
      dependencyCollector,
      cachedTraceSourceDir,
    });
    params.renderTrace = helpers.renderTrace;
  }

  params.include = createIncludeFunction(filePath, params, dependencyCollector);

  let html: string;
  try {
    html = _.template(strippedContent)(params);
  } catch (err: unknown) {
    throw new Error(
      `${filePath}: Lodash template error in page or template: ${(err as Error).message}`,
      { cause: err },
    );
  }

  let tocItems: unknown[] | null = null;
  let alertIds: string[] = [];
  if (extensionIsMarkdown(ext)) {
    const env: Record<string, unknown> = { alertIds: [] as string[] };
    html = md.render(html!, env);
    tocItems = (env.tocItems as unknown[] | undefined) || null;
    alertIds = env.alertIds as string[];
  }

  return {
    content: html,
    pageVariables: params.page as Record<string, unknown>,
    tocItems,
    alertIds,
  };
}

export function stripHtmlComments(str: string): string {
  return str.replace(/<!---[\s\S]*?-->/g, '');
}

export function renderLiterateJavaPageAsset({
  filePath,
  contentDir,
  distDir,
  siteVariables,
  assetFiles,
  skipExecution,
  validInternalTargets,
  literateJavaOutputPaths,
  dependencyCollector,
}: RenderLiterateJavaOptions): Asset[] {
  const { dir, name } = path.parse(filePath);
  const className = deriveClassName(filePath);
  const subPath = toPosix(path.relative(contentDir, path.join(dir, className)));

  log.info`Rendering literate Java page ${B`${name}`}`;

  const raw = fs.readFileSync(filePath, 'utf-8');
  const {
    pageVariables,
    content,
    javaSource,
    codeBlocks,
    visibleBlockIndices,
  } = parseLiterateJava(raw, siteVariables);

  validateFrontMatter(pageVariables, filePath);

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
  const sourceUrlPath = `/${subPath}.java.html`;
  const md = createMarkdown(siteVariables, { filePath });
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

  const env: Record<string, unknown> = { alertIds: [] as string[] };
  const contentHtml = md.render(stripHtmlComments(content), env);

  // Build page variables
  const javaFileName = `${className}.java`;
  const codeFilePath = normalizeOutputPath(
    `/${toUrlPath(path.relative(contentDir, path.join(dir, javaFileName)))}`,
  );

  renderInlineField(md, pageVariables, 'title');
  pageVariables.template = 'literate';
  pageVariables.codeFilePath = codeFilePath;
  pageVariables.downloadName = javaFileName;

  if (pageVariables.toc && env.tocItems) {
    pageVariables.tocHtml = generateTocHtml(
      env.tocItems as Parameters<typeof generateTocHtml>[0],
      env.alertIds as string[],
    );
  }

  resolveAuthor(pageVariables, filePath, dependencyCollector);

  const templateParameters = createTemplateParameters({
    pageVariables,
    siteVariables,
    content: contentHtml,
    subPath,
    isWatchMode: isWatchMode(assetFiles),
  });

  const templateHtml = render('literate.html', templateParameters) as string;
  const finalized = finalizeHtmlPage({
    filePath,
    html: preparePageTemplateHtml({ templateHtml, assetFiles, distDir }),
    siteVariables,
    sourceUrlPath,
    validInternalTargets,
    literateJavaOutputPaths,
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
