import { defineConfig } from '@rsbuild/core';
import { pluginVue } from '@rsbuild/plugin-vue';
import unpluginPlugin from 'unplugin-auto-import/rspack';
import path from 'path';
import postcssImport from 'postcss-import';
import tailwindcss from 'tailwindcss';
import autoprefixer from 'autoprefixer';
import postcssNested from 'postcss-nested';

import daoStyleUnpluginExtend from '@dao-style/unplugin-extend/rspack';

import groupMapping from '@dao-style/extend/dist/group-mapping.json';

import { pluginSass } from '@rsbuild/plugin-sass';
import { name } from './package.json';

export default defineConfig({
  plugins: [
    pluginSass(),
    pluginVue(),
  ],
  source: {
    // 指定入口文件
    entry: {
      index: './src/main.ts',
    },
    alias: {
      '@': './src',
      vue$: 'vue/dist/vue.esm-bundler.js',
    },
    define: {
      'process.env': JSON.stringify({
        NODE_ENV: process.env.NODE_ENV,
        VUE_APP_PUBLIC_BASE_PATH: process.env.VUE_APP_PUBLIC_BASE_PATH,
        VUE_APP_ROUTER_BASE_PATH: process.env.VUE_APP_ROUTER_BASE_PATH,
        VUE_APP_I18N_LOCALE: process.env.VUE_APP_I18N_LOCALE,
        VUE_APP_I18N_FALLBACK_LOCALE: process.env.VUE_APP_I18N_FALLBACK_LOCALE,
      }),
    },
    include: process.env.NODE_ENV === 'development' ? undefined : [{ not: /[\\/]core-js[\\/]/ }],
  },
  html: {
    // 设置 HTML 根节点的 id 为 'app'
    mountId: 'app',
    title: 'Dashboard',
    template: './public/index.html',
    favicon: './public/favicon.ico',
    tags: [{
      tag: 'base',
      attrs: { href: '/' },
    }],
    templateParameters: {
      titleText: 'Dashboard',
    },
  },
  server: {
    port: 8790,
    headers: {
      'Access-Control-Allow-Origin': '*',
    },
    proxy: {
      '/api': {
        target: process.env.DASHBOARD_API_URL || 'http://localhost:8788',
        changeOrigin: true,
      },
      '/apis': {
        target: process.env.VUE_APP_API_URL || 'http://localhost:8080',
        headers: {
          Authorization: `Bearer ${process.env.VUE_APP_AUTH}`,
        },
        secure: false,
      },
      '/docs': {
        target: process.env.VUE_APP_API_URL || 'http://localhost:8080',
      },
    },
  },
  output: {
    // target 会根据 .browserslistrc 推导
    polyfill: 'usage',
    distPath: {
      css: 'css',
      font: 'fonts',
      js: 'js',
      image: 'img',
      svg: 'img',
    },
    assetPrefix: process.env.VUE_APP_PUBLIC_BASE_PATH,
  },
  tools: {
    postcss(config) {
      if (config.postcssOptions && 'plugins' in config.postcssOptions) {
        config.postcssOptions.plugins?.push(tailwindcss);
        config.postcssOptions.plugins?.push(autoprefixer);

        config.postcssOptions.plugins?.push(postcssImport());
        config.postcssOptions.plugins?.push(postcssNested);
      }
    },
    rspack: {
      output: {
        publicPath: process.env.VUE_APP_PUBLIC_BASE_PATH,
        library: {
          name: `${name}-[name]`,
          type: 'umd',
        },
        chunkLoadingGlobal: `webpackJsonp_${name}`,
      },
      // FIXME monaco editor 的警告, 暂时忽略
      ignoreWarnings: [/be statically extracted/],
      plugins: [
        unpluginPlugin({
          include: [
            /\.[tj]sx?$/, // .ts, .tsx, .js, .jsx
            /\.vue$/,
            /\.vue\?vue/, // .vue
          ],

          // global imports to register
          imports: [
            // presets
            'vue',
            'vue-router',
            'vue-i18n',
            'vee-validate',
          ],
          dts: './src/auto-imports.d.ts',
          eslintrc: {
            enabled: true, // Default `false`
            filepath: './.eslintrc-auto-import.json', // Default `./.eslintrc-auto-import.json`
            // Default `true`, (true | false | 'readonly' | 'readable' | 'writable' | 'writeable')
            globalsPropValue: true,
          },
        }),
        daoStyleUnpluginExtend([
          {
            mapping: groupMapping,
            lib: '@dao-style/extend',
          },
        ]),
      ],
      module: {
        rules: [
          {
            test: /\.(json5?|ya?ml)$/, // target json, json5, yaml and yml files
            type: 'javascript/auto',
            // Use `Rule.include` to specify the files of locale messages to be pre-compiled
            include: [
              path.resolve(__dirname, './src/locales'),
            ],
            use: [
              {
                loader: '@intlify/vue-i18n-loader',
                options: {
                  locale: process.env.VUE_APP_I18N_LOCALE || 'zh-CN',
                  fallbackLocale: process.env.VUE_APP_I18N_FALLBACK_LOCALE || 'en-US',
                  localeDir: 'locales',
                  enableLegacy: false,
                  runtimeOnly: false,
                  compositionOnly: false,
                  fullInstall: false,
                },
              },
            ],
          },

          {
            test: /schema\.json$/,
            type: 'asset/resource',
          },
          {
            test: /\.yaml$/i,
            type: 'asset/source',
          },
          {
            resourceQuery: /raw/,
            type: 'asset/source',
          },
        ],
      },
    },
  },
});
