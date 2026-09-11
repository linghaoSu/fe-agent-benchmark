<script setup lang="ts">
import { asRows, type ToolCall } from '@/api/types';
import CodeBlock from '@/components/CodeBlock.vue';
import StatusTag from '@/components/StatusTag.vue';
import {
  formatBytes, formatTime, outcomeTone, prettyJson, truncate,
} from '@/utils/format';

defineProps<{ toolCalls: ToolCall[] }>();

const expandedRows = ref<Record<string, unknown>[]>([]);

const columns = computed(() => [
  {
    id: 'seq',
    header: 'seq',
    defaultWidth: '60px',
  },
  {
    id: 'tool',
    header: '工具',
    defaultWidth: '140px',
  },
  {
    id: 'outcomeCode',
    header: '结果',
    defaultWidth: '170px',
  },
  {
    id: 'outputBytes',
    header: '输出',
    defaultWidth: '90px',
  },
  {
    id: 'truncated',
    header: '截断',
    defaultWidth: '70px',
  },
  {
    id: 'argumentsJson',
    header: '参数',
  },
  {
    id: 'acceptedAt',
    header: '时间',
    defaultWidth: '160px',
  },
]);
</script>

<template>
  <div class="tool-calls">
    <dao-table
      id="tool-calls-table"
      v-model:expanded-rows="expandedRows"
      :columns="columns"
      :data="asRows(toolCalls)"
      expandable
      hide-toolbar
      hide-setting
      :page-layout="[]"
      empty-text="无工具调用记录"
    >
      <template #td-outcomeCode="{ row }">
        <status-tag :tone="outcomeTone(row.outcomeCode as string | null)">
          {{ row.outcomeCode ?? row.status ?? '—' }}
        </status-tag>
      </template>
      <template #td-outputBytes="{ row }">
        {{ formatBytes(row.outputBytes as number | null) }}
      </template>
      <template #td-truncated="{ row }">
        <status-tag
          v-if="row.truncated"
          tone="warning"
          size="sm"
        >
          是
        </status-tag>
        <span v-else>否</span>
      </template>
      <template #td-argumentsJson="{ row }">
        <dao-tooltip
          :content="prettyJson(row.argumentsJson)"
          placement="top"
          :disabled="!row.argumentsJson || (row.argumentsJson as string).length <= 120"
        >
          <span class="tool-calls__args">{{ truncate(row.argumentsJson as string | null) || '—' }}</span>
        </dao-tooltip>
      </template>
      <template #td-acceptedAt="{ row }">
        {{ formatTime(row.acceptedAt as string) }}
      </template>
      <template #expand="{ row }">
        <div class="tool-calls__expand">
          <div
            v-if="row.artifactRef"
            class="tool-calls__ref"
          >
            artifactRef: {{ row.artifactRef }}
          </div>
          <code-block
            :text="prettyJson(row.argumentsJson) || '（无参数）'"
            max-height="320px"
          />
        </div>
      </template>
    </dao-table>
  </div>
</template>

<style lang="scss" scoped>
.tool-calls {
  padding-top: 16px;

  &__args {
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
    font-family: Menlo, Monaco, Consolas, monospace;
    font-size: 12px;
    white-space: nowrap;
  }

  &__expand {
    padding: 8px 12px;
  }

  &__ref {
    margin-bottom: 8px;
    font-family: Menlo, Monaco, Consolas, monospace;
    font-size: 12px;
    color: var(--dao-text-secondary);
  }
}
</style>
