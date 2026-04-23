import fs from 'fs';
import { getDevSiteVariables, getProdSiteVariables } from './site-variables';
import { compileTemplates } from './templates';
import { getDistDir, getProdDistDir } from './utils/paths';
import { isFeatureEnabled } from './features';
import { bundle } from './bundle';
import { copyFonts } from './generate-fonts';
import { copyKatexAssets } from './generate-katex-assets';
import { generateFavicons } from './generate-favicon';
import { generateWebAppManifest } from './generate-web-app-manifest';
import { copyPublicFiles, copyContentAssets } from './copy';
import { ContentRenderer } from './generate-content-assets';
import { runPagefind } from './pagefind';
import { makeLogger, printFlair } from './log';
import { generateBuildManifest, getNextVersion } from './build-manifest';
import { scanProject } from './source-model';
import { validateConfig } from './watch/validation';
import { applyCommitPlan } from '../watch/fs-commit';
import path from 'path';

const log = makeLogger(import.meta.url);

function makeTempOutputDir(targetDir: string): string {
  const parentDir = path.dirname(targetDir);
  fs.mkdirSync(parentDir, { recursive: true });
  return fs.mkdtempSync(
    path.join(parentDir, `${path.basename(targetDir)}-build-`),
  );
}

function removeDirIfExists(dir: string): void {
  fs.rmSync(dir, { recursive: true, force: true });
}

export async function runPipeline(
  mode: 'development' | 'production',
): Promise<void> {
  const isDev = mode === 'development';
  const siteVariables = isDev ? getDevSiteVariables() : getProdSiteVariables();
  const scan = scanProject(siteVariables);
  const publishDir = isDev
    ? getDistDir()
    : path.join(getProdDistDir(), 'v-next');
  const distDir = makeTempOutputDir(publishDir);
  let published = false;

  try {
    const configDiagnostics = validateConfig(scan);
    if (configDiagnostics.length > 0) {
      throw new Error(configDiagnostics[0].message);
    }

    compileTemplates(siteVariables);
    const contentRenderer = new ContentRenderer(siteVariables);
    await contentRenderer.initHighlighter();

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

    const publicRelPaths = copyPublicFiles(scan.publicDir, distDir);
    copyContentAssets(
      scan.contentDir,
      distDir,
      [...scan.processedExts],
      publicRelPaths,
    );

    const { errors, htmlAssetsByPath, htmlAnalysisByPath } =
      contentRenderer.processContent({ distDir, assetFiles, scan });

    for (const err of errors) {
      log.error`${err.message}`;
    }
    if (errors.length > 0) {
      throw new Error(errors[0].message);
    }

    if (isFeatureEnabled(siteVariables, 'search')) {
      await runPagefind({
        distPath: distDir,
        htmlAssetsByPath,
        htmlAnalysisByPath,
      });
    }

    let finalOutputDir = getDistDir();

    if (!isDev) {
      const prodBase = getProdDistDir();
      const prodVersion = getNextVersion(prodBase);
      finalOutputDir = path.join(prodBase, `v${prodVersion}`);
      const manifestPath = path.join(distDir, 'tada.manifest.json');
      await generateBuildManifest(distDir, manifestPath, prodVersion);
      log.info`Built dist-prod/v${prodVersion}/`;
    }

    applyCommitPlan({
      kind: 'replace-root',
      stagedPath: distDir,
      targetPath: finalOutputDir,
    });
    published = true;
    printFlair();
  } finally {
    if (!published) {
      removeDirIfExists(distDir);
    }
  }
}
