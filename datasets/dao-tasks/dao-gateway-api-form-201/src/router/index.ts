import {
  createRouter, createWebHistory, type Router, type RouterHistory,
} from 'vue-router';
import type { App } from 'vue';
import HomeView from '../views/HomeView.vue';

const routes = [
  {
    path: '/',
    name: 'AppIndex',
    component: HomeView,
  },
];

let router: Router | null = null;
let history: RouterHistory | null = null;

export default (app: App, qiankun: QiankunProps) => {
  window.addEventListener('popstate', (e) => {
    if (!e.isTrusted) {
      history?.pauseListeners?.();
    }
  });

  const basePath = qiankun?.basePath || process.env.VUE_APP_ROUTER_BASE_PATH;

  history = createWebHistory(basePath);
  router = createRouter({
    history,
    routes,
  });
  app.use(router);
};

export const destroyRouter = () => {
  if (history && history.destroy) {
    history.destroy();
  }
  router = null;
};
