<script setup lang="ts">
defineProps<{ label: string; actionId?: string }>();
const emit = defineEmits<{(e: 'add'): void }>();
</script>

<template>
  <button
    type="button"
    class="api-add-link"
    :data-testid="actionId"
    @click="emit('add')"
  >
    <i
      class="icon-add"
      aria-hidden="true"
    />
    {{ label }}
  </button>
</template>

<style lang="scss">
.api-add-link {
  display: inline-flex;
  gap: 4px;
  align-items: center;
  padding: 0;
  font-size: 13px;
  line-height: 20px;
  color: var(--dao-primary-blue-040);
  cursor: pointer;
  background: none;
  border: 0;

  &:hover {
    color: var(--dao-primary-blue-030);
  }
}

.api-remove-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 30px;
  padding: 0;
  font-size: 14px;
  color: var(--dao-gray-blue-030);
  cursor: pointer;
  background: none;
  border: 0;

  &:hover {
    color: var(--dao-gray-030);
  }
}
</style>
