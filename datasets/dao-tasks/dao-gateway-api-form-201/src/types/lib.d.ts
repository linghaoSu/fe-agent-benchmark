import type { dayjs } from '@/plugins/dayjs';

declare module 'vue' {
  interface ComponentCustomProperties {
    $dayjs: typeof dayjs;
  }
}
declare module 'vue-router' {
  interface RouterHistory {
    pauseListeners?: () => void
  }
}

export {};
