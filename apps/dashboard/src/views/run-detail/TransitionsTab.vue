<script setup lang="ts">
import { asRows, type RunDetail, type Transition } from '@/api/types';
import StatusTag from '@/components/StatusTag.vue';
import { formatTime, shortId, statusTone } from '@/utils/format';

const props = defineProps<{ detail: RunDetail }>();

const transitionColumns = computed(() => [
  {
    id: 'seq',
    header: 'seq',
    defaultWidth: '60px',
  },
  {
    id: 'fromState',
    header: '从',
    defaultWidth: '180px',
  },
  {
    id: 'toState',
    header: '到',
    defaultWidth: '180px',
  },
  {
    id: 'reason',
    header: '原因',
  },
  {
    id: 'at',
    header: '时间',
    defaultWidth: '170px',
  },
]);

const attemptColumns = computed(() => [
  {
    id: 'ordinal',
    header: '#',
    defaultWidth: '50px',
  },
  {
    id: 'attemptId',
    header: 'attemptId',
    defaultWidth: '120px',
  },
  {
    id: 'seed',
    header: 'seed',
    defaultWidth: '60px',
  },
  {
    id: 'lifecycleStatus',
    header: '生命周期',
    defaultWidth: '130px',
  },
  {
    id: 'agentOutcome',
    header: 'agent 结果',
    defaultWidth: '130px',
  },
  {
    id: 'executionClassification',
    header: '执行分类',
    defaultWidth: '150px',
  },
  {
    id: 'failureCode',
    header: '失败码',
  },
  {
    id: 'createdAt',
    header: '创建',
    defaultWidth: '170px',
  },
  {
    id: 'finishedAt',
    header: '完成',
    defaultWidth: '170px',
  },
]);

const attemptGroups = computed(() => props.detail.attempts.map((attempt) => ({
  attempt,
  transitions: props.detail.attemptTransitions.filter((t: Transition) => t.attemptId === attempt.attemptId),
})));
</script>

<template>
  <div class="transitions">
    <h3 class="transitions__title">
      Run 状态迁移
    </h3>
    <dao-table
      id="run-transitions-table"
      :columns="transitionColumns"
      :data="asRows(detail.transitions)"
      hide-toolbar
      hide-setting
      :page-layout="[]"
      empty-text="无状态迁移记录"
    >
      <template #td-at="{ row }">
        {{ formatTime(row.at as string) }}
      </template>
      <template #td-reason="{ row }">
        {{ row.reason ?? '—' }}
      </template>
    </dao-table>

    <h3 class="transitions__title">
      Attempts
    </h3>
    <dao-table
      id="attempts-table"
      :columns="attemptColumns"
      :data="asRows(detail.attempts)"
      hide-toolbar
      hide-setting
      :page-layout="[]"
      empty-text="无 attempt"
    >
      <template #td-attemptId="{ row }">
        <span class="transitions__mono">{{ shortId(row.attemptId as string) }}</span>
      </template>
      <template #td-lifecycleStatus="{ row }">
        <status-tag :tone="statusTone(row.lifecycleStatus as string)">
          {{ row.lifecycleStatus }}
        </status-tag>
      </template>
      <template #td-agentOutcome="{ row }">
        {{ row.agentOutcome ?? '—' }}
      </template>
      <template #td-executionClassification="{ row }">
        {{ row.executionClassification ?? '—' }}
      </template>
      <template #td-failureCode="{ row }">
        {{ row.failureCode ?? '—' }}
      </template>
      <template #td-createdAt="{ row }">
        {{ formatTime(row.createdAt as string) }}
      </template>
      <template #td-finishedAt="{ row }">
        {{ formatTime(row.finishedAt as string | null) }}
      </template>
    </dao-table>

    <template
      v-for="group in attemptGroups"
      :key="group.attempt.attemptId"
    >
      <h3 class="transitions__title">
        Attempt #{{ group.attempt.ordinal }} 状态迁移
        <span class="transitions__mono transitions__sub">{{ group.attempt.attemptId }}</span>
      </h3>
      <dao-table
        :id="`attempt-transitions-${group.attempt.attemptId}`"
        :columns="transitionColumns"
        :data="asRows(group.transitions)"
        hide-toolbar
        hide-setting
        :page-layout="[]"
        empty-text="无状态迁移记录"
      >
        <template #td-at="{ row }">
          {{ formatTime(row.at as string) }}
        </template>
        <template #td-reason="{ row }">
          {{ row.reason ?? '—' }}
        </template>
      </dao-table>
    </template>
  </div>
</template>

<style lang="scss" scoped>
.transitions {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding-top: 16px;

  &__title {
    display: flex;
    gap: 12px;
    align-items: baseline;
    margin: 8px 0 0;
    font-size: 14px;
    font-weight: 600;
  }

  &__sub {
    font-weight: 400;
    color: var(--dao-text-secondary);
  }

  &__mono {
    font-family: Menlo, Monaco, Consolas, monospace;
    font-size: 12px;
  }
}
</style>
