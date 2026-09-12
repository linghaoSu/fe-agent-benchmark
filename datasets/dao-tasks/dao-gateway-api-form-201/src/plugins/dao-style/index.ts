/* eslint-disable @typescript-eslint/no-explicit-any */
import type { App } from 'vue';

import daoStyle from '@dao-style/core';
import '@dao-style/core/dist/style.css';

import {
  installer,
  createGlobalLoading,
  createLoading,
  createNoty,
  setNotyDefault,
  vLoading,
  useUserStorage,
} from '@dao-style/extend';

const components = {
};

export const noty = createNoty();

export const useLoading = createLoading();
export const useGlobalLoading = createGlobalLoading();

const PRODUCT_ID = 'gateway-api';

export { registerAllValidations } from '@dao-style/extend';

export const productStorage = useUserStorage(PRODUCT_ID, {
});

export const globalStorage = useUserStorage('global', {
});

setNotyDefault({
  showClose: true,
});

const installDaoStyle = (Vue: App): void => {
  Vue.use(daoStyle);
  Vue.use(installer(components));
  noty.install(Vue);
  useLoading.install(Vue);
  useGlobalLoading.install(Vue);
  Vue.directive('loading', vLoading);
};

export default installDaoStyle;
