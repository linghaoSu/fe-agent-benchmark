import type { App } from 'vue';
import { type Pinia, createPinia } from 'pinia';

// 不导出 Pinia 实例，防止被直接使用
let pinia: Pinia | null;

export default function piniaInstall(app: App) {
  if (!pinia) {
    pinia = createPinia();
  }

  app.use(pinia);
}

// 销毁 Pinia 实例，重置为 null
export function destroyPinia() {
  if (pinia) {
    pinia = null;
  }
}
