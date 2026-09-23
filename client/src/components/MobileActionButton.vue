<template>
  <n-tooltip>
    <template #trigger>
      <button :aria-label="label" class="btn btn--ghost btn--xs icon-btn mobile-action" type="button" v-bind="$attrs">
        <slot name="icon"/>
        <span class="mobile-action__label"><slot/></span>
      </button>
    </template>
    {{ label }}
  </n-tooltip>
</template>

<script lang="ts" setup>
import {NTooltip} from "naive-ui";

defineOptions({inheritAttrs: false});
defineProps<{ label: string }>();
</script>

<style scoped>
@media (max-width: 640px) {
  .mobile-action.mobile-action {
    width: 36px;
    min-width: 36px;
    height: 36px;
    min-height: 36px;
    padding: 6px;
    flex: 0 0 auto;
    justify-content: center;
    gap: 0;
  }

  .mobile-action__label {
    display: none;
  }

  .mobile-action :deep(.btn-icon) {
    margin: 0;
    font-size: 16px;
  }
}
</style>
