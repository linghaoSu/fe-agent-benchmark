import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import type { App } from 'vue';
import relativeTime from 'dayjs/plugin/relativeTime';
import { importWithLocaleFallback } from '../vue-i18n/locale-utils';

dayjs.extend(utc);
dayjs.extend(relativeTime);

const dayjsInstall = (Vue: App): void => {
  const app = Vue;

  app.config.globalProperties.$dayjs = dayjs;
};

// 自动将 app locale 映射到 dayjs locale，无需手动维护映射表
// 'zh-CN' -> 先尝试 'zh-cn'，再尝试 'zh'，最终 fallback 到 'en'
export async function loadDayjsLanguageAsync(lang: string) {
  const { locale } = await importWithLocaleFallback(
    lang,
    (l) => import(`dayjs/locale/${l}.js`),
    { lowercase: true },
  );

  dayjs.locale(locale);

  return locale;
}

export { dayjs };
export default dayjsInstall;
