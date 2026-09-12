<script setup lang="ts">
import { DaoFormItem } from '@dao-style/core';
import { useApiDraftStore } from '@/stores/api-draft-store';

// 表单项 + 错误提示：错误元素 id 为 `error-<path>`，供子控件通过 aria-describedby 关联。
const props = withDefaults(defineProps<{ label: string; path?: string; required?: boolean; helper?: string; labelWidth?: string }>(), {
  path: undefined,
  required: false,
  helper: undefined,
  labelWidth: undefined,
});
const store = useApiDraftStore();
const message = computed(() => (props.path ? store.errors[props.path] : undefined));
const errorId = computed(() => (props.path ? `error-${props.path}` : undefined));
const status = computed((): 'error' | 'default' => (message.value ? 'error' : 'default'));
const invalid = computed((): 'true' | 'false' => (message.value ? 'true' : 'false'));
</script>

<template>
  <dao-form-item
    :label="props.label"
    :required="props.required"
    :label-width="props.labelWidth"
  >
    <slot
      :invalid="invalid"
      :described-by="message ? errorId : undefined"
      :status="status"
    />
    <p
      v-if="message"
      :id="errorId"
      :data-testid="errorId"
      class="dao-form-item__error-message alt-error"
      role="alert"
    >
      {{ message }}
    </p>
    <template
      v-if="props.helper"
      #helper
    >
      <p class="dao-form-item__helper-text">
        {{ props.helper }}
      </p>
    </template>
  </dao-form-item>
</template>

<style lang="scss">
.alt-error {
  margin: 4px 0 0;
  font-size: 12px;
  line-height: 18px;
  color: var(--dao-red-030);
}
</style>
