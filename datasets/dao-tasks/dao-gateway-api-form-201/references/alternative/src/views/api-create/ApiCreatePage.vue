<script setup lang="ts">
import { DaoButton } from '@dao-style/core';
import { storeToRefs } from 'pinia';
import { useApiDraftStore } from '@/stores/api-draft-store';
import { serializeDraft } from '@/stores/api-draft';
import BasicStep from './steps/BasicStep.vue';
import PolicyStep from './steps/PolicyStep.vue';
import SecurityStep from './steps/SecurityStep.vue';

const STEP_LABELS = ['基本信息', '策略配置(选填)', '安全配置(选填)'];
const store = useApiDraftStore();
const { step, done, draft } = storeToRefs(store);
const json = computed(() => JSON.stringify(serializeDraft(draft.value), null, 2));
const statusOf = (index: number) => {
  if (index < step.value) {
    return 'success';
  }

  return index === step.value ? 'active' : 'inactivated';
};
</script>

<template>
  <div class="alt-page">
    <header class="alt-page__header">
      <a
        class="alt-page__back"
        href="#/apis"
        aria-label="返回 API 列表"
        @click.prevent
      ><i
        class="icon-arrow-back-narrow"
        aria-hidden="true"
      /></a>
      <h1 class="alt-page__title">
        创建云原生网关 API
      </h1>
    </header>

    <main class="alt-page__main">
      <template v-if="!done">
        <!-- 手写的步骤条 -->
        <nav
          class="alt-card alt-card--steps"
          data-testid="step-indicator"
          aria-label="创建步骤"
        >
          <ol class="alt-steps">
            <li
              v-for="(label, index) in STEP_LABELS"
              :key="label"
              class="alt-steps__item"
              :class="`alt-steps__item--${statusOf(index)}`"
              :aria-current="index === step ? 'step' : undefined"
            >
              <span class="alt-steps__dot">
                <i
                  v-if="statusOf(index) === 'success'"
                  class="icon-checked"
                  aria-hidden="true"
                />
                <template v-else>{{ index + 1 }}</template>
              </span>
              <span class="alt-steps__label">{{ label }}</span>
            </li>
          </ol>
        </nav>

        <div class="alt-card">
          <p
            v-if="store.errorCount"
            class="alt-sr-only"
            role="status"
          >
            表单存在 {{ store.errorCount }} 处错误
          </p>
          <basic-step v-if="step === 0" />
          <policy-step v-else-if="step === 1" />
          <security-step v-else />
        </div>
      </template>

      <section
        v-else
        class="alt-card alt-result"
        data-testid="create-result"
        aria-labelledby="alt-result-title"
      >
        <h2
          id="alt-result-title"
          class="alt-result__title"
        >
          <i
            class="icon-sys-success"
            aria-hidden="true"
          /> API「{{ draft.name }}」已创建
        </h2>
        <p class="alt-result__hint">
          以下为提交的配置：
        </p>
        <pre
          class="alt-result__json"
          data-testid="create-result-json"
          tabindex="0"
          aria-label="提交的 JSON 配置"
        >{{ json }}</pre>
        <dao-button
          type="ghost"
          data-testid="btn-create-another"
          @click="store.restart()"
        >
          继续创建
        </dao-button>
      </section>
    </main>

    <footer
      v-if="!done"
      class="alt-page__footer"
    >
      <dao-button
        type="ghost"
        data-testid="btn-cancel"
        @click="store.restart()"
      >
        取消
      </dao-button>
      <dao-button
        v-if="step > 0"
        type="secondary"
        data-testid="btn-prev"
        @click="store.goPrev()"
      >
        上一步
      </dao-button>
      <dao-button
        v-if="step < STEP_LABELS.length - 1"
        data-testid="btn-next"
        @click="store.goNext()"
      >
        下一步
      </dao-button>
      <dao-button
        v-else
        data-testid="btn-submit"
        @click="store.confirm()"
      >
        确定
      </dao-button>
    </footer>
  </div>
</template>

<style lang="scss">
@use './alt.scss';
</style>
