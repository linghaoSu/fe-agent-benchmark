<script setup lang="ts">
import { api, type RunDetail } from '@/api/client';
import { formatScore } from '@/utils/format';

const props = defineProps<{ detail: RunDetail }>();

const VIEWPORTS = [
  {
    key: 'desktop',
    label: '桌面 (desktop)',
  },
  {
    key: 'tablet',
    label: '平板 (tablet)',
  },
  {
    key: 'mobile',
    label: '移动 (mobile)',
  },
] as const;

const failed = reactive<Record<string, boolean>>({});

const shots = computed(() => VIEWPORTS.map((viewport) => {
  const diff = props.detail.visual?.[`${viewport.key}.diff`];
  const hasArtifact = props.detail.artifacts?.some((artifact) => artifact.relativePath === `screenshots/${viewport.key}.png.json`);
  let caption = '无视觉对比数据';

  if (diff) {
    caption = diff.compared === false
      ? '未进行视觉对比'
      : `mismatch: ${formatScore(diff.mismatch, 4)}  ·  score: ${formatScore(diff.score)}`;
  }

  return {
    ...viewport,
    caption,
    hasArtifact,
    url: api.screenshotUrl(props.detail.summary.runId, viewport.key),
  };
}));
</script>

<template>
  <div class="screenshots">
    <dao-card
      v-for="shot in shots"
      :key="shot.key"
      type="simple"
      :title="shot.label"
      class="screenshots__card"
    >
      <div class="screenshots__caption">
        {{ shot.caption }}
      </div>
      <div
        v-if="!shot.hasArtifact || failed[shot.key]"
        class="screenshots__missing"
      >
        截图不存在
      </div>
      <a
        v-else
        :href="shot.url"
        target="_blank"
        rel="noopener"
      >
        <img
          :src="shot.url"
          :alt="`${shot.key} screenshot`"
          class="screenshots__img"
          loading="lazy"
          @error="failed[shot.key] = true"
        >
      </a>
    </dao-card>
  </div>
</template>

<style lang="scss" scoped>
.screenshots {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
  gap: 16px;
  padding-top: 16px;

  &__caption {
    margin-bottom: 8px;
    font-family: Menlo, Monaco, Consolas, monospace;
    font-size: 12px;
    color: var(--dao-text-secondary);
  }

  &__img {
    display: block;
    width: 100%;
    height: auto;
    border: 1px solid var(--dao-line-divider);
    border-radius: 4px;
  }

  &__missing {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 160px;
    color: var(--dao-text-tertiary);
    background-color: var(--dao-bg-secondary);
    border: 1px dashed var(--dao-line-divider);
    border-radius: 4px;
  }
}
</style>
