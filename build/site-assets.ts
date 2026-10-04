import { bundle, bundleReloadClient } from './bundle';
import { isFeatureEnabled } from './features';
import { generateFavicons } from './generate-favicon';
import { getFontOutputs } from './generate-fonts';
import { getKatexOutputs } from './generate-katex-assets';
import { createWebAppManifest } from './generate-web-app-manifest';
import type { OutputContent, SiteVariables } from './types';

/** Files Tada generates itself, as opposed to files rendered from sources */
interface SiteAssets {
  /** CSS and JavaScript bundles that every page links to */
  assetFiles: string[];
  /** Every generated file, keyed by output path */
  outputs: Map<string, OutputContent>;
}

export async function generateSiteAssets(
  siteVariables: SiteVariables,
  {
    mode,
    isWatchMode,
  }: { mode: 'development' | 'production'; isWatchMode: boolean },
): Promise<SiteAssets> {
  const generateFaviconFiles =
    isFeatureEnabled(siteVariables, 'favicon') && !siteVariables.favicon;
  const [bundles, reloadClient, favicons] = await Promise.all([
    bundle(siteVariables, { mode }),
    isWatchMode ? bundleReloadClient() : new Map<string, string>(),
    generateFaviconFiles
      ? generateFavicons(siteVariables)
      : new Map<string, string | Uint8Array>(),
  ]);
  const bundleFiles = new Map([...bundles, ...reloadClient]);

  const outputs = new Map<string, OutputContent>([
    ...bundleFiles,
    ...getFontOutputs(),
    ...getKatexOutputs(),
    ...favicons,
  ]);
  if (generateFaviconFiles) {
    outputs.set('manifest.json', createWebAppManifest(siteVariables));
  }

  return { assetFiles: [...bundleFiles.keys()], outputs };
}
