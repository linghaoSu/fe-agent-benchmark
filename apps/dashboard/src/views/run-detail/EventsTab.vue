<script setup lang="ts">
import { asRows, type RunEvent } from '@/api/types';
import CodeBlock from '@/components/CodeBlock.vue';
import {
  compactJson, formatTime, prettyJson, truncate,
} from '@/utils/format';

defineProps<{ events: RunEvent[] }>();

const expandedRows = ref<Record<string, unknown>[]>([]);

const columns = computed(() => [
  {
    id: 'seq',
    header: 'seq',
    defaultWidth: '60px',
  },
  {
    id: 'timestamp',
    header: '时间',
    defaultWidth: '170px',
  },
  {
    id: 'type',
    header: '类型',
    defaultWidth: '130px',
  },
  {
    id: 'name',
    header: '名称',
    defaultWidth: '200px',
  },
  {
    id: 'data',
    header: 'payload.data',
  },
]);

/** `payload.name` for lifecycle events; tool events carry the tool name instead. */
const nameOf = (event: RunEvent) => event.payload?.name ?? (event.payload?.tool as string | undefined) ?? '—';
const dataOf = (event: RunEvent) => (event.payload?.data !== undefined ? event.payload.data : event.payload);
</script>

<template>
  <div class="events">
    <dao-table
      id="events-table"
      v-model:expanded-rows="expandedRows"
      :columns="columns"
      :data="asRows(events)"
      expandable
      hide-toolbar
      hide-setting
      :page-layout="[]"
      empty-text="无事件记录"
    >
      <template #td-timestamp="{ row }">
        {{ formatTime(row.timestamp as string) }}
      </template>
      <template #td-name="{ row }">
        {{ nameOf(row as unknown as RunEvent) }}
      </template>
      <template #td-data="{ row }">
        <span class="events__data">{{ truncate(compactJson(dataOf(row as unknown as RunEvent)), 160) || '—' }}</span>
      </template>
      <template #expand="{ row }">
        <div class="events__expand">
          <code-block
            :text="prettyJson((row as unknown as RunEvent).payload)"
            max-height="320px"
          />
        </div>
      </template>
    </dao-table>
  </div>
</template>

<style lang="scss" scoped>
.events {
  padding-top: 16px;

  &__data {
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
}
</style>
