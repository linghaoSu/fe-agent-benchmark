<script setup lang="ts">
defineProps<{ id: string; message?: string }>();
</script>

<template>
  <p
    v-if="message"
    :id="id"
    :data-testid="`error-${id.replace(/^error-/, '')}`"
    class="dao-form-item__error-message api-field-error"
    role="alert"
  >
    {{ message }}
  </p>
</template>

<style lang="scss">
.api-field-error {
  margin: 4px 0 0;
  font-size: 12px;
  line-height: 18px;
  color: var(--dao-red-030);
}
</style>
