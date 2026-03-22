import fs from 'fs';
import path from 'path';
import _ from 'lodash';
import { stripHtml } from 'string-strip-html';
import { isFeatureEnabled } from '../features';
import { makeLogger } from '../log';
import { B } from '../colors';
import createGlobals from '../globals';
import { render, json } from '../templates';
import {
  extractJavaMethodToc,
  renderCodeSegment,
  renderCodeWithComments,
} from './code';
import { extensionIsMarkdown } from './file-types';
import { createApplyBasePath, normalizeOutputPath } from './paths';
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
} from '../types';

const log = makeLogger(__filename);

const REQUIRED_FRONT_MATTER_FIELDS = ['title'];

interface TemplateParametersInput {
  pageVariables: Record<string, unknown>;
  siteVariables: SiteVariables;
  content: string | null;
  applyBasePath: (subPath: string) => string;
  subPath: string;
}

function resolveAuthor(
  pageVariables: Record<string, unknown>,
  filePath: string,
): void {
  if (!pageVariables.author) {
    return;
  }
  const authors = json('authors.json') as
    | Record<string, Record<string, unknown>>
    | undefined;
  if (!authors) {
    throw new Error(
      `${filePath}: author "${pageVariables.author}" specified but no authors.json found`,
    );
  }
  const authorKey = pageVariables.author as string;
  const authorEntry = authors[authorKey];
  if (!authorEntry) {
    throw new Error(
      `${filePath}: unknown author "${authorKey}" (not found in authors.json)`,
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
  applyBasePath,
  subPath,
}: TemplateParametersInput): Record<string, unknown> {
  return {
    ...(siteVariables.vars || {}),
    ...createGlobals(pageVariables, siteVariables, subPath),
    site: siteVariables,
    base: siteVariables.base,
    basePath: siteVariables.basePath,
    page: pageVariables,
    content,
    applyBasePath,
  };
}

export function injectAssetTags(
  html: string,
  assetFiles: string[],
  applyBasePath: (subPath: string) => string,
  distDir: string,
): string {
  const jsAssets = assetFiles.filter(f => f.endsWith('.js'));
  const cssAssets = assetFiles.filter(f => f.endsWith('.css'));

  const scriptTags = jsAssets
    .map(asset => `<script defer src="${applyBasePath('/' + asset)}"></script>`)
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
        `<link href="${applyBasePath('/' + asset)}" rel="stylesheet" media="print" onload="this.media='all'">` +
        `<noscript><link href="${applyBasePath('/' + asset)}" rel="stylesheet"></noscript>`,
    )
    .join('');

  return html
    .replace('<head>', `<head>${criticalTags}${asyncLinkTags}`)
    .replace('</head>', `${scriptTags}</head>`);
}

function toContentAssetPath(contentDir: string, filePath: string): string {
  return path
    .relative(contentDir, filePath)
    .split(path.sep)
    .join(path.posix.sep);
}

export function renderPlainTextPageAsset({
  filePath,
  contentDir,
  distDir,
  siteVariables,
  validInternalTargets,
  assetFiles,
}: RenderPlainTextOptions): Asset[] {
  const { dir, name, ext } = path.parse(filePath);
  const subPath = path.relative(contentDir, path.join(dir, name));
  const applyBasePath = createApplyBasePath(siteVariables);

  log.info`Rendering page ${B`${subPath + ext}`}`;
  const { content, pageVariables, tocItems } = renderPlainTextContent(
    filePath,
    subPath,
    siteVariables,
    applyBasePath,
    validInternalTargets,
    { validateInternalLinks: extensionIsMarkdown(ext.toLowerCase()) },
  );

  validateFrontMatter(pageVariables, filePath);

  if (!pageVariables.template) {
    pageVariables.template = 'default';
  }

  if (pageVariables.toc && tocItems) {
    pageVariables.tocHtml = generateTocHtml(
      tocItems as Parameters<typeof generateTocHtml>[0],
    );
  }

  const templateParameters = createTemplateParameters({
    pageVariables,
    siteVariables,
    content,
    applyBasePath,
    subPath,
  });

  const html = injectAssetTags(
    render(`${pageVariables.template}.html`, templateParameters) as string,
    assetFiles,
    applyBasePath,
    distDir,
  );

  return [
    {
      assetPath: toContentAssetPath(contentDir, path.join(dir, `${name}.html`)),
      content: html,
    },
  ];
}

export function renderCodePageAsset({
  filePath,
  contentDir,
  distDir,
  siteVariables,
  assetFiles,
}: RenderCodePageOptions): Asset[] {
  const { dir, name, ext } = path.parse(filePath);
  const subPath = path.relative(contentDir, path.join(dir, name));
  const applyBasePath = createApplyBasePath(siteVariables);
  const lang = siteVariables.codeLanguages![ext.slice(1).toLowerCase()];
  const sourceCode = fs.readFileSync(filePath, 'utf-8');

  log.info`Rendering code page ${B`${subPath + ext}`}`;
  const content = renderCodeWithComments(sourceCode, lang, siteVariables);
  const codeFilePath = applyBasePath(
    normalizeOutputPath(`/${toContentAssetPath(contentDir, filePath)}`),
  );
  const titleHtml = `<tt>${name + ext}</tt>`;
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
    applyBasePath,
    subPath,
  });

  const html = injectAssetTags(
    render('code.html', templateParameters) as string,
    assetFiles,
    applyBasePath,
    distDir,
  );

  return [
    {
      assetPath: toContentAssetPath(contentDir, path.join(dir, `${name}.html`)),
      content: html,
    },
  ];
}

