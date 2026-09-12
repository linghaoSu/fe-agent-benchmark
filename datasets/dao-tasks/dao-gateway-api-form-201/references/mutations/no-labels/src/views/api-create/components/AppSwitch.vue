<script setup lang="ts">
// 可访问的开关：真实 <button role="switch">，沿用 dao-switch 的视觉样式。
withDefaults(defineProps<{
  modelValue: boolean;
  label: string;
  disabled?: boolean;
  textOn?: string;
  textOff?: string;
}>(), {
  disabled: false,
  textOn: '启用',
  textOff: '不启用',
});
const emit = defineEmits<{(e: 'update:modelValue', value: boolean): void }>();
</script>

<template>
  <button
    type="button"
    role="switch"
    class="dao-switch app-switch"
    :class="{ 'dao-switch--disabled': disabled }"
    :aria-checked="modelValue ? 'true' : 'false'"
    :aria-label="label"
    :disabled="disabled"
    @click="emit('update:modelValue', !modelValue)"
  >
    <span
      class="dao-switch__pill"
      :class="{ 'dao-switch-checked': modelValue }"
    />
    <span class="dao-switch__label">{{ modelValue ? textOn : textOff }}</span>
  </button>
</template>

<style lang="scss">
.app-switch {
  padding: 0;
  cursor: pointer;
  background: none;
  border: 0;

  &:focus-visible {
    outline: 2px solid var(--dao-primary-blue-040);
    outline-offset: 2px;
    border-radius: 12px;
  }

  &:disabled {
    cursor: not-allowed;
    opacity: 0.6;
  }
}
</style>
