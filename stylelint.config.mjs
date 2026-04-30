export default {
  extends: ['stylelint-config-standard-scss', 'stylelint-config-recess-order'],
  customSyntax: 'postcss-scss',
  rules: {
    /*
     * These stylelint-scss rules are not currently compatible with Bun due to
     * CommonJS default import issues in postcss-media-query-parser.
     * This should not be an issue since we have Prettier for code formatting.
     */
    'scss/operator-no-newline-after': null,
    'scss/operator-no-newline-before': null,
    'scss/operator-no-unspaced': null,
    'declaration-block-no-duplicate-properties': [
      true,
      {
        ignore: ['consecutive-duplicates-with-same-prefixless-values'],
      },
    ],
    'property-no-deprecated': [
      true,
      {
        ignoreProperties: ['clip'],
      },
    ],
    'property-no-vendor-prefix': [
      true,
      {
        ignoreProperties: [
          '-webkit-break-after',
          '-webkit-font-smoothing',
          '-webkit-user-select',
          '-webkit-mask-image',
          '-webkit-mask-position',
          '-webkit-mask-repeat',
          '-webkit-mask-size',
          '-webkit-print-color-adjust',
          '-webkit-text-size-adjust',
        ],
      },
    ],
  },
};
