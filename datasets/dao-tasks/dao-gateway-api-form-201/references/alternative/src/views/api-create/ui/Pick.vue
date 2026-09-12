<script setup lang="ts">
import { DaoSelect, DaoOption } from '@dao-style/core';
import type { Pair } from '@/stores/api-draft';

// 统一的下拉：接受 [value,label] 对或纯字符串列表。
const props = withDefaults(defineProps<{
  modelValue: string | number | string[];
  options: readonly(Pair | string | number)[];
  label: string;
  multiple?: boolean;
  placeholder?: string;
  status?: 'default' | 'error' | 'success';
  testId?: string;
  invalid?: 'true' | 'false';
  describedBy?: string;
}>(), {
  multiple: false,
  placeholder: '',
  status: 'default',
  testId: undefined,
  invalid: undefined,
  describedBy: undefined,
});
const emit = defineEmits<{(e: 'update:modelValue', value: string | number | string[]): void }>();
const items = computed(() => props.options.map((option) => (Array.isArray(option) ? {
  value: option[0],
  label: option[1],
} : {
  value: option,
  label: String(option),
})));
</script>

<template>
  <div
    class="alt-select"
    :data-testid="props.testId"
    :aria-invalid="props.invalid"
    :aria-describedby="props.describedBy"
  >
    <dao-select
      :model-value="props.modelValue"
      :multiple="props.multiple"
      hide-select-all
      :status="props.status"
      :placeholder="props.placeholder"
      :aria-label="props.label"
      @update:model-value="emit('update:modelValue', $event)"
    >
      <dao-option
        v-for="item in items"
        :key="String(item.value)"
        :value="item.value"
        :label="item.label"
      />
    </dao-select>
  </div>
</template>

<style lang="scss">
.alt-select {
  width: 100%;

  .dao-select,
  .dao-selection {
    width: 100%;
  }
}
</style>
