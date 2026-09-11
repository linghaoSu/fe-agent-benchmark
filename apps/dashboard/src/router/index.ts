import {
  createRouter, createWebHistory, type Router, type RouterHistory,
} from 'vue-router';
import type { App } from 'vue';

const routes = [
  {
    path: '/',
    redirect: '/runs',
  },
  {
    path: '/runs',
    name: 'RunList',
    component: () => import('../views/RunListView.vue'),
  },
  {
    path: '/runs/:runId',
    name: 'RunDetail',
    component: () => import('../views/RunDetailView.vue'),
    props: true,
  },
  {
    path: '/compare',
    name: 'Compare',
    component: () => import('../views/CompareView.vue'),
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
