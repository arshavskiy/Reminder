<template>
  <div :class="{ 'mobile-filter-panel--open': open }" class="mobile-filter-panel">
    <slot name="search"/>
    <button :aria-expanded="open" class="btn btn--ghost mobile-filter-panel__toggle" type="button"
            @click="open = !open">
      <n-icon :component="FunnelOutline" :size="16"/>
      {{ locale === "he" ? "סינון" : "Filters" }}
      <span v-if="activeCount" class="mobile-filter-panel__count">{{ activeCount }}</span>
      <n-icon :component="open ? ChevronUpOutline : ChevronDownOutline" :size="14"/>
    </button>
    <div class="mobile-filter-panel__fields">
      <slot/>
    </div>
  </div>
</template>

<script lang="ts" setup>
import {ref} from "vue";
import {NIcon} from "naive-ui";
import {ChevronDownOutline, ChevronUpOutline, FunnelOutline} from "@vicons/ionicons5";
import {useI18n} from "../composables/useI18n.js";

defineProps<{ activeCount?: number }>();
const {locale} = useI18n();
const open = ref(false);
</script>

<style scoped>
.mobile-filter-panel__toggle {
  display: none;
}

.mobile-filter-panel__fields {
  display: contents;
}

@media (max-width: 640px) {
  .mobile-filter-panel.mobile-filter-panel {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 6px;
    align-items: center;
  }

  .mobile-filter-panel :deep(.toolbar__search) {
    grid-column: auto;
    min-width: 0;
    width: 100%;
  }

  .mobile-filter-panel__toggle {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    min-height: 34px;
    padding: 4px 8px;
    font-size: 12px;
  }

  .mobile-filter-panel__fields {
    display: none;
  }

  .mobile-filter-panel--open > .mobile-filter-panel__fields {
    display: grid;
    grid-column: 1 / -1;
    grid-template-columns: minmax(0, 1fr);
    gap: 6px;
    padding: 8px;
    border: 1px solid var(--border-color);
    border-radius: var(--radius-md);
  }

  .mobile-filter-panel__fields > :deep(*) {
    min-width: 0;
    max-width: 100%;
    width: 100%;
  }

  .mobile-filter-panel__count {
    color: var(--brand-color);
    font-weight: 700;
  }
}
</style>
