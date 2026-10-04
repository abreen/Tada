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
  const bundles = await bundle(siteVariables, { mode });
  if (isWatchMode) {
    for (const [outputPath, content] of await bundleReloadClient()) {
      bundles.set(outputPath, content);
    }
  }

  const outputs = new Map<string, OutputContent>([
    ...bundles,
    ...getFontOutputs(),
    ...getKatexOutputs(),
  ]);
  if (isFeatureEnabled(siteVariables, 'favicon') && !siteVariables.favicon) {
    for (const [outputPath, content] of await generateFavicons(siteVariables)) {
      outputs.set(outputPath, content);
    }
    outputs.set('manifest.json', createWebAppManifest(siteVariables));
  }

  return { assetFiles: [...bundles.keys()], outputs };
}
