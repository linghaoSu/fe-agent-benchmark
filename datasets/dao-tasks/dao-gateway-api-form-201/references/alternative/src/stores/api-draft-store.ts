import { defineStore } from 'pinia';
import type { ApiDraft, RouteDraft, ServiceDraft } from './api-draft';
import { emptyDraft, emptyRoute, emptyService } from './api-draft';
import { stepSchemas, toErrorMap } from './api-schema';

export type ErrorMap = Record<string, string>;

/** 创建 API 表单的 Pinia store：草稿数据、当前步骤、错误映射与步骤流转。 */
export const useApiDraftStore = defineStore('api-draft', {
  state: () => ({
    draft: emptyDraft() as ApiDraft,
    step: 0,
    errors: {} as ErrorMap,
    done: false,
  }),
  getters: {
    hasBackendRoute: (state) => state.draft.routes.some((route) => route.target === 'service'),
    errorCount: (state) => Object.keys(state.errors).length,
  },
  actions: {
    error(path: string) {
      return this.errors[path];
    },
    validate(step: number) {
      try {
        stepSchemas[step].validateSync(this.draft, { abortEarly: false });
        this.errors = {};

        return true;
      } catch (error) {
        this.errors = toErrorMap(error);

        return false;
      }
    },
    validateEverything() {
      const failing = stepSchemas.findIndex((schema) => {
        try {
          schema.validateSync(this.draft, { abortEarly: false });

          return false;
        } catch {
          return true;
        }
      });

      if (failing === -1) {
        this.errors = {};

        return true;
      }
      this.step = failing;
      this.validate(failing);

      return false;
    },
    goNext() {
      if (this.validate(this.step) && this.step < stepSchemas.length - 1) {
        this.step += 1;
      }
    },
    goPrev() {
      this.errors = {};
      this.step = Math.max(0, this.step - 1);
    },
    confirm() {
      if (this.validateEverything()) {
        this.done = true;
      }
    },
    restart() {
      this.$reset();
    },
    addRoute() {
      this.draft.routes.push(emptyRoute());
    },
    removeRoute(index: number) {
      if (this.draft.routes.length > 1) {
        this.draft.routes.splice(index, 1);
      }
    },
    addService(route: RouteDraft) {
      route.services.push(emptyService());
    },
    removeService(route: RouteDraft, index: number) {
      if (route.services.length > 1) {
        route.services.splice(index, 1);
      }
    },
    setAutoWeight(route: RouteDraft, on: boolean) {
      const index = this.draft.routes.indexOf(route);
      const services = on ? route.services.map((service): ServiceDraft => ({
        ...service,
        weight: null,
      })) : route.services;

      this.draft.routes.splice(index, 1, {
        ...route,
        autoWeight: on,
        services,
      });
    },
  },
});
