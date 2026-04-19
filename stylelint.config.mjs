export default {
  extends: ['stylelint-config-standard-scss', 'stylelint-config-recess-order'],
  customSyntax: 'postcss-scss',
  rules: {
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
