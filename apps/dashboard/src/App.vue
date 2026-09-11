<script lang="ts" setup>
import { DaoPopperContentWrapper } from '@dao-style/core';
import { onErrorCaptured } from 'vue';
import { DialogWrapper as DaoStyleDialogWrapper, disableDialogWrapperWarning } from '@dao-style/extend';

onErrorCaptured(disableDialogWrapperWarning);

const navItems = [
  {
    name: 'RunList',
    label: 'Run 列表',
    match: /^\/runs/,
  },
  {
    name: 'Compare',
    label: '模型对比',
    match: /^\/compare/,
  },
];

const route = useRoute();
</script>

<template>
  <div class="app-shell">
    <header class="app-nav">
      <span class="app-nav__brand">FE Agent Benchmark</span>
      <nav class="app-nav__links">
        <router-link
          v-for="item in navItems"
          :key="item.name"
          :to="{ name: item.name }"
          class="app-nav__link"
          :class="{ 'app-nav__link--active': item.match.test(route.path) }"
        >
          {{ item.label }}
        </router-link>
      </nav>
    </header>
    <main class="app-main">
      <router-view />
    </main>
  </div>

  <dao-style-dialog-wrapper />
  <dao-popper-content-wrapper class="dao-popper-content" />
</template>

<style lang="scss">
@use '@/assets/styles/tailwind.scss';

#app {
  font-size: 13px;
}

.app-shell {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  background-color: var(--dao-bg);
}

.app-nav {
  display: flex;
  gap: 32px;
  align-items: center;
  height: 48px;
  padding: 0 24px;
  background-color: var(--dao-navigation-bg, #1c2133);
  box-shadow: 0 1px 0 rgba(0, 0, 0, 0.12);

  &__brand {
    font-size: 15px;
    font-weight: 600;
    color: #fff;
  }

  &__links {
    display: flex;
    gap: 4px;
  }

  &__link {
    padding: 6px 12px;
    font-size: 13px;
    color: rgba(255, 255, 255, 0.72);
    text-decoration: none;
    border-radius: 4px;

    &:hover {
      color: #fff;
      background-color: rgba(255, 255, 255, 0.08);
    }

    &--active {
      color: #fff;
      background-color: rgba(255, 255, 255, 0.16);
    }
  }
}

.app-main {
  flex: 1;
  padding: 20px 24px 40px;
}

// dao-card lays its default slot out as a flex row; our cards always hold a single vertical block.
.dao-card .dao-card-item-container {
  flex-direction: column;
  align-items: stretch;
  width: 100%;

  > * {
    width: 100%;
  }
}

// FIXME: 组件库修复之后移除
.dao-popper-content .dao-popper {
  z-index: 1070; // 解决在有其他popper（例如dropdown） 的情况下可以显示
}
</style>