export function renderCopiedContentAsset({
  filePath,
  contentDir,
}: RenderCopiedContentOptions): Asset[] {
  const label = 'Copying source file';
  const relPath = toContentAssetPath(contentDir, filePath);

  log.info`${label} ${B`${relPath}`}`;
  return [{ assetPath: relPath, content: fs.readFileSync(filePath) }];
}

/** Parses the file, renders using template, returns HTML & params used to generate page */
function renderPlainTextContent(
  filePath: string,
  subPath: string,
  siteVariables: SiteVariables,
  applyBasePath: (subPath: string) => string,
  validInternalTargets: Set<string>,
  { validateInternalLinks = true } = {},
): {
  content: string | null;
  pageVariables: Record<string, unknown>;
  tocItems: unknown[] | null;
} {
  const sourceUrlPath = `/${subPath}.html`;
  const md = createMarkdown(siteVariables, {
    validatorOptions: {
      enabled: validateInternalLinks,
      filePath,
      sourceUrlPath,
      validTargets: validInternalTargets,
      codeExtensions: isFeatureEnabled(siteVariables, 'code')
        ? Object.keys(siteVariables.codeLanguages!)
        : [],
    },
  });

  const ext = path.extname(filePath);
  const raw = fs.readFileSync(filePath, 'utf-8');

  const { pageVariables, content } = parseFrontMatterAndContent(raw, ext);

  // Handle substitutions inside front matter using siteVariables
  const siteOnlyParams = createTemplateParameters({
    pageVariables: {},
    siteVariables,
    content: null,
    applyBasePath,
    subPath,
  });
  const pageVariablesProcessed: Record<string, unknown> = Object.entries(
    pageVariables,
  )
    .map(([k, v]) => {
      const newValue =
        typeof v === 'string' ? _.template(v)(siteOnlyParams) : v;
      return [k, newValue] as [string, unknown];
    })
    .reduce(
      (acc, [k, v]) => {
        acc[k] = v;
        return acc;
      },
      {} as Record<string, unknown>,
    );

  // Render title and description as inline Markdown
  if (pageVariablesProcessed.title) {
    const titleHtml = md.renderInline(pageVariablesProcessed.title as string);
    pageVariablesProcessed.titleHtml = titleHtml;
    pageVariablesProcessed.title = stripHtml(titleHtml).result;
  }
  if (pageVariablesProcessed.description) {
    const descriptionHtml = md.renderInline(
      pageVariablesProcessed.description as string,
    );
    pageVariablesProcessed.descriptionHtml = descriptionHtml;
    pageVariablesProcessed.description = stripHtml(descriptionHtml).result;
  }

  resolveAuthor(pageVariablesProcessed, filePath);

  const strippedContent = stripHtmlComments(content);

  const params = createTemplateParameters({
    pageVariables: pageVariablesProcessed,
    siteVariables,
    content: strippedContent,
    applyBasePath,
    subPath,
  });

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
  if (extensionIsMarkdown(ext)) {
    const env: Record<string, unknown> = {};
    html = md.render(html!, env);
    tocItems = (env.tocItems as unknown[] | undefined) || null;
  }

  return {
    content: html,
    pageVariables: params.page as Record<string, unknown>,
    tocItems,
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
}: RenderLiterateJavaOptions): Asset[] {
  const { dir, name } = path.parse(filePath);
  const className = deriveClassName(filePath);
  const subPath = path.relative(contentDir, path.join(dir, className));
  const applyBasePath = createApplyBasePath(siteVariables);

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
  const md = createMarkdown(siteVariables, {
    validatorOptions: { enabled: false },
  });
  let fenceIndex = 0;

  md.renderer.rules.fence = (tokens, idx) => {
    const token = tokens[idx];
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
      const escapedOutput = output
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
      return `<div class="literate-code-output">${codeHtml}<pre>${escapedOutput}</pre></div>`;
    }

    return codeHtml;
  };

  const env: Record<string, unknown> = {};
  const contentHtml = md.render(stripHtmlComments(content), env);

  // Build page variables
  const javaFileName = `${className}.java`;
  const codeFilePath = applyBasePath(
    normalizeOutputPath(
      `/${toContentAssetPath(contentDir, path.join(dir, javaFileName))}`,
    ),
  );

  const titleHtml = md.renderInline(pageVariables.title as string);
  pageVariables.titleHtml = titleHtml;
  pageVariables.title = stripHtml(titleHtml).result;
  pageVariables.template = 'literate';
  pageVariables.codeFilePath = codeFilePath;
  pageVariables.downloadName = javaFileName;

  if (pageVariables.toc && env.tocItems) {
    pageVariables.tocHtml = generateTocHtml(
      env.tocItems as Parameters<typeof generateTocHtml>[0],
    );
  }

  resolveAuthor(pageVariables, filePath);

  const templateParameters = createTemplateParameters({
    pageVariables,
    siteVariables,
    content: contentHtml,
    applyBasePath,
    subPath,
  });

  const html = injectAssetTags(
    render('literate.html', templateParameters) as string,
    assetFiles,
    applyBasePath,
    distDir,
  );

  return [
    {
      assetPath: toContentAssetPath(
        contentDir,
        path.join(dir, `${className}.html`),
      ),
      content: html,
    },
    {
      assetPath: toContentAssetPath(contentDir, path.join(dir, javaFileName)),
      content: javaSource,
    },
  ];
}
