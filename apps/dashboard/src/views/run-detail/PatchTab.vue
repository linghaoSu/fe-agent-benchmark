<script setup lang="ts">
import { api } from '@/api/client';
import { useAsync } from '@/composables/useAsync';
import CodeBlock from '@/components/CodeBlock.vue';

const props = defineProps<{ runId: string }>();

const patch = useAsync(() => api.getArtifactText(props.runId, 'patch.diff'));

watch(() => props.runId, () => patch.run());

const stats = computed(() => {
  const text = patch.data.value ?? '';
  const lines = text.split('\n');

  return {
    files: lines.filter((line) => line.startsWith('diff --git')).length,
    added: lines.filter((line) => line.startsWith('+') && !line.startsWith('+++')).length,
    removed: lines.filter((line) => line.startsWith('-') && !line.startsWith('---')).length,
  };
});
</script>

<template>
  <div class="patch">
    <div
      v-if="patch.loading.value"
      class="patch__muted"
    >
      加载中…
    </div>
    <div
      v-else-if="patch.error.value"
      class="patch__error"
    >
      加载失败：{{ patch.error.value }}
    </div>
    <dao-empty
      v-else-if="patch.data.value === null"
      title="无补丁"
      helper="该 Run 没有生成 patch.diff（可能是未提交或基础设施失败）"
    />
    <dao-empty
      v-else-if="!patch.data.value.trim()"
      title="补丁为空"
      helper="patch.diff 存在但没有任何变更"
    />
    <template v-else>
      <div class="patch__stats">
        <span>{{ stats.files }} 个文件</span>
        <span class="patch__added">+{{ stats.added }}</span>
        <span class="patch__removed">-{{ stats.removed }}</span>
      </div>
      <code-block
        :text="patch.data.value"
        max-height="70vh"
      />
    </template>
  </div>
</template>

<style lang="scss" scoped>
.patch {
  padding-top: 16px;

  &__muted {
    color: var(--dao-text-tertiary);
  }

  &__error {
    padding: 8px 12px;
    color: rgb(var(--dao-tag-error-rgb));
    background-color: rgb(var(--dao-tag-bg-error-rgb));
    border-radius: 4px;
  }

  &__stats {
    display: flex;
    gap: 12px;
    margin-bottom: 8px;
    font-family: Menlo, Monaco, Consolas, monospace;
    font-size: 12px;
    color: var(--dao-text-secondary);
  }

  &__added {
    color: rgb(var(--dao-tag-health-rgb));
  }

  &__removed {
    color: rgb(var(--dao-tag-error-rgb));
  }
}
</style>
