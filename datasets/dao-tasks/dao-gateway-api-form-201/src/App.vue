<script lang="ts" setup>
import { DaoPopperContentWrapper } from '@dao-style/core';
import { onErrorCaptured } from 'vue';
import { DialogWrapper as DaoStyleDialogWrapper, disableDialogWrapperWarning } from '@dao-style/extend';

onErrorCaptured(disableDialogWrapperWarning);
</script>

<template>
  <router-view />

  <dao-style-dialog-wrapper />
  <dao-popper-content-wrapper class="dao-popper-content" />
</template>

<style lang="scss">
@use '@/assets/styles/tailwind.scss';

#app {
  font-size: 13px;
}

// FIXME: 组件库修复之后移除
.dao-popper-content .dao-popper {
  z-index: 1070; // 解决在有其他popper（例如dropdown） 的情况下可以显示
}
</style>
