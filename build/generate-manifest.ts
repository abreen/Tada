import fs from 'fs';
import path from 'path';
import { createApplyBasePath } from './util.js';
import type { SiteVariables } from './types.js';

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

  return {
    name: siteVariables.title,
    start_url: applyBasePath('/index.html'),
    display: 'minimal-ui',
    icons: [
      {
        src: 'favicon.svg',
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'any maskable',
      },
      {
        src: 'favicon-1024.png',
        sizes: '1024x1024',
        type: 'image/png',
        purpose: 'any maskable',
      },
      {
        src: 'favicon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any maskable',
      },
      {
        src: 'favicon-256.png',
        sizes: '256x256',
        type: 'image/png',
        purpose: 'any maskable',
      },
      {
        src: 'favicon-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any maskable',
      },
      {
        src: 'favicon-128.png',
        sizes: '128x128',
        type: 'image/png',
        purpose: 'any maskable',
      },
      {
        src: 'favicon-64.png',
        sizes: '64x64',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: 'favicon-48.png',
        sizes: '48x48',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: 'favicon-32.png',
        sizes: '32x32',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: 'favicon-16.png',
        sizes: '16x16',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: 'favicon.ico',
        sizes: '16x16 32x32 48x48 64x64 128x128 192x192 256x256',
        type: 'image/x-icon',
        purpose: 'any maskable',
      },
    ],
  };
}

export function generateManifest(
  siteVariables: SiteVariables,
  distDir: string,
): void {
  const manifest = createManifest(siteVariables);
  fs.writeFileSync(
    path.join(distDir, 'manifest.json'),
    JSON.stringify(manifest),
  );
}

export { createManifest };
