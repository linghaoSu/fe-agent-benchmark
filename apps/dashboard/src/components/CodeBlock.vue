<script setup lang="ts">
withDefaults(defineProps<{
  text: string;
  maxHeight?: string;
}>(), {
  maxHeight: '480px',
});
</script>

<template>
  <pre
    class="code-block"
    :style="{ maxHeight }"
  >{{ text }}</pre>
</template>

<style lang="scss" scoped>
.code-block {
  padding: 12px;
  margin: 0;
  overflow: auto;
  font-family: Menlo, Monaco, Consolas, 'Courier New', monospace;
  font-size: 12px;
  line-height: 1.5;
  color: var(--dao-text-primary);
  word-break: break-all;
  white-space: pre-wrap;
  background-color: var(--dao-bg-secondary);
  border: 1px solid var(--dao-line-divider);
  border-radius: 4px;
}
</style>
