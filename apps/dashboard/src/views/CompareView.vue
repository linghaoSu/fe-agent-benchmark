<script setup lang="ts">
import {
  api, asRows, SCORE_NAMES, type Configuration,
} from '@/api/client';
import { useAsync } from '@/composables/useAsync';
import StatusTag from '@/components/StatusTag.vue';
import {
  formatCost, formatInt, formatPercent, formatScore, formatSeconds,
} from '@/utils/format';

const tasks = useAsync(() => api.listTasks());

const form = reactive({
  task: '',
  k: 1,
  models: [] as string[],
});

const taskOptions = computed(() => (tasks.data.value ?? []).map((task) => task.taskId));
const selectedTask = computed(() => (tasks.data.value ?? []).find((task) => task.taskId === form.task));
const modelOptions = computed(() => Object.entries(selectedTask.value?.byModel ?? {})
  .map(([model, stat]) => ({
    model,
    label: `${model}（${stat.solved}/${stat.runs} solved）`,
  })));

// Reset the model selection when the task changes so we never query models the task has no Runs for.
watch(() => form.task, () => {
  form.models = modelOptions.value.map((option) => option.model);
});

const kNumber = computed(() => Math.max(1, Math.floor(Number(form.k) || 1)));
const canCompare = computed(() => Boolean(form.task) && form.models.length > 0);

const result = useAsync(() => api.compare(form.task, kNumber.value, form.models), false);
const compare = () => {
  if (canCompare.value) result.run();
};

const SCORE_LABELS: Record<string, string> = {
  build: '构建',
  functional: '功能',
  visual: '视觉',
  responsive: '响应式',
  accessibility: '可访问性',
  engineering: '工程',
};

const columns = computed(() => [
  {
    id: 'configurationId',
    header: '模型',
    defaultWidth: '220px',
  },
  {
    id: 'n',
    header: 'n',
    defaultWidth: '50px',
  },
  {
    id: 'solved',
    header: 'solved',
    defaultWidth: '70px',
  },
  {
    id: 'successAtK',
    header: `success@${result.data.value?.k ?? kNumber.value}`,
    defaultWidth: '100px',
  },
  ...SCORE_NAMES.map((name) => ({
    id: `score_${name}`,
    header: SCORE_LABELS[name] ?? name,
    defaultWidth: '80px',
  })),
  {
    id: 'tokens',
    header: 'tokens (in/out)',
    defaultWidth: '140px',
  },
  {
    id: 'wall',
    header: '平均耗时',
    defaultWidth: '90px',
  },
  {
    id: 'cost',
    header: '平均成本',
    defaultWidth: '90px',
  },
]);

const rows = computed(() => (result.data.value?.configurations ?? []).map((config: Configuration) => ({
  ...config,
  n: config.runs.length,
  solvedCount: config.runs.filter((run) => run.solved === true).length,
})));

type Row = typeof rows.value[number];

const scoreOf = (row: Row, name: string) => row.summary?.meanScores?.[name as keyof typeof row.summary.meanScores];
</script>

<template>
  <div class="compare">
    <dao-header
      type="2nd"
      title="模型对比"
    />

    <div class="compare__form">
      <label class="compare__field">
        <span class="compare__label">任务</span>
        <dao-select
          v-model="form.task"
          search
          placeholder="选择任务"
          class="w-[280px]"
        >
          <dao-option
            v-for="task in taskOptions"
            :key="task"
            :value="task"
            :label="task"
          />
        </dao-select>
      </label>
      <label class="compare__field">
        <span class="compare__label">k</span>
        <dao-input
          v-model="form.k"
          type="number"
          min="1"
          class="w-[100px]"
        />
      </label>
      <label class="compare__field compare__field--grow">
        <span class="compare__label">模型（多选）</span>
        <dao-select
          v-model="form.models"
          multiple
          :disabled="!form.task"
          :placeholder="form.task ? '选择模型' : '请先选择任务'"
          class="compare__models"
        >
          <dao-option
            v-for="option in modelOptions"
            :key="option.model"
            :value="option.model"
            :label="option.label"
          />
        </dao-select>
      </label>
      <dao-button
        :disabled="!canCompare"
        :loading="result.loading.value"
        @click="compare"
      >
        对比
      </dao-button>
    </div>

    <div
      v-if="result.error.value"
      class="compare__error"
    >
      对比失败：{{ result.error.value }}
    </div>

    <dao-empty
      v-if="!result.data.value && !result.loading.value"
      title="尚未对比"
      helper="选择任务、k 与模型后点击“对比”"
      class="compare__empty"
    />

    <dao-table
      v-else
      id="compare-table"
      :columns="columns"
      :data="asRows(rows)"
      :loading="result.loading.value"
      hide-toolbar
      hide-setting
      :page-layout="[]"
      empty-text="所选模型在该任务下没有 Run"
    >
      <template #td-configurationId="{ row }">
        <div class="compare__model">
          <span>{{ row.configurationId }}</span>
          <status-tag
            v-if="!row.comparable"
            tone="warning"
            size="sm"
          >
            环境不一致
          </status-tag>
        </div>
      </template>
      <template #td-solved="{ row }">
        {{ (row as unknown as Row).solvedCount }}
      </template>
      <template #td-successAtK="{ row }">
        {{ formatPercent((row as unknown as Row).summary?.successAtK) }}
      </template>
      <template
        v-for="name in SCORE_NAMES"
        :key="name"
        #[`td-score_${name}`]="{ row }"
      >
        {{ formatScore(scoreOf(row as Row, name)) }}
      </template>
      <template #td-tokens="{ row }">
        {{ formatInt((row as unknown as Row).meanInputTokens) }} / {{ formatInt((row as unknown as Row).meanOutputTokens) }}
      </template>
      <template #td-wall="{ row }">
        {{ formatSeconds((row as unknown as Row).summary?.meanWallTimeSeconds) }}
      </template>
      <template #td-cost="{ row }">
        {{ formatCost((row as unknown as Row).summary?.meanCostUsd) }}
      </template>
    </dao-table>

    <p
      v-if="rows.some((row) => !row.comparable)"
      class="compare__hint"
    >
      “环境不一致”表示该配置下的 Run 使用了不同的镜像/依赖缓存/网络策略指纹，对比结果仅供参考。
    </p>
  </div>
</template>

<style lang="scss" scoped>
.compare {
  &__form {
    display: flex;
    flex-wrap: wrap;
    gap: 16px;
    align-items: flex-end;
    margin: 16px 0;
  }

  &__field {
    display: flex;
    flex-direction: column;
    gap: 4px;

    &--grow {
      flex: 1;
      min-width: 320px;
    }
  }

  &__models {
    width: 100%;
    min-width: 420px;
  }

  &__label {
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

  &__empty {
    padding: 48px 0;
  }

  &__model {
    display: flex;
    gap: 8px;
    align-items: center;
  }

  &__hint {
    margin-top: 12px;
    font-size: 12px;
    color: var(--dao-text-secondary);
  }
}
</style>
