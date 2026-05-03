import fs from 'fs';
import path from 'path';
import { createApplyBasePath } from './util';
import { FAVICON_SIZES } from './generate-favicon';
import type { SiteVariables } from './types';

interface ManifestIcon {
  src: string;
  sizes: string;
  type: string;
  purpose: string;
}

interface WebAppManifest {
  name: string | undefined;
  start_url: string;
  display: string;
  icons: ManifestIcon[];
}

function createManifest(siteVariables: SiteVariables): WebAppManifest {
  const applyBasePath = createApplyBasePath(siteVariables);
  const filenameBase = 'favicon';

  const pngIcons: ManifestIcon[] = [...FAVICON_SIZES]
    .sort((a, b) => b - a)
    .map(size => ({
      src: `${filenameBase}-${size}.png`,
      sizes: `${size}x${size}`,
      type: 'image/png',
      purpose: size >= 128 ? 'any maskable' : 'any',
    }));

  const icoSizes = FAVICON_SIZES.filter(s => s <= 256)
    .map(s => `${s}x${s}`)
    .join(' ');

  return {
    name: siteVariables.title,
    start_url: applyBasePath('/index.html'),
    display: 'minimal-ui',
    icons: [
      {
        src: `${filenameBase}.svg`,
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'any maskable',
      },
      ...pngIcons,
      {
        src: `${filenameBase}.ico`,
        sizes: icoSizes,
        type: 'image/x-icon',
        purpose: 'any maskable',
      },
    ],
  };
}

export function generateWebAppManifest(
  siteVariables: SiteVariables,
  distDir: string,
): void {
  const manifest = createManifest(siteVariables);
  fs.writeFileSync(
    path.join(distDir, 'manifest.json'),
    JSON.stringify(manifest),
  );
}
