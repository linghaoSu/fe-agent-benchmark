import DaoStyleCore from '@dao-style/core';
import { importWithLocaleFallback } from './locale-utils';

import { loadDayjsLanguageAsync } from '../dayjs';

export async function loadExternalLanguage(lang: string) {
  const { module: extendModule } = await importWithLocaleFallback(
    lang,
    (l) => import(
      /* webpackChunkName: "extend-lang-[request]" */
      `@dao-style/extend/dist/locales/${l}.js`
    ),
    { fallback: 'en-US' },
  );
  const daoStyleExtend = (extendModule as { default: unknown })?.default;

  const daoStyleCore = DaoStyleCore.locale(lang);

  return [
    daoStyleCore,
    daoStyleExtend,
  ].filter(Boolean);
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function setI18nLanguageExternal(lang: string) {
  // dayjs 修改为了异步加载语言包，因此在设置 i18n 语言时也需要等待 dayjs 语言包加载完成，确保日期时间格式正确
  await loadDayjsLanguageAsync(lang);
}
