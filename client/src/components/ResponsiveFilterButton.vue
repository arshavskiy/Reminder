<template>
  <n-tooltip>
    <template #trigger>
      <button :aria-label="label" class="btn btn--ghost btn--xs icon-btn responsive-filter-button" type="button"
              v-bind="$attrs">
        <n-icon :component="icon" :size="16" class="responsive-filter-button__icon"/>
        <span class="responsive-filter-button__label">{{ label }}</span>
        <span v-if="count !== undefined" class="responsive-filter-button__count">{{ count }}</span>
      </button>
    </template>
    {{ label }}
  </n-tooltip>
</template>

<script lang="ts" setup>
import {computed} from "vue";
import {NIcon, NTooltip} from "naive-ui";
import {
  AppsOutline,
  BusinessOutline,
  CalendarOutline,
  CheckmarkCircleOutline,
  CopyOutline,
  DocumentTextOutline,
  FunnelOutline,
  HourglassOutline,
  MailOutline,
  PersonOutline,
  ReceiptOutline,
  WarningOutline
} from "@vicons/ionicons5";

defineOptions({inheritAttrs: false});
const props = defineProps<{ label: string; count?: number; filterKey?: string | null }>();
const icon = computed(() => {
  const key = props.filterKey || "all";
  if (key === "all") return AppsOutline;
  if (/duplicate/.test(key)) return CopyOutline;
  if (/error|expired|overdue|bounced/.test(key)) return WarningOutline;
  if (/email|mail/.test(key)) return MailOutline;
  if (/progress|processing|pending/.test(key)) return HourglassOutline;
  if (/done|sent|paid|success/.test(key)) return CheckmarkCircleOutline;
  if (/month|date|reminder/.test(key)) return CalendarOutline;
  if (key === "person") return PersonOutline;
  if (key === "company") return BusinessOutline;
  if (/invoice|receipt|expense/.test(key)) return ReceiptOutline;
  if (/document|inspection|report|template/.test(key)) return DocumentTextOutline;
  return FunnelOutline;
});
</script>

<style scoped>
.responsive-filter-button__icon {
  display: none;
}

.responsive-filter-button__count {
  min-width: 20px;
  padding: 1px 6px;
  border-radius: 999px;
  background: var(--bg-hover);
  font-size: 11px;
  font-weight: 700;
}

@media (max-width: 640px) {
  .responsive-filter-button.responsive-filter-button {
    min-width: 40px;
    min-height: 40px;
    width: auto;
    padding: 6px 8px;
    gap: 5px;
    flex: 0 0 auto;
    justify-content: center;
  }

  .responsive-filter-button__icon {
    display: inline-flex;
  }

  .responsive-filter-button__label {
    display: none;
  }
}
</style>
