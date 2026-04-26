import fs from 'fs';
import path from 'path';
import { bundle, getBundleNaming } from '../bundle';
import { copyFonts } from '../generate-fonts';
import { copyKatexAssets } from '../generate-katex-assets';
import { generateFavicons } from '../generate-favicon';
import { generateWebAppManifest } from '../generate-web-app-manifest';
import { getRuntimeBundledShikiLanguages } from '../site-variables';
import { getPackageDir, toPosix } from '../util';
import { initHighlighter } from '../utils/shiki-highlighter';
import type { SiteVariables } from '../types';

const RELOAD_CLIENT_PATH = path.resolve(
  getPackageDir(),
  'build/watch-reload-client.ts',
);

export function makeTempBuildDir(distDir: string): string {
  const parentDir = path.dirname(distDir);
  const prefix = `${path.basename(distDir)}-watch-`;
  return fs.mkdtempSync(path.join(parentDir, prefix));
}

export function removeDirIfExists(dir: string): void {
  fs.rmSync(dir, { recursive: true, force: true });
}

export async function ensureHighlighter(
  siteVariables: SiteVariables,
): Promise<void> {
  await initHighlighter(getRuntimeBundledShikiLanguages(siteVariables));
}

export async function bundleWatchAssets(
  outputDir: string,
  siteVariables: SiteVariables,
): Promise<string[]> {
  const appAssets = await bundle(siteVariables, {
    mode: 'development',
    distDir: outputDir,
  });
  const reloadAssets = await Bun.build({
    entrypoints: [RELOAD_CLIENT_PATH],
    outdir: outputDir,
    naming: getBundleNaming(),
    sourcemap: 'inline',
  });
  return [
    ...appAssets,
    ...reloadAssets.outputs.map(output =>
      toPosix(path.relative(outputDir, output.path)),
    ),
  ];
}

export async function populateStaticAssets(
  outputDir: string,
  siteVariables: SiteVariables,
): Promise<void> {
  copyFonts(outputDir);
  copyKatexAssets(outputDir);
  if (siteVariables.features.favicon !== false) {
    await generateFavicons(siteVariables, outputDir);
    generateWebAppManifest(siteVariables, outputDir);
  }
}

export function copyExistingBuildAssets(
  distDir: string,
  outputDir: string,
  assetFiles: string[],
): void {
  const relPaths = [
    ...assetFiles,
    'inter/InterVariable.woff2',
    'google-sans-code/GoogleSansCodeVariable.woff2',
  ];

  for (const relPath of relPaths) {
    const sourcePath = path.join(distDir, relPath);
    if (!fs.existsSync(sourcePath)) {
      continue;
    }
    const destinationPath = path.join(outputDir, relPath);
    fs.mkdirSync(path.dirname(destinationPath), { recursive: true });
    try {
      fs.linkSync(sourcePath, destinationPath);
    } catch {
      fs.copyFileSync(sourcePath, destinationPath);
    }
  }
}

export function writeAssets(
  outputDir: string,
  assets: Map<string, string | Buffer>,
): void {
  for (const [assetPath, content] of assets) {
    const outputPath = path.join(outputDir, assetPath);
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, content);
  }
}
