import type { CreateAppFunction } from 'vue';
import './public-path';

export default {
  install<T>(app: ReturnType<CreateAppFunction<T>>, options: QiankunProps) {
    // 注入通讯方式（未确定）
    const { sharedStore } = options;

    sharedStore?.subscribe((mutation, state) => {
      console.warn(mutation);
      console.warn(state);
    });
    // eslint-disable-next-line no-param-reassign
    app.config.globalProperties.$sharedStore = sharedStore;
    // eslint-disable-next-line no-param-reassign
    app.config.globalProperties.$action = {
      onGlobalStateChange: options.onGlobalStateChange,
      setGlobalState: options.setGlobalState,
    };
    //
    options.onGlobalStateChange?.((state, prev) => {
      // state: 变更后的状态; prev 变更前的状态
      console.warn('sub-1 onGlobalStateChange');
      console.warn(state, prev);
    });
  },
};
