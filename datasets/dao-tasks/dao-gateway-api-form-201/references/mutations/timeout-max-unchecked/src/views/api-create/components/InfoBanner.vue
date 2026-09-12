<script setup lang="ts">
withDefaults(defineProps<{ type?: 'info' | 'warning'; muted?: boolean }>(), {
  type: 'info',
  muted: false,
});
</script>

<template>
  <div
    class="api-banner"
    :class="[`api-banner--${type}`, { 'api-banner--muted': muted }]"
    role="note"
  >
    <i
      class="api-banner__icon"
      :class="type === 'warning' ? 'icon-sys-warning' : 'icon-sys-info'"
      aria-hidden="true"
    />
    <span class="api-banner__text"><slot /></span>
  </div>
</template>

<style lang="scss">
.api-banner {
  display: flex;
  gap: 8px;
  align-items: flex-start;
  padding: 10px 12px;
  font-size: 13px;
  line-height: 20px;
  color: var(--dao-gray-010);
  border: 1px solid var(--dao-primary-blue-080);
  border-radius: 4px;
  background: var(--dao-primary-blue-090);

  &__icon {
    flex: none;
    margin-top: 2px;
    font-size: 16px;
    color: var(--dao-primary-blue-040);
  }

  &--warning {
    border-color: var(--dao-yellow-060);
    background: var(--dao-yellow-080);

    .api-banner__icon {
      color: var(--dao-yellow-030);
    }
  }

  &--muted {
    color: var(--dao-gray-blue-030);
    border-color: var(--dao-gray-blue-070);
    background: var(--dao-gray-blue-090);

    .api-banner__icon {
      color: var(--dao-gray-blue-030);
    }
  }
}
</style>
