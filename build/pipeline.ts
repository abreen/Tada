import fs from 'fs';
import { getDevSiteVariables, getProdSiteVariables } from './site-variables';
import { getExtensionToShikiLanguage } from './site-variables';
import { compileTemplates } from './templates';
import {
  getDistDir,
  getProdDistDir,
  getContentDir,
  getPublicDir,
} from './utils/paths';
import { isFeatureEnabled } from './features';
import { bundle } from './bundle';
import { copyFonts } from './generate-fonts';
import { copyKatexAssets } from './generate-katex-assets';
import { generateFavicons } from './generate-favicon';
import { generateWebAppManifest } from './generate-web-app-manifest';
import { copyPublicFiles, copyContentAssets } from './copy';
import { getProcessedExtensions } from './utils/file-types';
import { ContentRenderer } from './generate-content-assets';
import { runPagefind } from './pagefind';
import { makeLogger, printFlair } from './log';
import { generateBuildManifest, getNextVersion } from './build-manifest';
import path from 'path';

const log = makeLogger(import.meta.url);

export async function runPipeline(
  mode: 'development' | 'production',
): Promise<void> {
  const isDev = mode === 'development';
  const siteVariables = isDev ? getDevSiteVariables() : getProdSiteVariables();
  let distDir: string;
  let prodVersion: number;

  if (isDev) {
    distDir = getDistDir();
  } else {
    const prodBase = getProdDistDir();
    prodVersion = getNextVersion(prodBase);
    distDir = path.join(prodBase, `v${prodVersion}`);
  }

  const contentDir = getContentDir();
  const publicDir = getPublicDir();

  // Ensure dist/ exists
  fs.mkdirSync(distDir, { recursive: true });

  // Phase 1: Setup
  compileTemplates(siteVariables);
  const contentRenderer = new ContentRenderer(siteVariables);
  await contentRenderer.initHighlighter();

  // Phase 2: Bundle + assets (parallel)
  const parallelTasks: (Promise<unknown> | void)[] = [
    bundle(siteVariables, { mode, distDir }),
    copyFonts(distDir),
    copyKatexAssets(distDir),
  ];

  if (isFeatureEnabled(siteVariables, 'favicon')) {
    parallelTasks.push(generateFavicons(siteVariables, distDir));
  }

  const results = await Promise.all(parallelTasks);
  const assetFiles = results[0] as string[]; // bundle output filenames

  if (isFeatureEnabled(siteVariables, 'favicon')) {
    generateWebAppManifest(siteVariables, distDir);
  }

  const publicRelPaths = copyPublicFiles(publicDir, distDir);
  const processedExtensions = getProcessedExtensions(
    Object.keys(getExtensionToShikiLanguage(siteVariables)),
  );
  copyContentAssets(contentDir, distDir, processedExtensions, publicRelPaths);

  // Phase 3: Content rendering
  const { errors, htmlAssetsByPath, htmlAnalysisByPath } =
    contentRenderer.processContent({ distDir, assetFiles });

  for (const err of errors) {
    log.error`${err.message}`;
  }
  if (errors.length > 0) {
    process.exit(1);
  }

  // Phase 4: Post-processing
  if (isFeatureEnabled(siteVariables, 'search')) {
    await runPagefind({
      distPath: distDir,
      htmlAssetsByPath,
      htmlAnalysisByPath,
    });
  }

  // Phase 5: Build manifest (production only)
  if (!isDev) {
    const manifestPath = path.join(distDir, 'tada.manifest.json');
    await generateBuildManifest(distDir, manifestPath, prodVersion!);
    log.info`Built dist-prod/v${prodVersion!}/`;
  }

  printFlair();
}
