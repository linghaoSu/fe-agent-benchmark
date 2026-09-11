<script setup lang="ts">
import { api, asRows, type RunSummary } from '@/api/client';
import { useAsync } from '@/composables/useAsync';
import SolvedTag from '@/components/SolvedTag.vue';
import StatusTag from '@/components/StatusTag.vue';
import {
  formatScore, formatSeconds, formatTime, formatTokens, resultJsonOf, statusTone,
} from '@/utils/format';

const router = useRouter();

const filters = reactive({
  task: '',
  model: '',
  status: '',
});
const PAGE_SIZE = 20;
const currentPage = ref(1);

const tasks = useAsync(() => api.listTasks());
// Load the unfiltered list once so the model dropdown covers every model, not just the filtered rows.
const allRuns = useAsync(() => api.listRuns());
const runs = useAsync(() => api.listRuns({ ...filters }));

watch(filters, () => {
  currentPage.value = 1;
  runs.run();
});

const taskOptions = computed(() => (tasks.data.value ?? []).map((task) => task.taskId));
const modelOptions = computed(() => [...new Set((allRuns.data.value ?? []).map((run) => run.model))].sort());
const statusOptions = ['COMPLETED', 'FAILED'];

const total = computed(() => runs.data.value?.length ?? 0);
const pageRows = computed<RunSummary[]>(() => {
  const start = (currentPage.value - 1) * PAGE_SIZE;

  return (runs.data.value ?? []).slice(start, start + PAGE_SIZE);
});

// RunSummary carries no gates, so for unsolved rows on the current page we lazily fetch the detail once and
// cache its result JSON; SolvedTag derives the failed gate name from it (falls back to "unsolved" meanwhile).
const resultJsonByRun = reactive<Record<string, string>>({});

watch(pageRows, (rows) => {
  rows.filter((row) => row.solved === false && !(row.runId in resultJsonByRun)).forEach(async (row) => {
    resultJsonByRun[row.runId] = '';
    try {
      const detail = await api.getRun(row.runId);

      resultJsonByRun[row.runId] = resultJsonOf(detail) ?? '';
    } catch {
      // keep the plain "unsolved" label
    }
  });
}, { immediate: true });

const columns = computed(() => [
  {
    id: 'taskId',
    header: '任务',
    defaultWidth: '190px',
  },
  {
    id: 'model',
    header: '模型',
    defaultWidth: '170px',
  },
  {
    id: 'seed',
    header: 'seed',
    defaultWidth: '60px',
  },
  {
    id: 'status',
    header: '状态',
    defaultWidth: '110px',
  },
  {
    id: 'solved',
    header: '结论',
    defaultWidth: '190px',
  },
  {
    id: 'functional',
    header: '功能',
    defaultWidth: '70px',
  },
  {
    id: 'visual',
    header: '视觉',
    defaultWidth: '70px',
  },
  {
    id: 'responsive',
    header: '响应式',
    defaultWidth: '70px',
  },
  {
    id: 'accessibility',
    header: '可访问性',
    defaultWidth: '80px',
  },
  {
    id: 'engineering',
    header: '工程',
    defaultWidth: '70px',
  },
  {
    id: 'quality',
    header: 'quality',
    defaultWidth: '70px',
  },
  {
    id: 'tokens',
    header: 'tokens (in/out)',
    defaultWidth: '130px',
  },
  {
    id: 'wallTime',
    header: '耗时',
    defaultWidth: '80px',
  },
  {
    id: 'createdAt',
    header: '创建时间',
    defaultWidth: '160px',
  },
]);

const openRun = (row: Record<string, unknown>) => {
  router.push({
    name: 'RunDetail',
    params: { runId: String(row.runId) },
  });
};
</script>

