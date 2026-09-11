<script setup lang="ts">
import { asRows, type EvaluatorResult, type RunDetail } from '@/api/types';
import StatusTag from '@/components/StatusTag.vue';
import { formatScore, statusTone } from '@/utils/format';

const props = defineProps<{ detail: RunDetail }>();

const evaluators = computed(() => Object.entries(props.detail.evaluators ?? {})
  .map(([name, result]) => ({
    name,
    ...result,
  }))
  .sort((a, b) => a.name.localeCompare(b.name)));

const evalOf = (row: Record<string, unknown>) => row as unknown as EvaluatorResult;

const tests = computed(() => props.detail.functionalTests?.tests ?? []);

const evaluatorColumns = computed(() => [
  {
    id: 'name',
    header: '评测器',
    defaultWidth: '140px',
  },
  {
    id: 'status',
    header: '状态',
    defaultWidth: '100px',
  },
  {
    id: 'privateCode',
    header: 'privateCode',
    defaultWidth: '220px',
  },
  {
    id: 'summary',
    header: '摘要',
  },
  {
    id: 'score',
    header: '分数',
    defaultWidth: '80px',
  },
  {
    id: 'evidence',
    header: '证据',
    defaultWidth: '260px',
  },
]);

const testColumns = computed(() => [
  {
    id: 'id',
    header: '测试',
    defaultWidth: '260px',
  },
  {
    id: 'critical',
    header: 'critical',
    defaultWidth: '90px',
  },
  {
    id: 'passed',
    header: '结果',
    defaultWidth: '90px',
  },
  {
    id: 'message',
    header: '信息',
  },
]);
</script>

<template>
  <div class="evaluators">
    <dao-table
      id="evaluator-table"
      :columns="evaluatorColumns"
      :data="asRows(evaluators)"
      hide-toolbar
      hide-setting
      :page-layout="[]"
      empty-text="无评测器结果"
    >
      <template #td-status="{ row }">
        <status-tag :tone="statusTone(row.status as string)">
          {{ row.status }}
        </status-tag>
      </template>
      <template #td-privateCode="{ row }">
        <span class="evaluators__mono">{{ evalOf(row).outcome?.privateCode ?? '—' }}</span>
      </template>
      <template #td-summary="{ row }">
        {{ evalOf(row).outcome?.summary ?? '—' }}
      </template>
      <template #td-score="{ row }">
        {{ formatScore(evalOf(row).outcome?.score) }}
      </template>
      <template #td-evidence="{ row }">
        <span class="evaluators__mono">{{ (evalOf(row).evidenceRefs ?? []).join(', ') || '—' }}</span>
      </template>
    </dao-table>

    <h3 class="evaluators__subtitle">
      功能测试
      <span
        v-if="tests.length"
        class="evaluators__count"
      >{{ tests.filter((t) => t.passed).length }} / {{ tests.length }} 通过</span>
    </h3>
    <dao-table
      id="functional-test-table"
      :columns="testColumns"
      :data="asRows(tests)"
      hide-toolbar
      hide-setting
      :page-layout="[]"
      empty-text="无功能测试记录"
    >
      <template #td-critical="{ row }">
        <status-tag
          v-if="row.critical"
          tone="warning"
          size="sm"
        >
          critical
        </status-tag>
        <span v-else>—</span>
      </template>
      <template #td-passed="{ row }">
        <status-tag :tone="row.passed ? 'success' : 'error'">
          {{ row.passed ? 'passed' : 'failed' }}
        </status-tag>
      </template>
      <template #td-message="{ row }">
        {{ row.message ?? '—' }}
      </template>
    </dao-table>
  </div>
</template>

<style lang="scss" scoped>
.evaluators {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding-top: 16px;

  &__subtitle {
    display: flex;
    gap: 12px;
    align-items: baseline;
    margin: 8px 0 0;
    font-size: 14px;
    font-weight: 600;
  }

  &__count {
    font-size: 12px;
    font-weight: 400;
    color: var(--dao-text-secondary);
  }

  &__mono {
    font-family: Menlo, Monaco, Consolas, monospace;
    font-size: 12px;
  }
}
</style>
