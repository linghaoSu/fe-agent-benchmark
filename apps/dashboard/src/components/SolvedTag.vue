<script setup lang="ts">
import StatusTag from '@/components/StatusTag.vue';
import { extensionsOf, failedGate } from '@/utils/format';

const props = defineProps<{
  solved: boolean | null | undefined;
  /** Raw result JSON when available; used to name the failed gate. */
  resultJson?: string;
}>();

const label = computed(() => {
  if (props.solved === true) return 'solved';
  if (props.solved === false) return failedGate(extensionsOf(props.resultJson)) ?? 'unsolved';

  return null;
});
</script>

<template>
  <status-tag
    v-if="label"
    :tone="solved ? 'success' : 'error'"
  >
    {{ label }}
  </status-tag>
  <span
    v-else
    class="text-dao-text-tertiary"
  >—</span>
</template>
