/* eslint-disable no-underscore-dangle */
import type { App } from 'vue';
import { createApp } from 'vue';
import { defineStore } from 'pinia';
import type {
  globalStore as GlobalStore,
  RegisterGlobalStoreHandler,
  RegisterLoadLanguageAsyncHandler,
  RegisterErrorHandlers,
} from '@dao-style/extend';
import pluginInstall, { loadLanguageAsync, destroyRouter, destroyPinia } from './plugins';
import 'normalize.css/normalize.css';
import AppElement from './App.vue';

interface RenderProps {
  registerLoadLanguageAsyncHandler?: RegisterLoadLanguageAsyncHandler;
  registerGlobalStoreHandler?: RegisterGlobalStoreHandler;
  container?: HTMLElement;
  // 用于 qiankun 从主应用注册错误处理（可选）
  registerErrorHandlers?: RegisterErrorHandlers;
}

let app: App<Element> | undefined;

async function render(props: RenderProps = {}) {
  const {
    container,
    registerGlobalStoreHandler,
    registerLoadLanguageAsyncHandler,
  } = props;

  app = createApp(AppElement);

  app.use(pluginInstall, {
    qiankun: props,
  });

  let globalStore: GlobalStore | undefined;

  if (registerGlobalStoreHandler) {
    globalStore = registerGlobalStoreHandler(app, defineStore);
  }

  if (registerLoadLanguageAsyncHandler) {
    registerLoadLanguageAsyncHandler(loadLanguageAsync);
  }

  await loadLanguageAsync(globalStore?.locale);

  app.mount(container ? container.querySelector('#app') ?? '#app' : '#app');

  return app;
}

// eslint-disable-next-line no-underscore-dangle
if (!window.__POWERED_BY_QIANKUN__) {
  render();
}

export async function bootstrap() {
  console.warn('[vue] vue app bootstrapped');
}
export async function mount(props: QiankunProps = {}) {
  console.warn('[vue] props from main framework', props);
  render(props);
}
export async function unmount() {
  console.warn('[vue] vue app unmounts');
  app?.unmount();
  app = undefined;

  destroyRouter();
  // qiankun 子应用卸载时需隔离 Pinia 状态；
  // 如不需要可移除 destroyPinia()。
  destroyPinia();
}
