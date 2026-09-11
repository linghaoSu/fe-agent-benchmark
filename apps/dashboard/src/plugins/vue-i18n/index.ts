import type { App } from 'vue';
import type { LocaleMessages, VueMessageType } from 'vue-i18n';
import { createI18n } from 'vue-i18n';
import { set } from 'lodash-es';
import { loadExternalLanguage, setI18nLanguageExternal } from './external';

function getFileName(fileName: string) {
  let rst = fileName;

  if (fileName.includes('.')) {
    [rst] = fileName.split('.');
  }

  return rst;
}

/**
 * Load locale messages
 *
 * The loaded `JSON` locale messages is pre-compiled by `@intlify/vue-i18n-loader`,
 * which is integrated into `vue-cli-plugin-i18n`.
 * See: https://github.com/intlify/vue-i18n-loader#rocket-i18n-resource-pre-compilation
 */
export function loadLocaleMessages(
  locales: Rspack.Context,
): LocaleMessages<VueMessageType> {
  const messages: LocaleMessages<VueMessageType> = {};

  locales.keys().forEach((key) => {
    const matched = key.substring(2).split('/');
    let rst = locales(key);

    if (
      rst && typeof rst === 'object' && 'default' in rst
      && rst.default && typeof rst.default === 'object'
    ) {
      rst = rst.default;
    }

    if (matched.length) {
      const fileName = matched.pop() as string;
      const fileKey = getFileName(fileName);

      set(messages, [...matched, fileKey], rst as VueMessageType);
    }
  });

  return messages;
}

const loadedLanguages: string[] = [];

// 自动从 src/locales/ 目录结构中读取支持的语言列表
// 新增语言只需在 src/locales/ 下创建对应目录（如 ja-JP/lang.ts）
const localesContext = require.context('../../locales', true, /\/lang\.ts$/);
const SUPPORTED_LOCALES = localesContext.keys().map((key: string) => key.split('/')[1]);

const RAW_FALLBACK_LOCALE = process.env.VUE_APP_I18N_FALLBACK_LOCALE || 'en-US';
const FALLBACK_LOCALE = SUPPORTED_LOCALES.includes(RAW_FALLBACK_LOCALE)
  ? RAW_FALLBACK_LOCALE
  : (SUPPORTED_LOCALES[0] || 'en-US');

const generateI18n = () => createI18n({
  legacy: false,
  globalInjection: true,
  locale: process.env.VUE_APP_I18N_LOCALE || 'en-US',
  fallbackLocale: FALLBACK_LOCALE,
});

type I18nPlugin = ReturnType<typeof generateI18n>;

let i18nPlugin: I18nPlugin | undefined;

export default function i18nInstall(app: App) {
  const lastMessage = i18nPlugin?.global.messages.value;

  i18nPlugin = generateI18n();
  app.use(i18nPlugin);

  if (lastMessage) {
    Object.entries(lastMessage).forEach(([key, value]) => {
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      i18nPlugin?.global.setLocaleMessage(key, value);
    });
  }
}

// 这样可以确保总是获取最新重新创建的实例
// Proxy 会动态代理到 i18nPlugin.global，类型为 Composer
export const i18n = new Proxy({} as I18nPlugin['global'], {
  get(_, prop: string | symbol) {
    const globalInstance = i18nPlugin?.global;

    if (globalInstance && prop in globalInstance) {
      const value = Reflect.get(globalInstance, prop);

      // 如果是函数，绑定正确的 this 上下文
      if (typeof value === 'function') {
        return value.bind(globalInstance);
      }

      return value;
    }

    return undefined;
  },
});

function resolveLocale(lang: string): string {
  // 精确匹配（如 'zh-CN' -> 'zh-CN'）
  if (SUPPORTED_LOCALES.includes(lang)) {
    return lang;
  }

  // 前缀匹配（如 'zh-TW' -> 'zh-CN'、'en-GB' -> 'en-US'）
  const prefix = lang.split('-')[0].toLowerCase();

  // 如果前缀匹配成功，说明存在通用语言（如 'zh'、'en'），直接返回第一个匹配的完整语言
  if (SUPPORTED_LOCALES.includes(prefix)) {
    return prefix;
  }

  const match = SUPPORTED_LOCALES.find(
    (locale) => locale.split('-')[0].toLowerCase() === prefix,
  );

  return match || FALLBACK_LOCALE;
}

async function setI18nLanguage(lang: string) {
  if (i18nPlugin) {
    i18nPlugin.global.locale.value = lang;
  }

  await setI18nLanguageExternal(lang);

  return lang;
}

async function loadLocale(language: string) {
  if (loadedLanguages.includes(language)) {
    return;
  }

  const messages = await import(
    /* webpackChunkName: "lang-[request]" */ `../../locales/${language}/lang.ts`
  );

  i18nPlugin?.global.setLocaleMessage(language, messages.default);

  const externalLang = await loadExternalLanguage(language);

  externalLang.forEach((l) => {
    i18nPlugin?.global.mergeLocaleMessage(language, l);
  });

  loadedLanguages.push(language);
}

// 不给默认值避免系统初始化无法加载浏览器默认语言
export async function loadLanguageAsync(lang?: string) {
  const language = resolveLocale(lang || window.navigator.language);

  // 确保 fallback 语言已加载，否则缺失的 key 无法回退
  const localesToLoad = [...new Set([FALLBACK_LOCALE, language])];

  await Promise.all(localesToLoad.map(loadLocale));

  return setI18nLanguage(language);
}
