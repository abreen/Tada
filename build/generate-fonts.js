const fs = require('fs');
const path = require('path');
const wawoff2 = require('wawoff2');
const { getPackageDir } = require('./utils/paths');
const { makeLogger } = require('./log');

const log = makeLogger(__filename);
const FONTS_DIR = path.join(getPackageDir(), 'fonts');

async function generateFonts(distDir) {
  log.info`Bundling fonts`;

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
        const ttfBuf = fs.readFileSync(filePath);
        const woff2Buf = Buffer.from(await wawoff2.compress(ttfBuf));
        const outName = file.replace(/\.ttf$/, '.woff2');
        fs.writeFileSync(path.join(outFamilyDir, outName), woff2Buf);
        log.debug`Converted ${family}/${file} to ${outName}`;
      } else {
        fs.copyFileSync(filePath, path.join(outFamilyDir, file));
      }
    }
  }
}

module.exports = { generateFonts };
