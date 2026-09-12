<script lang="ts">
// alternative 实现：原生 checkbox 驱动的开关，复用 dao-switch 视觉；透传属性（如 data-testid）落在 <input> 上。
export default { inheritAttrs: false };
</script>

<script setup lang="ts">
const props = withDefaults(defineProps<{ modelValue: boolean; label: string; disabled?: boolean; id?: string }>(), {
  disabled: false,
  id: undefined,
});
const emit = defineEmits<{(e: 'update:modelValue', value: boolean): void }>();
const onChange = (event: Event) => emit('update:modelValue', (event.target as HTMLInputElement).checked);
</script>

<template>
  <label
    class="dao-switch alt-toggle"
    style="position: relative"
    :class="{ 'dao-switch--disabled': props.disabled }"
  >
    <input
      v-bind="$attrs"
      :id="props.id"
      class="alt-toggle__input"
      type="checkbox"
      role="switch"
      :aria-checked="props.modelValue ? 'true' : 'false'"
      :aria-label="props.label"
      :checked="props.modelValue"
      :disabled="props.disabled"
      @change="onChange"
    >
    <span
      class="dao-switch__pill"
      :class="{ 'dao-switch-checked': props.modelValue }"
      aria-hidden="true"
    />
    <span class="dao-switch__label">{{ props.modelValue ? '启用' : '不启用' }}</span>
  </label>
</template>

<style lang="scss">
.alt-toggle {
  cursor: pointer;

  &__input {
    position: absolute;
    z-index: 1;
    width: 40px;
    height: 24px;
    margin: 0;
    cursor: pointer;
    opacity: 0;
  }

  &__input:focus-visible + .dao-switch__pill {
    outline: 2px solid var(--dao-primary-blue-040);
    outline-offset: 2px;
  }
}
</style>
