<script setup lang="ts">
import { DaoButton } from '@dao-style/core';
import { DaoStepper } from '@dao-style/extend';
import { computed } from 'vue';
import { provideApiForm, STEPS } from './useApiForm';
import { buildPayload } from './model';
import StepBasic from './components/StepBasic.vue';
import StepPolicy from './components/StepPolicy.vue';
import StepSecurity from './components/StepSecurity.vue';

const store = provideApiForm();
const { step, submitted } = store;
const stepComponents = [StepBasic, StepPolicy, StepSecurity];
const isLast = computed(() => step.value === STEPS.length - 1);
const payloadJson = computed(() => JSON.stringify(buildPayload(store.form), null, 2));
const errorCount = computed(() => Object.keys(store.errors.value).length);
</script>

<template>
  <div class="api-create">
    <header class="api-create__header">
      <a
        class="api-create__back"
        href="#/apis"
        aria-label="返回 API 列表"
        @click.prevent
      >
        <i
          class="icon-arrow-back-narrow"
          aria-hidden="true"
        />
      </a>
      <h1 class="api-create__title">
        创建云原生网关 API
      </h1>
    </header>

    <main class="api-create__main">
      <template v-if="!submitted">
        <div
          class="api-card api-card--steps"
          data-testid="step-indicator"
          aria-label="创建步骤"
          role="navigation"
        >
          <dao-stepper
            :steps="STEPS"
            :active-index="step"
            direction="horizontal"
          />
          <p class="sr-only">
            当前第 {{ step + 1 }} 步，共 {{ STEPS.length }} 步：{{ STEPS[step].label }}
          </p>
        </div>

        <div class="api-card api-card--body">
          <p
            v-if="errorCount"
            class="sr-only"
            role="status"
          >
            表单存在 {{ errorCount }} 处错误，请修正后继续
          </p>
          <keep-alive>
            <component :is="stepComponents[step]" />
          </keep-alive>
        </div>
      </template>

      <section
        v-else
        class="api-card api-card--body api-result"
        data-testid="create-result"
        aria-labelledby="result-title"
      >
        <h2
          id="result-title"
          class="api-result__title"
        >
          <i
            class="icon-sys-success"
            aria-hidden="true"
          />
          API「{{ store.form.name }}」已创建
        </h2>
        <p class="api-result__hint">
          以下为提交的配置：
        </p>
        <pre
          class="api-result__json"
          data-testid="create-result-json"
          tabindex="0"
          aria-label="提交的 JSON 配置"
        >{{ payloadJson }}</pre>
        <div class="api-result__actions">
          <dao-button
            type="ghost"
            data-testid="btn-create-another"
            @click="store.reset()"
          >
            继续创建
          </dao-button>
        </div>
      </section>
    </main>

    <footer
      v-if="!submitted"
      class="api-create__footer"
    >
      <dao-button
        type="ghost"
        data-testid="btn-cancel"
        @click="store.reset()"
      >
        取消
      </dao-button>
      <dao-button
        v-if="step > 0"
        type="secondary"
        data-testid="btn-prev"
        @click="store.prev()"
      >
        上一步
      </dao-button>
      <dao-button
        v-if="!isLast"
        type="primary"
        data-testid="btn-next"
        @click="store.next()"
      >
        下一步
      </dao-button>
      <dao-button
        v-else
        type="primary"
        data-testid="btn-submit"
        @click="store.submit()"
      >
        确定
      </dao-button>
    </footer>
  </div>
</template>

<style lang="scss">
@use './styles/api-create.scss';
</style>
