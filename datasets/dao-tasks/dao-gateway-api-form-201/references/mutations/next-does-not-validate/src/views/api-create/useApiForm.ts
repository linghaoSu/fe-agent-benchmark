import type { InjectionKey, Ref } from 'vue';
import {
  inject, provide, reactive, ref, computed,
} from 'vue';
import type { ApiForm } from './model';
import { createForm } from './model';
import type { Errors } from './validation';
import { STEP_VALIDATORS, validateAll } from './validation';

export const STEPS = [
  {
    id: 'basic',
    label: '基本信息',
  },
  {
    id: 'policy',
    label: '策略配置(选填)',
  },
  {
    id: 'security',
    label: '安全配置(选填)',
  },
];

export interface ApiFormStore {
  form: ApiForm;
  errors: Ref<Errors>;
  step: Ref<number>;
  submitted: Ref<boolean>;
  validateStep(index: number): boolean;
  validateAllSteps(): boolean;
  next(): void;
  prev(): void;
  submit(): void;
  reset(): void;
  errorOf(key: string): string | undefined;
}

const key: InjectionKey<ApiFormStore> = Symbol('api-form');

export function provideApiForm(): ApiFormStore {
  const form = reactive(createForm()) as ApiForm;
  const errors = ref<Errors>({});
  const step = ref(0);
  const submitted = ref(false);

  const validateStep = (index: number) => {
    errors.value = STEP_VALIDATORS[index]?.(form) ?? {};

    return Object.keys(errors.value).length === 0;
  };
  const validateAllSteps = () => {
    errors.value = validateAll(form);

    return Object.keys(errors.value).length === 0;
  };

  const store: ApiFormStore = {
    form,
    errors,
    step,
    submitted,
    validateStep,
    validateAllSteps,
    next() {
      validateStep(step.value);
      if (step.value < STEPS.length - 1) {
        step.value += 1;
      }
    },
    prev() {
      // 回退不校验，保留全部已填内容。
      errors.value = {};
      if (step.value > 0) {
        step.value -= 1;
      }
    },
    submit() {
      if (!validateAllSteps()) {
        // 跳回第一个仍有错误的步骤，方便用户修正。
        const failing = STEP_VALIDATORS.findIndex((validator) => Object.keys(validator(form)).length > 0);

        step.value = failing === -1 ? step.value : failing;

        return;
      }
      submitted.value = true;
    },
    reset() {
      Object.assign(form, createForm());
      errors.value = {};
      step.value = 0;
      submitted.value = false;
    },
    errorOf: (name: string) => errors.value[name],
  };

  provide(key, store);

  return store;
}

export function useApiForm(): ApiFormStore {
  const store = inject(key);

  if (!store) {
    throw new Error('useApiForm must be used inside provideApiForm');
  }

  return store;
}

export const useErrorCount = (store: ApiFormStore) => computed(() => Object.keys(store.errors.value).length);
