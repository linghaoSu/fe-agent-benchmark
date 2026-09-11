module.exports = {
  root: true,
  env: {
    es6: true,
    node: true,
    jest: true,
    browser: true,
  },
  parser: 'vue-eslint-parser',
  parserOptions: {
    ecmaVersion: 2020,
    parser: '@typescript-eslint/parser',
    sourceType: 'module',
    extraFileExtensions: ['.vue'],
  },
  plugins: ['vue', '@typescript-eslint'],
  extends: [
    'eslint:recommended',
    '@vue/eslint-config-typescript',
    'airbnb-base',
    'plugin:@typescript-eslint/recommended',
    'plugin:jsonc/recommended-with-json',
    'plugin:vue/vue3-recommended',
    './.eslintrc-auto-import.json',
  ],
  rules: {
    'jsonc/indent': ['error', 2],
    '@typescript-eslint/padding-line-between-statements': [
      'error',
      {
        blankLine: 'always',
        prev: ['interface', 'type'],
        next: '*',
      },
    ],
    'padding-line-between-statements': [
      'error',
      {
        blankLine: 'always',
        prev: ['const', 'let', 'var'],
        next: '*',
      },
      {
        blankLine: 'any',
        prev: ['const', 'let', 'var'],
        next: ['const', 'let', 'var'],
      },
      {
        blankLine: 'always',
        prev: '*',
        next: 'return',
      },
      {
        blankLine: 'always',
        prev: '*',
        next: 'function',
      },
    ],
    'brace-style': ['error', '1tbs', { allowSingleLine: false }],
    'eol-last': ['error', 'always'],
    'comma-spacing': [
      'error',
      {
        before: false,
        after: true,
      },
    ],
    quotes: ['error', 'single'],
    'jsx-quotes': ['error', 'prefer-double'],
    'vue/html-quotes': ['error', 'double', { avoidEscape: true }],
    'max-statements-per-line': ['error', { max: 1 }],
    'vue/multiline-html-element-content-newline': ['error'], // 多行html中的内容是否独占一行
    'vue/singleline-html-element-content-newline': ['error'],
    'vue/max-attributes-per-line': [
      'error',
      {
        singleline: {
          max: 1,
        },
        multiline: {
          max: 1,
        },
      },
    ],
    'array-element-newline': ['error', 'consistent'],
    'array-bracket-newline': ['error', 'consistent'], // []新一行
    'vue/array-bracket-newline': ['error', 'consistent'],
    'comma-dangle': ['error', 'always-multiline'], // 最后一个对象元素加逗号
    'object-property-newline': [
      'error',
      { allowAllPropertiesOnSameLine: false },
    ],
    'vue/object-property-newline': [
      'error',
      { allowAllPropertiesOnSameLine: false },
    ],
    'vue/space-infix-ops': ['error', { int32Hint: true }],
    'no-console': ['warn', { allow: ['warn', 'error'] }],
    'no-debugger': 'warn',
    'import/prefer-default-export': 'off',
    'import/no-extraneous-dependencies': 'off',
    'import/no-unresolved': 'off',
    'import/extensions': ['off'],
    'no-shadow': 'off',
    '@typescript-eslint/no-shadow': 'error',
    curly: 'error', // 强制if括号包裹，无效
    'vuejs-accessibility/form-control-has-label': 'off',
    'vuejs-accessibility/click-events-have-key-events': 'off',
    'vue/multi-word-component-names': 'off',
    'vue/no-mutating-props': 'off',
    'no-unused-vars': 'off',
    '@typescript-eslint/no-unused-vars': 'error',
    'vue/no-unused-vars': [
      'error',
      {
        ignorePattern: '^_',
      },
    ],
    'vue/prefer-import-from-vue': 'off',
    '@typescript-eslint/consistent-type-imports': ['error', {
      prefer: 'type-imports',
      fixStyle: 'separate-type-imports',
    }],
    'vue/block-order': ['error', {
      order: ['script', 'template', 'style'],
    }],
    'max-len': ['error',
      150,
      2,
      {
        ignoreUrls: true,
        ignoreRegExpLiterals: true,
        ignoreStrings: true,
        ignoreTemplateLiterals: true,
        ignoreComments: true,
      }],
  },
  overrides: [
    {
      files: ['**/*.vue'],
      rules: {
        'max-len': 'off',
        'vue/max-len': [
          'error',
          {
            code: 150,
            template: 150,
            ignoreComments: true,
            ignoreUrls: true,
            ignoreStrings: true,
            ignoreTemplateLiterals: true,
            ignoreRegExpLiterals: true,
          },
        ],
      },
    },
    {
      files: [
        '**/__tests__/*.{j,t}s?(x)',
        '**/tests/unit/**/*.spec.{j,t}s?(x)',
      ],
      env: {
        jest: true,
      },
    },
    {
      files: [
        '**/__tests__/*.{j,t}s?(x)',
        '**/tests/unit/**/*.spec.{j,t}s?(x)',
      ],
      env: {
        jest: true,
      },
    },
    {
      files: ['*.json', '*.json5', '*.jsonc'],
      parser: 'jsonc-eslint-parser',
    },
    {
      files: ['package.json'],
      parser: 'jsonc-eslint-parser',
      rules: {
        'jsonc/sort-keys': [
          'error',
          {
            pathPattern: '^(?:devDependencies|dependencies|peerDependencies)$',
            order: { type: 'asc' },
          },
        ],
      },
    },
  ],
  globals: {
    defineProps: true,
    defineEmits: true,
    defineExpose: true,
    Mutable: true,
    __webpack_public_path__: true,
    PropType: true,
  },
  ignorePatterns: ['auto-imports.d.ts', 'dist/', 'node_modules/'],
};
