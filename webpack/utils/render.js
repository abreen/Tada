const fs = require('fs');
const path = require('path');
const _ = require('lodash');
const { stripHtml } = require('string-strip-html');
const { makeLogger } = require('../log');
const { B } = require('../colors');
const createGlobals = require('../globals');
const { render } = require('../templates');
const {
  extractJavaMethodToc,
  renderCodeSegment,
  renderCodeWithComments,
} = require('./code');
const { extensionIsMarkdown } = require('./file-types');
const { createApplyBasePath, normalizeOutputPath } = require('./paths');
const { parseFrontMatterAndContent } = require('./front-matter');
const { createMarkdown } = require('./markdown');
const { generateTocHtml, generateCodeTocHtml } = require('../toc-plugin');
const {
  parseLiterateJava,
  hasMainMethod,
  deriveClassName,
  compileJavaSource,
  executeLiterateJava,
} = require('./literate-java');

const log = makeLogger(__filename, 'debug');

const REQUIRED_FRONT_MATTER_FIELDS = ['title'];

function validateFrontMatter(pageVariables, filePath) {
  let valid = true;
  for (const field of REQUIRED_FRONT_MATTER_FIELDS) {
    if (!pageVariables[field]) {
      log.error`${filePath}: missing required front matter field: "${field}"`;
      valid = false;
    }
  }
  return valid;
}