<template>
  <div class="run-list">
    <dao-header
      type="2nd"
      title="Run 列表"
    />

    <div class="run-list__filters">
      <label class="run-list__filter">
        <span class="run-list__filter-label">任务</span>
        <dao-select
          v-model="filters.task"
          clearable
          search
          placeholder="全部任务"
          class="w-[260px]"
        >
          <dao-option
            v-for="task in taskOptions"
            :key="task"
            :value="task"
            :label="task"
          />
        </dao-select>
      </label>
      <label class="run-list__filter">
        <span class="run-list__filter-label">模型</span>
        <dao-select
          v-model="filters.model"
          clearable
          placeholder="全部模型"
          class="w-[220px]"
        >
          <dao-option
            v-for="model in modelOptions"
            :key="model"
            :value="model"
            :label="model"
          />
        </dao-select>
      </label>
      <label class="run-list__filter">
        <span class="run-list__filter-label">状态</span>
        <dao-select
          v-model="filters.status"
          clearable
          placeholder="全部"
          class="w-[160px]"
        >
          <dao-option
            v-for="status in statusOptions"
            :key="status"
            :value="status"
            :label="status"
          />
        </dao-select>
      </label>
      <dao-button
        type="secondary"
        icon-left="icon-refresh"
        :loading="runs.loading.value"
        @click="runs.run()"
      >
        刷新
      </dao-button>
    </div>

    <div
      v-if="runs.error.value"
      class="run-list__error"
    >
      加载失败：{{ runs.error.value }}
    </div>

    <dao-table
      id="run-list-table"
      :columns="columns"
      :data="asRows(pageRows)"
      :loading="runs.loading.value"
      hide-toolbar
      hide-setting
      :page-layout="[]"
      highlight
      class="run-list__table"
      @row-click="openRun"
    >
      <template #td-status="{ row }">
        <status-tag :tone="statusTone(row.status as string)">
          {{ row.status }}
        </status-tag>
      </template>
      <template #td-solved="{ row }">
        <solved-tag
          :solved="(row as unknown as RunSummary).solved"
          :result-json="resultJsonByRun[row.runId as string] || undefined"
        />
      </template>
      <template #td-functional="{ row }">
        {{ formatScore((row as unknown as RunSummary).scores?.functional) }}
      </template>
      <template #td-visual="{ row }">
        {{ formatScore((row as unknown as RunSummary).scores?.visual) }}
      </template>
      <template #td-responsive="{ row }">
        {{ formatScore((row as unknown as RunSummary).scores?.responsive) }}
      </template>
      <template #td-accessibility="{ row }">
        {{ formatScore((row as unknown as RunSummary).scores?.accessibility) }}
      </template>
      <template #td-engineering="{ row }">
        {{ formatScore((row as unknown as RunSummary).scores?.engineering) }}
      </template>
      <template #td-quality="{ row }">
        {{ formatScore((row as unknown as RunSummary).quality) }}
      </template>
      <template #td-tokens="{ row }">
        {{ formatTokens((row as unknown as RunSummary).efficiency?.inputTokens, (row as unknown as RunSummary).efficiency?.outputTokens) }}
      </template>
      <template #td-wallTime="{ row }">
        {{ formatSeconds((row as unknown as RunSummary).efficiency?.wallTimeSeconds) }}
      </template>
      <template #td-createdAt="{ row }">
        {{ formatTime(row.createdAt as string) }}
      </template>
      <template #empty>
        <dao-empty
          title="暂无 Run"
          helper="调整筛选条件或等待新的评测结果写入 runs 目录"
        />
      </template>
    </dao-table>

    <dao-pagination
      v-if="total > 0"
      v-model:current-page="currentPage"
      :page-size="PAGE_SIZE"
      :total="total"
      :layout="['total', 'pager']"
      :total-format="(val: number) => `共 ${val} 条`"
      class="run-list__pagination"
    />
  </div>
</template>

<style lang="scss" scoped>
.run-list {
  &__filters {
    display: flex;
    flex-wrap: wrap;
    gap: 16px;
    align-items: flex-end;
    margin: 16px 0;
  }

  &__filter {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  &__filter-label {
    font-size: 12px;
    color: var(--dao-text-secondary);
  }

  &__error {
    padding: 8px 12px;
    margin-bottom: 12px;
    color: rgb(var(--dao-tag-error-rgb));
    background-color: rgb(var(--dao-tag-bg-error-rgb));
    border-radius: 4px;
  }

  &__table :deep(tbody tr) {
    cursor: pointer;
  }

  &__pagination {
    margin-top: 12px;
  }
}
</style>
