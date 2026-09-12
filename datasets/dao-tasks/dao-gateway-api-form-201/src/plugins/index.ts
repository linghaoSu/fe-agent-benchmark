import type { App } from 'vue';
import routerInstall, { destroyRouter } from '@/router';
import qiankunInstall from './qiankun';
import i18nInstall, { loadLocaleMessages, i18n, loadLanguageAsync } from './vue-i18n';
import piniaInstall, { destroyPinia } from './pinia';
import daoStyleInstall, { registerAllValidations } from './dao-style';
import dayjsInstall from './dayjs';

export default function install<T>(app: App<T>, props: Record<string, unknown>) {
  app.use(i18nInstall);
  app.use(piniaInstall);
  app.use(daoStyleInstall);
  app.use(routerInstall, props?.qiankun as QiankunProps);
  app.use(qiankunInstall, props?.qiankun as QiankunProps);
  app.use(dayjsInstall);

  registerAllValidations(i18n);
}

export {
  destroyRouter, destroyPinia, loadLocaleMessages, loadLanguageAsync,
};