function createTemplateParameters({
  pageVariables,
  siteVariables,
  content,
  applyBasePath,
  subPath,
}) {
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

function injectWebpackAssets(html, compilation, applyBasePath) {
  const assets = compilation.getAssets();
  const jsAssets = assets
    .filter(asset => asset.name.endsWith('.js'))
    .map(asset => asset.name);
  const cssAssets = assets
    .filter(asset => asset.name.endsWith('.css'))
    .map(asset => asset.name);

  const scriptTags = jsAssets
    .map(asset => `<script defer src="${applyBasePath('/' + asset)}"></script>`)
    .join('');
  const linkTags = cssAssets
    .map(
      asset => `<link href="${applyBasePath('/' + asset)}" rel="stylesheet">`,
    )
    .join('');

  return html
    .replace('<head>', `<head>${linkTags}`)
    .replace('</head>', `${scriptTags}</head>`);
}

function toContentAssetPath(contentDir, filePath) {
  return path
    .relative(contentDir, filePath)
    .split(path.sep)
    .join(path.posix.sep);
}

function renderPlainTextPageAsset({
  filePath,
  contentDir,
  siteVariables,
  validInternalTargets,
  compilation,
}) {
  const { dir, name, ext } = path.parse(filePath);
  const subPath = path.relative(contentDir, path.join(dir, name));
  const applyBasePath = createApplyBasePath(siteVariables);

  log.note`Rendering page ${B`${subPath + ext}`}`;
  const { content, pageVariables, tocItems } = renderPlainTextContent(
    filePath,
    subPath,
    siteVariables,
    applyBasePath,
    validInternalTargets,
    { validateInternalLinks: extensionIsMarkdown(ext.toLowerCase()) },
  );

  if (!validateFrontMatter(pageVariables, filePath)) {
    return [];
  }

  if (!pageVariables.template) {
    pageVariables.template = 'default';
  }

  if (pageVariables.toc && tocItems) {
    pageVariables.tocHtml = generateTocHtml(tocItems);
  }

  const templateParameters = createTemplateParameters({
    pageVariables,
    siteVariables,
    content,
    applyBasePath,
    subPath,
  });

  const html = injectWebpackAssets(
    render(`${pageVariables.template}.html`, templateParameters),
    compilation,
    applyBasePath,
  );

  return [
    {
      assetPath: toContentAssetPath(contentDir, path.join(dir, `${name}.html`)),
      content: html,
    },
  ];
}

function renderCodePageAsset({
  filePath,
  contentDir,
  siteVariables,
  compilation,
}) {
  const { dir, name, ext } = path.parse(filePath);
  const subPath = path.relative(contentDir, path.join(dir, name));
  const applyBasePath = createApplyBasePath(siteVariables);
  const lang = siteVariables.codeLanguages[ext.slice(1).toLowerCase()];
  const sourceCode = fs.readFileSync(filePath, 'utf-8');

  log.note`Rendering code page ${B`${subPath + ext}`}`;
  const content = renderCodeWithComments(sourceCode, lang, siteVariables);
  const codeFilePath = applyBasePath(
    normalizeOutputPath(`/${toContentAssetPath(contentDir, filePath)}`),
  );
  const titleHtml = `<tt>${name + ext}</tt>`;
  const tocItems = lang === 'java' ? extractJavaMethodToc(sourceCode) : [];
  const tocHtml = generateCodeTocHtml(tocItems);
  const pageVariables = {
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

  const html = injectWebpackAssets(
    render('code.html', templateParameters),
    compilation,
    applyBasePath,
  );

  return [
    {
      assetPath: toContentAssetPath(contentDir, path.join(dir, `${name}.html`)),
      content: html,
    },
  ];
}

function renderCopiedContentAsset({ filePath, contentDir }) {
  const ext = path.extname(filePath).toLowerCase();
  const label = ext === '.pdf' ? 'Copying' : 'Copying source file';
  const relPath = toContentAssetPath(contentDir, filePath);

  log.note`${label} ${B`${relPath}`}`;
  return [{ assetPath: relPath, content: fs.readFileSync(filePath) }];
}

/** Parses the file, renders using template, returns HTML & params used to generate page */
function renderPlainTextContent(
  filePath,
  subPath,
  siteVariables,
  applyBasePath,
  validInternalTargets,
  { validateInternalLinks = true } = {},
) {
  const sourceUrlPath = `/${subPath}.html`;
  const md = createMarkdown(siteVariables, {
    validatorOptions: {
      enabled: validateInternalLinks,
      filePath,
      sourceUrlPath,
      validTargets: validInternalTargets,
      codeExtensions:
        siteVariables.features?.code === false
          ? []
          : Object.keys(siteVariables.codeLanguages),
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
  const pageVariablesProcessed = Object.entries(pageVariables)
    .map(([k, v]) => {
      const newValue =
        typeof v === 'string' ? _.template(v)(siteOnlyParams) : v;
      return [k, newValue];
    })
    .reduce((acc, [k, v]) => {
      acc[k] = v;
      return acc;
    }, {});

  // Render title and description as inline Markdown
  if (pageVariablesProcessed.title) {
    const titleHtml = md.renderInline(pageVariablesProcessed.title);
    pageVariablesProcessed.titleHtml = titleHtml;
    pageVariablesProcessed.title = stripHtml(titleHtml).result;
  }
  if (pageVariablesProcessed.description) {
    const descriptionHtml = md.renderInline(pageVariablesProcessed.description);
    pageVariablesProcessed.descriptionHtml = descriptionHtml;
    pageVariablesProcessed.description = stripHtml(descriptionHtml).result;
  }

  const strippedContent = stripHtmlComments(content);

  const params = createTemplateParameters({
    pageVariables: pageVariablesProcessed,
    siteVariables,
    content: strippedContent,
    applyBasePath,
    subPath,
  });

  let html = null;
  try {
    html = _.template(strippedContent)(params);
  } catch (err) {
    throw new Error(
      `${filePath}: Lodash template error in page or template: ${err.message}`,
    );
  }

  let tocItems = null;
  if (extensionIsMarkdown(ext)) {
    const env = {};
    html = md.render(html, env);
    tocItems = env.tocItems || null;
  }

  return { content: html, pageVariables: params.page, tocItems };
}

function stripHtmlComments(str) {
  return str.replace(/<!---[\s\S]*?-->/g, '');
}

function renderLiterateJavaPageAsset({
  filePath,
  contentDir,
  siteVariables,
  compilation,
}) {
  const { dir, name } = path.parse(filePath);
  const className = deriveClassName(filePath);
  const subPath = path.relative(contentDir, path.join(dir, className));
  const applyBasePath = createApplyBasePath(siteVariables);

  log.note`Rendering literate Java page ${B`${name}`}`;

  const raw = fs.readFileSync(filePath, 'utf-8');
  const {
    pageVariables,
    content,
    javaSource,
    codeBlocks,
    visibleBlockIndices,
  } = parseLiterateJava(raw, siteVariables);

  if (!validateFrontMatter(pageVariables, filePath)) {
    return [];
  }

  // Compile the concatenated Java source
  let tempDir;
  let blockOutputMap = null;
  try {
    tempDir = compileJavaSource(javaSource, className);

    // Execute if there is a main() method
    if (hasMainMethod(javaSource)) {
      const outputEntries = executeLiterateJava(className, tempDir, codeBlocks);
      blockOutputMap = new Map(outputEntries);
    }
  } finally {
    if (tempDir) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }

  // Render full markdown with a custom fence rule that replaces fences
  // with Shiki-highlighted code blocks and optional JDI output columns
  const md = createMarkdown(siteVariables, {
    validatorOptions: { enabled: false },
  });
  let fenceIndex = 0;
  let javaLineCounter = 1;

  md.renderer.rules.fence = (tokens, idx) => {
    const token = tokens[idx];
    const code = token.content;
    const lines = code.endsWith('\n')
      ? code.slice(0, -1).split('\n')
      : code.split('\n');

    // Dedent: strip common leading whitespace for display
    const minIndent = lines.reduce((min, line) => {
      if (line.trim().length === 0) return min;
      const indent = line.match(/^(\s*)/)[1].length;
      return Math.min(min, indent);
    }, Infinity);
    const dedented =
      minIndent > 0 && minIndent < Infinity
        ? lines.map(l => l.slice(minIndent))
        : lines;

    const startLine = javaLineCounter;
    javaLineCounter += lines.length;

    const codeHtml = renderCodeSegment(dedented, startLine, 'java');
    const blockIdx = visibleBlockIndices[fenceIndex++];
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

  const env = {};
  const contentHtml = md.render(content, env);

  // Build page variables
  const javaFileName = `${className}.java`;
  const codeFilePath = applyBasePath(
    normalizeOutputPath(
      `/${toContentAssetPath(contentDir, path.join(dir, javaFileName))}`,
    ),
  );

  const titleHtml = md.renderInline(pageVariables.title);
  pageVariables.titleHtml = titleHtml;
  pageVariables.title = stripHtml(titleHtml).result;
  pageVariables.template = 'literate';
  pageVariables.codeFilePath = codeFilePath;
  pageVariables.downloadName = javaFileName;

  if (pageVariables.toc && env.tocItems) {
    pageVariables.tocHtml = generateTocHtml(env.tocItems);
  }

  const templateParameters = createTemplateParameters({
    pageVariables,
    siteVariables,
    content: contentHtml,
    applyBasePath,
    subPath,
  });

  const html = injectWebpackAssets(
    render('literate.html', templateParameters),
    compilation,
    applyBasePath,
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

module.exports = {
  injectWebpackAssets,
  renderCodePageAsset,
  renderCopiedContentAsset,
  renderLiterateJavaPageAsset,
  renderPlainTextPageAsset,
};
