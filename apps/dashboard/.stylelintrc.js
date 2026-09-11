module.exports = {
  extends: [
    'stylelint-config-recess-order',
    'stylelint-config-sass-guidelines',
    'stylelint-config-recommended-vue',
  ],
  rules: {
    'max-nesting-depth': [
      6,
      {
        ignore: ['pseudo-classes'],
      },
    ],
    'order/properties-alphabetical-order': null,
    'selector-class-pattern': '^[a-z0-9\\-\\_]+$',
    'scss/at-import-partial-extension-disallowed-list': ['.scss'],
    'selector-max-compound-selectors': 5,
    'at-rule-no-unknown': [
      true,
      {
        ignoreAtRules: ['mixin', 'include', 'tailwind', 'use'],
      },
    ],
    'selector-max-id': 10,
    'declaration-property-value-no-unknown': null,
  },
};
