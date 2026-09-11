<script setup lang="ts">
import { api } from '@/api/client';
import { useAsync } from '@/composables/useAsync';
import SolvedTag from '@/components/SolvedTag.vue';
import StatusTag from '@/components/StatusTag.vue';
import { formatTime, resultJsonOf, statusTone } from '@/utils/format';
import OverviewTab from './run-detail/OverviewTab.vue';
import EvaluatorsTab from './run-detail/EvaluatorsTab.vue';
import ScreenshotsTab from './run-detail/ScreenshotsTab.vue';
import PatchTab from './run-detail/PatchTab.vue';
import ToolCallsTab from './run-detail/ToolCallsTab.vue';
import EventsTab from './run-detail/EventsTab.vue';
import TransitionsTab from './run-detail/TransitionsTab.vue';

const props = defineProps<{ runId: string }>();

const detail = useAsync(() => api.getRun(props.runId));

watch(() => props.runId, () => detail.run());

const activeTab = ref('overview');
const summary = computed(() => detail.data.value?.summary);
const resultJson = computed(() => resultJsonOf(detail.data.value));

const headerFields = computed(() => {
  const s = summary.value;

  if (!s) return [];

  return [
    {
      label: '任务',
      value: `${s.taskId} @v${s.taskVersion}`,
    },
    {
      label: '模型',
      value: s.model,
    },
    {
      label: 'seed',
      value: String(s.seed),
    },
    {
      label: 'budgetProfile',
      value: s.budgetProfile ?? '—',
    },
    {
      label: 'network',
      value: s.network ?? '—',
    },
    {
      label: '执行分类',
      value: s.executionClassification ?? '—',
    },
    {
      label: '创建时间',
      value: formatTime(s.createdAt),
    },
    {
      label: '完成时间',
      value: formatTime(s.finishedAt),
    },
    {
      label: '数据库',
      value: s.db,
    },
  ];
});
</script>

<template>
  <div class="run-detail">
    <dao-header type="3rd">
      <template #breadcrumb>
        <dao-breadcrumb>
          <dao-breadcrumb-item
            label="Run 列表"
            :to="{ name: 'RunList' }"
          />
          <dao-breadcrumb-item :label="runId" />
        </dao-breadcrumb>
      </template>
      <template #action>
        <dao-button
          type="secondary"
          icon-left="icon-refresh"
          :loading="detail.loading.value"
          @click="detail.run()"
        >
          刷新
        </dao-button>
      </template>
    </dao-header>

    <div
      v-if="detail.error.value"
      class="run-detail__error"
    >
      加载失败：{{ detail.error.value }}
    </div>

    <dao-card
      v-if="summary"
      type="headless"
      class="run-detail__header-card"
    >
      <div class="run-detail__title-row">
        <span class="run-detail__run-id">{{ summary.runId }}</span>
        <status-tag :tone="statusTone(summary.status)">
          {{ summary.status }}
        </status-tag>
        <solved-tag
          :solved="summary.solved"
          :result-json="resultJson"
        />
      </div>
      <dl class="run-detail__fields">
        <div
          v-for="field in headerFields"
          :key="field.label"
          class="run-detail__field"
        >
          <dt>{{ field.label }}</dt>
          <dd>{{ field.value }}</dd>
        </div>
      </dl>
    </dao-card>

    <dao-tabs
      v-if="detail.data.value"
      v-model="activeTab"
      type="line"
      class="run-detail__tabs"
    >
      <dao-tab-item
        value="overview"
        label="概览"
      >
        <overview-tab :detail="detail.data.value" />
      </dao-tab-item>
      <dao-tab-item
        value="evaluators"
        label="评测器"
      >
        <evaluators-tab :detail="detail.data.value" />
      </dao-tab-item>
      <dao-tab-item
        value="screenshots"
        label="截图"
      >
        <screenshots-tab :detail="detail.data.value" />
      </dao-tab-item>
      <dao-tab-item
        value="patch"
        label="补丁"
      >
        <patch-tab
          v-if="activeTab === 'patch'"
          :run-id="runId"
        />
      </dao-tab-item>
      <dao-tab-item
        value="tools"
        label="工具调用"
      >
        <tool-calls-tab :tool-calls="detail.data.value.toolCalls" />
      </dao-tab-item>
      <dao-tab-item
        value="events"
        label="事件"
      >
        <events-tab :events="detail.data.value.events" />
      </dao-tab-item>
      <dao-tab-item
        value="transitions"
        label="状态机"
      >
        <transitions-tab :detail="detail.data.value" />
      </dao-tab-item>
    </dao-tabs>

    <dao-empty
      v-else-if="!detail.loading.value && !detail.error.value"
      title="未找到 Run"
    />
  </div>
</template>

<style lang="scss" scoped>
.run-detail {
  &__error {
    padding: 8px 12px;
    margin: 12px 0;
    color: rgb(var(--dao-tag-error-rgb));
    background-color: rgb(var(--dao-tag-bg-error-rgb));
    border-radius: 4px;
  }

  &__header-card {
    margin: 16px 0;
  }

  &__title-row {
    display: flex;
    gap: 12px;
    align-items: center;
    margin-bottom: 12px;
  }

  &__run-id {
    font-family: Menlo, Monaco, Consolas, monospace;
    font-size: 14px;
    font-weight: 600;
    color: var(--dao-text-primary);
  }

  &__fields {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
    gap: 8px 24px;
    margin: 0;
  }

  &__field {
    dt {
      font-size: 12px;
      color: var(--dao-text-secondary);
    }

    dd {
      margin: 2px 0 0;
      color: var(--dao-text-primary);
      word-break: break-all;
    }
  }

  &__tabs {
    margin-top: 8px;
  }
}
</style>
