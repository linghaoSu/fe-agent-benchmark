<script setup lang="ts">
import type { TagTone } from '@/utils/format';

const props = withDefaults(defineProps<{
  tone?: TagTone;
  size?: 'sm' | 'md';
}>(), {
  tone: 'neutral',
  size: 'md',
});

const toneClass = computed(() => `status-tag--${props.tone}`);
</script>

<template>
  <dao-tag
    class="status-tag"
    :class="toneClass"
    :size="size"
  >
    <slot />
  </dao-tag>
</template>

<style lang="scss" scoped>
.status-tag {
  white-space: nowrap;

  &--success {
    color: rgb(var(--dao-tag-health-rgb));
    background-color: rgb(var(--dao-tag-bg-health-rgb));
    border-color: rgba(var(--dao-tag-health-rgb), 0.4);
  }

  &--error {
    color: rgb(var(--dao-tag-error-rgb));
    background-color: rgb(var(--dao-tag-bg-error-rgb));
    border-color: rgba(var(--dao-tag-error-rgb), 0.4);
  }

  &--warning {
    color: rgb(var(--dao-tag-warning-rgb));
    background-color: rgb(var(--dao-tag-bg-warning-rgb));
    border-color: rgba(var(--dao-tag-warning-rgb), 0.4);
  }

  &--info {
    color: rgb(var(--dao-tag-info-rgb));
    background-color: rgb(var(--dao-tag-bg-info-rgb));
    border-color: rgba(var(--dao-tag-info-rgb), 0.4);
  }
}
</style>
