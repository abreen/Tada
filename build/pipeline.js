#!/usr/bin/env bun
const fs = require('fs');
const {
  getDevSiteVariables,
  getProdSiteVariables,
} = require('./site-variables');
const { compileTemplates } = require('./templates');
const { getDistDir, getContentDir, getPublicDir } = require('./utils/paths');
const { isFeatureEnabled } = require('./features');
const { bundle } = require('./bundle');
const { generateFonts } = require('./generate-fonts');
const { generateFavicons } = require('./generate-favicon');
const { generateManifest } = require('./generate-manifest');
const { copyPublicFiles, copyContentAssets } = require('./copy');
const { getProcessedExtensions } = require('./utils/file-types');
const { ContentRenderer } = require('./generate-content-assets');
const { runPagefind } = require('./pagefind');
const { makeLogger, printFlair } = require('./log');

const log = makeLogger(__filename);

async function runPipeline(mode) {
  const isDev = mode === 'development';
  const siteVariables = isDev ? getDevSiteVariables() : getProdSiteVariables();
  const distDir = getDistDir();
  const contentDir = getContentDir();
  const publicDir = getPublicDir();

  // Ensure dist/ exists
  fs.mkdirSync(distDir, { recursive: true });

  // Phase 1: Setup
  compileTemplates(siteVariables);
  const contentRenderer = new ContentRenderer(siteVariables);
  await contentRenderer.initHighlighter();

  // Phase 2: Bundle + assets (parallel)
  const parallelTasks = [
    bundle(siteVariables, { mode }),
    generateFonts(distDir),
  ];

  if (isFeatureEnabled(siteVariables, 'favicon')) {
    parallelTasks.push(generateFavicons(siteVariables, distDir));
  }

  const results = await Promise.all(parallelTasks);
  const assetFiles = results[0]; // bundle output filenames

  if (isFeatureEnabled(siteVariables, 'favicon')) {
    generateManifest(siteVariables, distDir);
  }

  const publicRelPaths = copyPublicFiles(publicDir, distDir);
  const processedExtensions = getProcessedExtensions(
    Object.keys(siteVariables.codeLanguages || {}),
  );
  copyContentAssets(contentDir, distDir, processedExtensions, publicRelPaths);

  // Phase 3: Content rendering
  const { errors, htmlAssetsByPath } = contentRenderer.processContent({
    distDir,
    assetFiles,
  });

  for (const err of errors) {
    log.error`${err.message}`;
  }
  if (errors.length > 0) {
    process.exit(1);
  }

  // Phase 4: Post-processing
  if (isFeatureEnabled(siteVariables, 'search')) {
    await runPagefind({ siteVariables, distPath: distDir, htmlAssetsByPath });
  }

  printFlair(siteVariables);
}

// CLI entry point
const arg = process.argv[2];
if (arg === 'dev') {
  runPipeline('development').catch(err => {
    log.error`Build failed: ${err.message}`;
    process.exit(1);
  });
} else if (arg === 'prod') {
  runPipeline('production').catch(err => {
    log.error`Build failed: ${err.message}`;
    process.exit(1);
  });
} else {
  console.error('Usage: pipeline.js <dev|prod>');
  process.exit(1);
}
