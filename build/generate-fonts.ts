import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import wawoff2 from 'wawoff2';
import { getPackageDir, getFontCacheDir } from './utils/paths.js';
import { makeLogger } from './log.js';

const log = makeLogger(__filename);
const FONTS_DIR = path.join(getPackageDir(), 'fonts');
const MANIFEST_VERSION = 1;

interface FontCacheEntry {
  hash: string;
  woff2: string;
}

interface FontCacheManifest {
  version: number;
  entries: Record<string, FontCacheEntry>;
}

function hashFile(filePath: string): string {
  const buf = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function readManifest(cacheDir: string): FontCacheManifest | null {
  const manifestPath = path.join(cacheDir, 'manifest.json');
  try {
    const data = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    if (data.version === MANIFEST_VERSION && data.entries) {
      return data as FontCacheManifest;
    }
  } catch {
    // Missing or corrupt manifest
  }
  return null;
}

function writeManifest(cacheDir: string, manifest: FontCacheManifest): void {
  fs.writeFileSync(
    path.join(cacheDir, 'manifest.json'),
    JSON.stringify(manifest, null, 2) + '\n',
  );
}

export async function generateFonts(distDir: string): Promise<void> {
  const cacheDir = getFontCacheDir();
  const manifest = readManifest(cacheDir);
  const newManifest: FontCacheManifest = {
    version: MANIFEST_VERSION,
    entries: {},
  };
  let allCached = true;
  let logged = false;

  for (const family of fs.readdirSync(FONTS_DIR)) {
    const familyDir = path.join(FONTS_DIR, family);
    if (!fs.statSync(familyDir).isDirectory()) {
      continue;
    }

    const outFamilyDir = path.join(distDir, family);
    fs.mkdirSync(outFamilyDir, { recursive: true });

    for (const file of fs.readdirSync(familyDir)) {
      const filePath = path.join(familyDir, file);

      if (file.endsWith('.ttf')) {
        const entryKey = `${family}/${file}`;
        const hash = hashFile(filePath);
        const outName = file.replace(/\.ttf$/, '.woff2');
        const cachedWoff2Path = path.join(cacheDir, family, outName);
        const cachedEntry = manifest?.entries?.[entryKey];

        if (
          cachedEntry &&
          cachedEntry.hash === hash &&
          fs.existsSync(cachedWoff2Path)
        ) {
          // Cache hit
          fs.copyFileSync(cachedWoff2Path, path.join(outFamilyDir, outName));
          log.debug`Cached ${family}/${outName}`;
        } else {
          // Cache miss, compress and save to both dist and cache
          if (!logged) {
            log.info`Bundling fonts`;
            logged = true;
          }
          allCached = false;
          const ttfBuf = fs.readFileSync(filePath);
          const woff2Buf = Buffer.from(await wawoff2.compress(ttfBuf));
          fs.writeFileSync(path.join(outFamilyDir, outName), woff2Buf);

          const cacheFamilyDir = path.join(cacheDir, family);
          fs.mkdirSync(cacheFamilyDir, { recursive: true });
          fs.writeFileSync(cachedWoff2Path, woff2Buf);
          log.debug`Compressed ${family}/${file} to ${outName}`;
        }

        newManifest.entries[entryKey] = { hash, woff2: `${family}/${outName}` };
      } else {
        fs.copyFileSync(filePath, path.join(outFamilyDir, file));
      }
    }
  }

  if (allCached) {
    log.info`Using cached fonts`;
  } else {
    log.debug`Updated font cache`;
  }

  fs.mkdirSync(cacheDir, { recursive: true });
  writeManifest(cacheDir, newManifest);
}
