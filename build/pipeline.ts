#!/usr/bin/env bun
import fs from 'fs';
import { getDevSiteVariables, getProdSiteVariables } from './site-variables.js';
import { compileTemplates } from './templates.js';
import { getDistDir, getContentDir, getPublicDir } from './utils/paths.js';
import { isFeatureEnabled } from './features.js';
import { bundle } from './bundle.js';
import { generateFonts } from './generate-fonts.js';
import { generateFavicons } from './generate-favicon.js';
import { generateManifest } from './generate-manifest.js';
import { copyPublicFiles, copyContentAssets } from './copy.js';
import { getProcessedExtensions } from './utils/file-types.js';
import { ContentRenderer } from './generate-content-assets.js';
import { runPagefind } from './pagefind.js';
import { makeLogger, printFlair } from './log.js';

const log = makeLogger(__filename);

async function runPipeline(mode: 'development' | 'production'): Promise<void> {
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
  const parallelTasks: Promise<unknown>[] = [
    bundle(siteVariables, { mode }),
    generateFonts(distDir),
  ];

  if (isFeatureEnabled(siteVariables, 'favicon')) {
    parallelTasks.push(generateFavicons(siteVariables, distDir));
  }

  const results = await Promise.all(parallelTasks);
  const assetFiles = results[0] as string[]; // bundle output filenames

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

  printFlair();
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
