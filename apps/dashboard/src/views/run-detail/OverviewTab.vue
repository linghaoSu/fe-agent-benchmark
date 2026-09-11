<script setup lang="ts">
import { SCORE_NAMES, type RunDetail } from '@/api/types';
import CodeBlock from '@/components/CodeBlock.vue';
import StatusTag from '@/components/StatusTag.vue';
import {
  extensionsOf, formatCost, formatInt, formatScore, formatSeconds, prettyJson, resultJsonOf, statusTone,
} from '@/utils/format';

const props = defineProps<{ detail: RunDetail }>();

const extensions = computed(() => extensionsOf(resultJsonOf(props.detail)));
const gates = computed(() => Object.entries(extensions.value.gates ?? {}));
const dimensions = computed(() => Object.entries(extensions.value.dimensions ?? {}));

const SCORE_LABELS: Record<string, string> = {
  build: '构建',
  functional: '功能',
  visual: '视觉',
  responsive: '响应式',
  accessibility: '可访问性',
  engineering: '工程',
};
const scoreCards = computed(() => SCORE_NAMES.map((name) => ({
  name,
  label: SCORE_LABELS[name] ?? name,
  value: props.detail.summary.scores?.[name] ?? null,
})));

const efficiencyRows = computed(() => {
  const e = props.detail.summary.efficiency;

  if (!e) return [];

  return [
    {
      label: '输入 tokens',
      value: formatInt(e.inputTokens),
    },
    {
      label: '输出 tokens',
      value: formatInt(e.outputTokens),
    },
    {
      label: '工具调用',
      value: formatInt(e.toolCalls),
    },
    {
      label: '工具输出字节',
      value: formatInt(e.toolOutputBytes),
    },
    {
      label: '耗时',
      value: formatSeconds(e.wallTimeSeconds),
    },
    {
      label: '成本',
      value: formatCost(e.costUsd),
    },
  ];
});

const showInput = ref(false);
const resolvedInput = computed(() => prettyJson(props.detail.run?.resolvedInputJson));
</script>

<template>
  <div class="overview">
    <div class="overview__grid">
      <dao-card
        type="simple"
        title="门禁 (gates)"
      >
        <div class="overview__tags">
          <status-tag
            v-for="[name, state] in gates"
            :key="name"
            :tone="statusTone(state)"
          >
            {{ name }}: {{ state }}
          </status-tag>
          <span
            v-if="!gates.length"
            class="overview__muted"
          >无数据</span>
        </div>
      </dao-card>
      <dao-card
        type="simple"
        title="维度 (dimensions)"
      >
        <div class="overview__tags">
          <status-tag
            v-for="[name, state] in dimensions"
            :key="name"
            :tone="statusTone(state)"
          >
            {{ name }}: {{ state }}
          </status-tag>
          <span
            v-if="!dimensions.length"
            class="overview__muted"
          >无数据</span>
        </div>
      </dao-card>
    </div>

    <div class="overview__scores">
      <dao-card
        v-for="card in scoreCards"
        :key="card.name"
        type="simple"
        class="overview__score-card"
      >
        <div class="overview__score-label">
          {{ card.label }}
        </div>
        <div class="overview__score-value">
          {{ formatScore(card.value) }}
        </div>
      </dao-card>
      <dao-card
        type="simple"
        class="overview__score-card overview__score-card--quality"
      >
        <div class="overview__score-label">
          quality
        </div>
        <div class="overview__score-value">
          {{ formatScore(detail.summary.quality) }}
        </div>
      </dao-card>
    </div>

    <div class="overview__grid">
      <dao-card
        type="simple"
        title="效率"
      >
        <dl
          v-if="efficiencyRows.length"
          class="overview__kv"
        >
          <template
            v-for="row in efficiencyRows"
            :key="row.label"
          >
            <dt>{{ row.label }}</dt>
            <dd>{{ row.value }}</dd>
          </template>
        </dl>
        <span
          v-else
          class="overview__muted"
        >无效率数据</span>
      </dao-card>
      <dao-card
        type="simple"
        title="环境指纹"
      >
        <dl class="overview__kv">
          <dt>bundleChecksum</dt>
          <dd class="overview__mono">
            {{ detail.summary.bundleChecksum }}
          </dd>
          <dt>imageDigest</dt>
          <dd class="overview__mono">
            {{ detail.summary.fingerprint?.imageDigest ?? '—' }}
          </dd>
          <dt>dependencyCacheSnapshotId</dt>
          <dd class="overview__mono">
            {{ detail.summary.fingerprint?.dependencyCacheSnapshotId ?? '—' }}
          </dd>
          <dt>networkPolicyId</dt>
          <dd class="overview__mono">
            {{ detail.summary.fingerprint?.networkPolicyId ?? '—' }}
          </dd>
          <dt>inputHash</dt>
          <dd class="overview__mono">
            {{ detail.run?.inputHash ?? '—' }}
          </dd>
        </dl>
      </dao-card>
    </div>

    <dao-card
      type="simple"
      title="Resolved Input"
    >
      <template #action>
        <dao-button
          type="ghost"
          size="sm"
          @click="showInput = !showInput"
        >
          {{ showInput ? '收起' : '展开' }}
        </dao-button>
      </template>
      <code-block
        v-if="showInput"
        :text="resolvedInput || '（空）'"
      />
      <span
        v-else
        class="overview__muted"
      >点击“展开”查看解析后的输入 JSON</span>
    </dao-card>
  </div>
</template>

<style lang="scss" scoped>
.overview {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding-top: 16px;

  &__grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(360px, 1fr));
    gap: 16px;
  }

  &__tags {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  &__scores {
    display: grid;
    grid-template-columns: repeat(7, minmax(0, 1fr));
    gap: 12px;
  }

  &__score-card {
    text-align: center;

    &--quality :deep(.dao-card-container) {
      background-color: var(--dao-bg-secondary);
    }
  }

  &__score-label {
    font-size: 12px;
    color: var(--dao-text-secondary);
  }

  &__score-value {
    margin-top: 4px;
    font-size: 22px;
    font-weight: 600;
    color: var(--dao-text-primary);
  }

  &__kv {
    display: grid;
    grid-template-columns: max-content 1fr;
    gap: 6px 16px;
    margin: 0;

    dt {
      color: var(--dao-text-secondary);
    }

    dd {
      margin: 0;
      word-break: break-all;
    }
  }

  &__mono {
    font-family: Menlo, Monaco, Consolas, monospace;
    font-size: 12px;
  }

  &__muted {
    color: var(--dao-text-tertiary);
  }
}
</style>
