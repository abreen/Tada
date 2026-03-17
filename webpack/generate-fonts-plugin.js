const fs = require('fs');
const path = require('path');
const wawoff2 = require('wawoff2');
const { getPackageDir } = require('./utils/paths');
const { makeLogger } = require('./log');

const log = makeLogger(__filename);
const FONTS_DIR = path.join(getPackageDir(), 'fonts');

class GenerateFontsPlugin {
  _cachedAssets = null;

  apply(compiler) {
    compiler.hooks.thisCompilation.tap('GenerateFontsPlugin', compilation => {
      const { RawSource } =
        compilation.compiler.webpack?.sources || require('webpack-sources');

      compilation.hooks.processAssets.tapPromise(
        {
          name: 'GenerateFontsPlugin',
          stage: compiler.webpack.Compilation.PROCESS_ASSETS_STAGE_ADDITIONAL,
        },
        async () => {
          if (this._cachedAssets) {
            for (const [name, source] of this._cachedAssets) {
              compilation.emitAsset(name, source);
            }
            return;
          }

          this._cachedAssets = new Map();

          for (const family of fs.readdirSync(FONTS_DIR)) {
            const familyDir = path.join(FONTS_DIR, family);
            if (!fs.statSync(familyDir).isDirectory()) {
              continue;
            }

            for (const file of fs.readdirSync(familyDir)) {
              const filePath = path.join(familyDir, file);
              let source;

              if (file.endsWith('.ttf')) {
                const ttfBuf = fs.readFileSync(filePath);
                const woff2Buf = Buffer.from(await wawoff2.compress(ttfBuf));
                const outName = file.replace(/\.ttf$/, '.woff2');
                const assetName = `${family}/${outName}`;

                source = new RawSource(woff2Buf);
                compilation.emitAsset(assetName, source);
                this._cachedAssets.set(assetName, source);
                log.info`Converted ${family}/${file} to ${outName}`;
              } else {
                const assetName = `${family}/${file}`;
                source = new RawSource(fs.readFileSync(filePath));
                compilation.emitAsset(assetName, source);
                this._cachedAssets.set(assetName, source);
              }
            }
          }
        },
      );
    });
  }
}

module.exports = GenerateFontsPlugin;
